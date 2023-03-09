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
import * as os from 'node:os';

import type { Installer } from './base-install';
import { WinInstall } from './win-install';

import * as bundledCrc from '../crc.json';
import { getCrcVersion } from '../crc-cli';
import { getCrcDetectionChecks } from '../detection-checks';

function getBundledCrcVersion(): string {
  return bundledCrc.version.crcVersion;
}

export class CrcInstall {
  private installers = new Map<NodeJS.Platform, Installer>();

  constructor() {
    this.installers.set('win32', new WinInstall());
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

  public async doInstallCrc(
    provider: extensionApi.Provider,
    logger: extensionApi.Logger,
    installFinishedFn: () => void,
  ): Promise<void> {
    const dialogResult = await extensionApi.window.showInformationMessage(
      `CRC is not installed on this system, would you like to install CRC ${getBundledCrcVersion()}?`,
      'Yes',
      'No',
    );
    if (dialogResult === 'Yes') {
      await this.installCrc(logger);
      const newInstalledCrc = await getCrcVersion();
      // // write podman version
      // if (newInstalledCrc) {
      //   this.crcInfo.crcVersion = newInstalledCrc.version;
      // }
      // update detections checks
      provider.updateDetectionChecks(getCrcDetectionChecks(newInstalledCrc));
      installFinishedFn();
    } else {
      return;
    }
  }

  private async installCrc(logger: extensionApi.Logger): Promise<boolean> {
    const installer = this.getInstaller();
    if (installer) {
      return installer.install(logger);
    }
    return false;
  }

  private getInstaller(): Installer | undefined {
    return this.installers.get(os.platform());
  }
}
