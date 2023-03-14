/**********************************************************************
 * Copyright (C) 2022 Red Hat, Inc.
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

import * as os from 'node:os';

import * as extensionApi from '@podman-desktop/api';
import { compare } from 'compare-versions';
import type { CrcReleaseInfo } from './base-install';
import { BaseCheck, BaseInstaller } from './base-install';
import { isFileExists, runCliCommand } from '../util';

const macosInstallerFineName = 'crc-macos-installer.pkg';

export class MacOsInstall extends BaseInstaller {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  install(releaseInfo: CrcReleaseInfo, logger?: extensionApi.Logger): Promise<boolean> {
    return extensionApi.window.withProgress({ location: extensionApi.ProgressLocation.APP_ICON }, async progress => {
      progress.report({ increment: 5 });

      const pkgPath = await this.downloadAndCheckInstaller(releaseInfo.links.darwin, macosInstallerFineName);

      try {
        if (await isFileExists(pkgPath)) {
          const runResult = await runCliCommand('open', [pkgPath, '-W']);
          if (runResult.exitCode !== 0) {
            throw new Error(runResult.stdErr);
          }
          progress.report({ increment: 80 });
          // we cannot rely on exit code, as installer could be closed and it return '0' exit code
          // so just check that crc bin file exist.
          if (await isFileExists('/usr/local/bin/crc')) {
            extensionApi.window.showNotification({ body: 'OpenShift Local is successfully installed.' });
            return true;
          } else {
            return false;
          }
        } else {
          throw new Error(`Can't find OpenShift Local package! Path: ${pkgPath} doesn't exists.`);
        }
      } catch (err) {
        console.error(err);
        await extensionApi.window.showErrorMessage(
          'Unexpected error, during OpenShift Local installation: ' + err,
          'OK',
        );
        return false;
      } finally {
        await this.deleteInstaller(pkgPath);
      }
    });
  }
  update(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  getUpdatePreflightChecks(): extensionApi.InstallCheck[] {
    throw new Error('Method not implemented.');
  }
  getPreflightChecks(): extensionApi.InstallCheck[] {
    return [new MacCPUCheck(), new MacMemoryCheck(), new MacVersionCheck()];
  }
}

class MacCPUCheck extends BaseCheck {
  title = 'CPU';
  private readonly MIN_CPU_NUMBER = 4;
  async execute(): Promise<extensionApi.CheckResult> {
    const cpus = os.cpus();
    if (cpus.length < this.MIN_CPU_NUMBER) {
      return this.createFailureResult(
        `You need to have at least ${this.MIN_CPU_NUMBER} CPU cores to install OpenShift Local.`,
      );
    }

    return this.createSuccessfulResult();
  }
}

class MacMemoryCheck extends BaseCheck {
  title = 'RAM';
  private readonly REQUIRED_MEM = 9 * 1024 * 1024 * 1024; // 9Gb

  async execute(): Promise<extensionApi.CheckResult> {
    const totalMem = os.totalmem();
    if (this.REQUIRED_MEM <= totalMem) {
      return this.createSuccessfulResult();
    } else {
      return this.createFailureResult('You need at least 9GB to install OpenShift Local.');
    }
  }
}

export class MacVersionCheck extends BaseCheck {
  title = 'macOS Version';
  private readonly MINIMUM_VERSION = '20.1.0'; // first macOS Big Sur kernel version

  async execute(): Promise<extensionApi.CheckResult> {
    const darwinVersion = os.release();
    if (compare(darwinVersion, this.MINIMUM_VERSION, '>=')) {
      return this.createSuccessfulResult();
    }

    return this.createFailureResult('To be able to install OpenShift Local you need to update to macOS Big Sur.');
  }
}
