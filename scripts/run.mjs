#!/usr/bin/env node
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

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'node:child_process';
import * as util from 'node:util';

// const exec = util.promisify(cp.exec);

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const desktopPath = path.join(__dirname, '..', '..', 'podman-desktop');
let isNeedToInstallDependencies = false;

async function exec(command, args,  options) {
  return new Promise((resolve, reject) => {
    const proc = cp.spawn(command, args, options);
    proc.stderr.pipe(process.stderr);
    proc.stdout.pipe(process.stdout);
    proc.on('close', () => {
      resolve();
    });

    proc.on('error', () => {
      reject();
    })
  });
}

async function checkAndCloneDesktopRepo() {
  if(!fs.existsSync(desktopPath)) {
    console.log('Cloning podman-desktop repository...');
    await exec('git',  ['clone', 'git@github.com:containers/podman-desktop.git'], {cwd: path.join(__dirname, '..', '..')})
    isNeedToInstallDependencies = true;
  } else {
    console.log('desktop repo already exist...');
  }
}

function copyExt() {
  const crcExtPath = path.join(desktopPath, 'extensions', 'crc');
  if(fs.existsSync(crcExtPath)){
    console.log('Deleting old crc extensions');
    fs.rmSync(crcExtPath, {recursive: true});
  }
  fs.mkdirSync(crcExtPath);
  const ourExtensionPath = path.join(__dirname, '..', '..', 'crc-extension');
  console.log('Copying own crc extension...');
  fs.cpSync(ourExtensionPath + path.sep, crcExtPath, {recursive: true});
  
  console.log('All done, go ' + desktopPath + ' and run "yarn watch" to start podman-desktop with this extension.');
}

async function prepareDev() {
  await checkAndCloneDesktopRepo();
  copyExt();
  if(isNeedToInstallDependencies){
    console.warn('But first you need to call "yarn" to install dependencies');
  }
}

async function build() {
  await checkAndCloneDesktopRepo();
  copyExt();

  await exec('yarn',undefined, {cwd: path.join(__dirname, '..', '..', 'podman-desktop'), });
  await exec('yarn',['build'], {cwd: path.join(__dirname, '..', '..', 'podman-desktop')});
}

async function run() {
  copyExt();
  await exec('yarn',['watch'], {cwd: path.join(__dirname, '..', '..', 'podman-desktop')});
}

async function watch() {
  throw new Error('Implement watch');
}

const firstArg = process.argv[2];

switch(firstArg) {
  case 'watch':
    await watch();
    break;
  case 'build':
    await build();
    break;

  case 'run':
    await run();
    break;

  case 'prepare' :
  default: 
    await prepareDev();
}
