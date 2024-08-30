/**********************************************************************
 * Copyright (C) 2023 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import * as extensionApi from '@podman-desktop/api';
import got from 'got';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import type { Installer } from './base-install.js';
import { WinInstall } from './win-install.js';

import type { CrcVersion } from '../crc-cli.js';
import { getCrcVersion } from '../crc-cli.js';
import { getCrcDetectionChecks } from '../detection-checks.js';
import { MacOsInstall } from './mac-install.js';
import { needSetup, setUpCrc } from '../crc-setup.js';
import type { CrcReleaseInfo, CrcUpdateInfo } from '../types.js';

import { compare } from 'compare-versions';
import { isFileExists, productName } from '../util.js';

const crcLatestReleaseUrl =
  'https://developers.redhat.com/content-gateway/rest/mirror/pub/openshift-v4/clients/crc/latest/release-info.json';

export interface CrcCliInfo {
  ignoreVersionUpdate?: string;
}
class CrcCliInfoStorage {
  private crcInfo: CrcCliInfo;

  constructor(private readonly storagePath: string) {}

  get ignoreVersionUpdate(): string {
    return this.crcInfo.ignoreVersionUpdate;
  }

  set ignoreVersionUpdate(version: string) {
    if (this.crcInfo.ignoreVersionUpdate !== version) {
      this.crcInfo.ignoreVersionUpdate = version;
      this.writeInfo().catch((err: unknown) => console.error(`Unable to write ${productName} Version`, err));
    }
  }

  private async writeInfo(): Promise<void> {
    try {
      const podmanInfoPath = path.resolve(this.storagePath, 'crc-ext.json');
      await fs.writeFile(podmanInfoPath, JSON.stringify(this.crcInfo));
    } catch (err) {
      console.error(err);
    }
  }

  async loadInfo(): Promise<void> {
    const podmanInfoPath = path.resolve(this.storagePath, 'crc-ext.json');
    if (!(await isFileExists(this.storagePath))) {
      await fs.mkdir(this.storagePath);
    }

    if (!(await isFileExists(podmanInfoPath))) {
      this.crcInfo = {} as CrcCliInfo;
      return;
    }

    try {
      const infoBuffer = await fs.readFile(podmanInfoPath);
      const crcInfo = JSON.parse(infoBuffer.toString('utf8')) as CrcCliInfo;
      this.crcInfo = crcInfo;
      return;
    } catch (err) {
      console.error(err);
    }
    this.crcInfo = {} as CrcCliInfo;
  }
}

export class CrcInstall {
  private installers = new Map<NodeJS.Platform, Installer>();
  private crcCliInfo: CrcCliInfoStorage;

  constructor(private readonly storagePath: string) {
    this.installers.set('win32', new WinInstall());
    this.installers.set('darwin', new MacOsInstall());
  }

  isAbleToInstall(): boolean {
    return this.installers.has(os.platform());
  }

  getInstallChecks(): extensionApi.InstallCheck[] | undefined {
    const installer = this.getInstaller();
    if (installer) {
      return installer.getPreflightChecks();
    }
    return undefined;
  }

  private async downloadLatestReleaseInfo(): Promise<CrcReleaseInfo> {
    return got.get(crcLatestReleaseUrl).json();
  }

  public async doInstallCrc(
    provider: extensionApi.Provider,
    logger: extensionApi.Logger,
    installFinishedFn: (isSetUpFinished: boolean, version?: CrcVersion) => void,
  ): Promise<void> {
    const latestRelease = await this.downloadLatestReleaseInfo();

    const dialogResult = await extensionApi.window.showInformationMessage(
      `OpenShift Local is not installed on this system, would you like to install OpenShift Local ${latestRelease.version.crcVersion}?`,
      'Yes',
      'No',
    );
    if (dialogResult === 'Yes') {
      const installed = await this.installCrc(latestRelease, logger);
      if (installed) {
        const newInstalledCrc = await getCrcVersion();

        // update detections checks
        provider.updateDetectionChecks(getCrcDetectionChecks(newInstalledCrc));
        provider.updateVersion(newInstalledCrc.version);
        let setupResult = false;
        if (await needSetup()) {
          setupResult = await setUpCrc(logger, true);
        }
        installFinishedFn(setupResult, newInstalledCrc);
      }
    } else {
      return;
    }
  }

  async hasUpdate(version: CrcVersion): Promise<CrcUpdateInfo> {
    const latestRelease = await this.downloadLatestReleaseInfo();
    this.crcCliInfo = new CrcCliInfoStorage(this.storagePath);
    await this.crcCliInfo.loadInfo();
    if (
      compare(latestRelease.version.crcVersion, version.version, '>') &&
      this.crcCliInfo.ignoreVersionUpdate !== latestRelease.version.crcVersion
    ) {
      return { hasUpdate: true, newVersion: latestRelease, currentVersion: version.version };
    }

    return { hasUpdate: false, currentVersion: version.version };
  }

  getUpdatePreflightChecks(): extensionApi.InstallCheck[] | undefined {
    const installer = this.getInstaller();
    if (installer) {
      return installer.getUpdatePreflightChecks();
    }
    return undefined;
  }

  async askForUpdate(
    provider: extensionApi.Provider,
    updateInfo: CrcUpdateInfo,
    logger: extensionApi.Logger,
    telemetry: extensionApi.TelemetryLogger,
  ): Promise<void> {
    const newVersion = updateInfo.newVersion.version.crcVersion;
    const answer = await extensionApi.window.showInformationMessage(
      `You have ${productName} ${updateInfo.currentVersion}.\nDo you want to update to ${newVersion}?`,
      'Yes',
      'No',
      'Ignore',
    );
    if (answer === 'Yes') {
      telemetry.logUsage('crc.update.start', { version: newVersion });
      await this.getInstaller().update(updateInfo.newVersion, logger);
      const crcVersion = await getCrcVersion();
      provider.updateDetectionChecks(getCrcDetectionChecks(crcVersion));
      provider.updateVersion(crcVersion.version);
      this.crcCliInfo.ignoreVersionUpdate = undefined;
    } else if (answer === 'Ignore') {
      telemetry.logUsage('crc.update.ignored', { version: newVersion });
      this.crcCliInfo.ignoreVersionUpdate = updateInfo.newVersion.version.crcVersion;
    } else {
      telemetry.logUsage('crc.update.canceled', { version: newVersion });
    }
  }

  private async installCrc(releaseInfo: CrcReleaseInfo, logger: extensionApi.Logger): Promise<boolean> {
    const installer = this.getInstaller();
    if (installer) {
      return installer.install(releaseInfo, logger);
    }
    return false;
  }

  private getInstaller(): Installer | undefined {
    return this.installers.get(os.platform());
  }
}
