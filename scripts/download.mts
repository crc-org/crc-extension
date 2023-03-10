#!/usr/bin/env node
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

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import got from 'got';
import hasha from 'hasha';
import { fileURLToPath } from 'url';

import bundledCrc from '../src/crc.json' assert {type: 'json'};


const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const platform = process.platform;

const MAX_DOWNLOAD_ATTEMPT = 3;
let downloadAttempt = 0;

const platformToInstallFileName = {
  'darwin': 'crc-macos-installer.pkg',
  'win32': 'crc-windows-installer.zip',
  'linux': 'crc-linux-amd64.tar.xz',
};


async function checkFileSha(filePath: string, shaSum: string): Promise<boolean> {
  const sha256sum: string = await hasha.fromFile(filePath, { algorithm: 'sha256' });
  return sha256sum === shaSum;
}

async function downloadAndCheckSha(downloadUrl: string, destFile: string, fileSha: string): Promise<void>{
  if (downloadAttempt >= MAX_DOWNLOAD_ATTEMPT) {
    console.error('Max download attempt reached, exiting...');
    process.exit(1);
  }

  let lastProgressStr = '';

  process.stdout.write('Downloading:\n');


  const downloadResponse =  await got(downloadUrl).on('downloadProgress', (progress) => {
    const progressStr = progress.transferred + ' of ' + progress.total + ' ' + Math.round(progress.percent * 100) + '%';
    if(lastProgressStr !== progressStr) {
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(progressStr);
      readline.clearLine(process.stdout, 1);
      lastProgressStr = progressStr;
    }
  });
  // add new line after download percentage
  process.stdout.write('\n');

  fs.appendFileSync(destFile, Buffer.from(downloadResponse.rawBody));
  console.log(`Downloaded to ${destFile}`);

  console.log(`Verifying ${destFile}...`);

  if (!(await checkFileSha(destFile, fileSha))) {
    console.warn(`Checksum for downloaded ${destFile} is not match, downloading again...`);
    fs.rmSync(destFile);
    downloadAttempt++;
    downloadAndCheckSha(downloadUrl, destFile, fileSha);
  } else {
    console.log(`Checksum for ${destFile} is matched.`);
  }

}

async function downloadCrc(): Promise<void> {

  console.info(`Found CRC: ${bundledCrc.version.crcVersion}`);


  let releaseUrl: string;

  if(platform === 'win32'){
    releaseUrl = bundledCrc.links.windows;
  } else if(platform === 'darwin') {
    releaseUrl = bundledCrc.links.darwin;
  } else {
    releaseUrl = bundledCrc.links.linux;
  }

  console.info('Download SHA sums...');
  const shaSumUrl = releaseUrl.substring(0, releaseUrl.lastIndexOf('/')) + '/sha256sum.txt';
  const shaSumContentResponse = await got.get(shaSumUrl);

  const installerFileName = platformToInstallFileName[platform];
  if(!installerFileName) {
    console.error('Can\'t find installer file name. Exiting...');
    process.exit(1);
  }


  const shasSumArr = shaSumContentResponse.body.split('\n');

  let installerSha = '';
  for(const shaLine of shasSumArr){
    if(shaLine.trim().endsWith(installerFileName)) {
      installerSha = shaLine.split(' ')[0];
      break;
    }
  }

  if(!installerSha) {
    console.error(`Can't find SHA256 sum for ${installerFileName} in:\n${shaSumContentResponse.body}`);
    process.exit(1);
  }

  const destDir = path.resolve(__dirname, '..', 'assets');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
  }
  const destFile = path.resolve(destDir, installerFileName);

  if (!fs.existsSync(destFile)) {
    console.log(`Downloading Podman package from ${releaseUrl}`);
    downloadAndCheckSha(releaseUrl, destFile, installerSha);
    return;
  } else {
    console.log(`Podman package ${releaseUrl} already downloaded.`);
  }

  console.log(`Verifying ${installerFileName}...`);

  if (!(await checkFileSha(destFile, installerSha))) {
    console.warn(`Checksum for downloaded ${destFile} is not match, downloading again...`);
    fs.rmSync(destFile);
    downloadAttempt++;
    downloadAndCheckSha(releaseUrl, destFile, installerSha);
  } else {
    console.log(`Checksum for ${installerFileName} is matched.`);
  }

}


if(platform === 'win32' /*|| platform === 'darwin'*/){
  downloadCrc();
}
