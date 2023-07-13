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

import * as extensionApi from '@podman-desktop/api';
import got from 'got';
import hasha from 'hasha';
import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import stream from 'node:stream/promises';
import * as os from 'node:os';
import { isFileExists, productName } from '../util';
import type { CrcReleaseInfo } from '../types';

export abstract class BaseCheck implements extensionApi.InstallCheck {
  abstract title: string;
  abstract execute(): Promise<extensionApi.CheckResult>;

  protected createFailureResult(description?: string, title?: string, url?: string): extensionApi.CheckResult {
    const result: extensionApi.CheckResult = { successful: false, description };
    if (title && url) {
      result.docLinks = [{ url, title }];
    }
    return result;
  }

  protected createSuccessfulResult(): extensionApi.CheckResult {
    return { successful: true };
  }
}

export interface Installer {
  getPreflightChecks(): extensionApi.InstallCheck[] | undefined;
  getUpdatePreflightChecks(): extensionApi.InstallCheck[] | undefined;
  install(releaseInfo: CrcReleaseInfo, logger?: extensionApi.Logger): Promise<boolean>;
  update(releaseInfo: CrcReleaseInfo, logger?: extensionApi.Logger): Promise<boolean>;
}

export abstract class BaseInstaller implements Installer {
  protected statusBarItem: extensionApi.StatusBarItem | undefined;

  abstract install(releaseInfo: CrcReleaseInfo, logger?: extensionApi.Logger): Promise<boolean>;

  abstract update(releaseInfo: CrcReleaseInfo, logger?: extensionApi.Logger): Promise<boolean>;

  abstract getUpdatePreflightChecks(): extensionApi.InstallCheck[];

  abstract getPreflightChecks(): extensionApi.InstallCheck[];

  async downloadSha(installerUrl: string, fileName: string): Promise<string> {
    const shaSumUrl = installerUrl.substring(0, installerUrl.lastIndexOf('/')) + '/sha256sum.txt';
    const shaSumContentResponse = await got.get(shaSumUrl);

    const shasSumArr = shaSumContentResponse.body.split('\n');

    let installerSha = '';
    for (const shaLine of shasSumArr) {
      if (shaLine.trim().endsWith(fileName)) {
        installerSha = shaLine.split(' ')[0];
        break;
      }
    }

    if (!installerSha) {
      console.error(`Can't find SHA256 sum for ${fileName} in:\n${shaSumContentResponse.body}`);
      throw new Error(`Can't find SHA256 sum for ${fileName}.`);
    }

    return installerSha;
  }

  async downloadCrcInstaller(installerUrl: string, destinationPath: string, fileSha: string): Promise<void> {
    const lastProgressStr = 'Downloading: 0%';

    this.statusBarItem.text = lastProgressStr;
    const downloadStream = got.stream(installerUrl);

    downloadStream.on('downloadProgress', progress => {
      const progressStr = Math.round(progress.percent * 100) + '%';
      if (lastProgressStr !== progressStr) {
        this.statusBarItem.text = `Downloading ${productName}: ${progressStr}`;
      }
    });

    await stream.pipeline(downloadStream, createWriteStream(destinationPath));

    console.log(`Downloaded to ${destinationPath}`);

    this.statusBarItem.text = 'Downloaded, verifying SHA...';
    if (!(await checkFileSha(destinationPath, fileSha))) {
      throw new Error(`Checksum for downloaded ${destinationPath} is not match, try to download again!`);
    }
  }

  protected async downloadAndCheckInstaller(installerUrl: string, installerFileName: string): Promise<string> {
    this.createStatusBar();
    this.statusBarItem.text = 'Downloading: 0%';
    const sha = await this.downloadSha(installerUrl, installerFileName);

    const installerFolder = path.resolve(os.tmpdir(), 'crc-extension');
    await fs.mkdir(installerFolder, { recursive: true });
    const installerPath = path.resolve(installerFolder, installerFileName);

    if (!(await isFileExists(installerPath))) {
      await this.downloadCrcInstaller(installerUrl, installerPath, sha);
      this.removeStatusBar();
      return installerPath;
    }

    if (!(await checkFileSha(installerPath, sha))) {
      console.warn(`Checksum for ${installerPath} not match, deleting...`);
      await fs.rm(installerPath);
      await this.downloadCrcInstaller(installerUrl, installerPath, sha);
    }

    this.removeStatusBar();
    return installerPath;
  }

  private createStatusBar(): void {
    this.statusBarItem = extensionApi.window.createStatusBarItem('RIGHT', 1000);
    this.statusBarItem.show();
  }

  private removeStatusBar(): void {
    this.statusBarItem.hide();
    this.statusBarItem.dispose();
  }

  protected async deleteInstaller(installerPath: string): Promise<void> {
    await fs.rm(installerPath);
  }
}

async function checkFileSha(filePath: string, shaSum: string): Promise<boolean> {
  const sha256sum: string = await hasha.fromFile(filePath, { algorithm: 'sha256' });
  return sha256sum === shaSum;
}
