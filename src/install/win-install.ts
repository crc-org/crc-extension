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
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as zipper from 'zip-local';

import * as extensionApi from '@podman-desktop/api';
import { BaseCheck, BaseInstaller } from './base-install';
import { getAssetsFolder, runCliCommand } from '../util';

export class WinInstall extends BaseInstaller {
  install(logger: extensionApi.Logger): Promise<boolean> {
    return extensionApi.window.withProgress({ location: extensionApi.ProgressLocation.APP_ICON }, async progress => {
      progress.report({ increment: 5 });
      const setupPath = path.resolve(getAssetsFolder(), 'crc-windows-installer.zip');
      let msiPath = '';
      try {
        if (fs.existsSync(setupPath)) {
          logger.log(`Extracting msi file from ${setupPath}`);
          msiPath = await this.extractMsiFromZip(setupPath);
          progress.report({ increment: 10 });

          const runResult = await runCliCommand('msiexec.exe', ['/i', msiPath, '/qr', '/norestart']);

          if (runResult.exitCode !== 0) {
            // installed successfully, but reboot required
            if (runResult.exitCode === 3010) {
              progress.report({ increment: 99 });
              extensionApi.window.showInformationMessage(
                'CRC is successfully installed. Reboot required to finalize system changes.',
                'OK',
              );
              return true;
            } else {
              throw new Error(runResult.stdErr);
            }
          }
          progress.report({ increment: 80 });
          extensionApi.window.showNotification({ body: 'CRC is successfully installed.' });
          return true;
        } else {
          throw new Error(`Can't find CRC setup package! Path: ${setupPath} doesn't exists.`);
        }
      } catch (err) {
        console.error('Error during CRC install!');
        console.error(err);
        await extensionApi.window.showErrorMessage('Unexpected error, during CRC installation: ' + err, 'OK');
        return false;
      } finally {
        progress.report({ increment: -1 });
        if (msiPath) {
          fs.unlinkSync(msiPath);
        }
      }
    });
  }

  getPreflightChecks(): extensionApi.InstallCheck[] {
    return [new WinBitCheck(), new CpuCoreCheck(), new WinVersionCheck(), new WinMemoryCheck()];
  }

  update(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  getUpdatePreflightChecks(): extensionApi.InstallCheck[] {
    throw new Error('Method not implemented.');
  }

  private extractMsiFromZip(zipPath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const outPath = path.join(os.tmpdir(), 'crc');
      if (!fs.existsSync(outPath)) {
        fs.mkdirSync(outPath);
      }

      zipper.unzip(zipPath, (err, res) => {
        if (err) {
          reject(err);
        } else {
          res.save(outPath, saveErr => {
            if (saveErr) {
              reject(saveErr);
            } else {
              resolve(path.join(outPath, 'crc-windows-amd64.msi'));
            }
          });
        }
      });
    });
  }
}

class WinBitCheck extends BaseCheck {
  title = 'Windows 64bit';

  private ARCH_X64 = 'x64';
  private ARCH_ARM = 'arm64';

  async execute(): Promise<extensionApi.CheckResult> {
    const currentArch = process.arch;
    if (this.ARCH_X64 === currentArch || this.ARCH_ARM === currentArch) {
      return this.createSuccessfulResult();
    } else {
      return this.createFailureResult(
        'WSL2 works only on 64bit OS.',
        'https://docs.microsoft.com/en-us/windows/wsl/install-manual#step-2---check-requirements-for-running-wsl-2',
      );
    }
  }
}

class CpuCoreCheck extends BaseCheck {
  title = 'CPU Cores';

  async execute(): Promise<extensionApi.CheckResult> {
    const cpus = os.cpus();
    if (cpus.length >= 4) {
      return this.createSuccessfulResult();
    } else {
      return this.createFailureResult('СRC requires at least 4 CPU Core to run');
    }
  }
}

class WinVersionCheck extends BaseCheck {
  title = 'Windows Version';

  private MIN_BUILD = 18362;
  async execute(): Promise<extensionApi.CheckResult> {
    const winRelease = os.release();
    if (winRelease.startsWith('10.0.')) {
      const splitRelease = winRelease.split('.');
      const winBuild = splitRelease[2];
      if (Number.parseInt(winBuild) >= this.MIN_BUILD) {
        return { successful: true };
      } else {
        return this.createFailureResult(
          'To be able to run WSL2 you need Windows 10 Build 18362 or later.',
          'WSL2 Install Manual',
          'https://docs.microsoft.com/en-us/windows/wsl/install-manual#step-2---check-requirements-for-running-wsl-2',
        );
      }
    } else {
      return this.createFailureResult(
        'WSL2 works only on Windows 10 and newest OS',
        'WSL2 Install Manual',
        'https://docs.microsoft.com/en-us/windows/wsl/install-manual#step-2---check-requirements-for-running-wsl-2',
      );
    }
  }
}

class WinMemoryCheck extends BaseCheck {
  title = 'RAM';
  private REQUIRED_MEM = 9 * 1024 * 1024 * 1024; // 9Gb

  async execute(): Promise<extensionApi.CheckResult> {
    const totalMem = os.totalmem();
    if (this.REQUIRED_MEM <= totalMem) {
      return this.createSuccessfulResult();
    } else {
      return this.createFailureResult('You need at least 9GB to run CRC.');
    }
  }
}
