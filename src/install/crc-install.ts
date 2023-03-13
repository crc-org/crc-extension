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

import type { CrcReleaseInfo, Installer } from './base-install';
import { WinInstall } from './win-install';

import { getCrcVersion } from '../crc-cli';
import { getCrcDetectionChecks } from '../detection-checks';
import { MacOsInstall } from './mac-install';

const crcLatestReleaseUrl = 'https://developers.redhat.com/content-gateway/rest/mirror/pub/openshift-v4/clients/crc/latest/release-info.json';

export class CrcInstall {
  private installers = new Map<NodeJS.Platform, Installer>();

  constructor() {
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
    installFinishedFn: () => void,
  ): Promise<void> {

    const latestRelease = await this.downloadLatestReleaseInfo();

    const dialogResult = await extensionApi.window.showInformationMessage(
      `OpenShift Local is not installed on this system, would you like to install OpenShift Local ${latestRelease.version.crcVersion}?`,
      'Yes',
      'No',
    );
    if (dialogResult === 'Yes') {
      const installed = await this.installCrc(latestRelease, logger);
      if(installed) {
        const newInstalledCrc = await getCrcVersion();
        // // write crc version
        // if (newInstalledCrc) {
        //   this.crcInfo.crcVersion = newInstalledCrc.version;
        // }

        // update detections checks
        provider.updateDetectionChecks(getCrcDetectionChecks(newInstalledCrc));
        installFinishedFn();
      }
    } else {
      return;
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
