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
import * as os from 'node:os';

import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pack = await fs.promises.readFile(path.resolve(__dirname, '../package.json'));
const packageJson = JSON.parse(pack.toString());

const desktopPath = path.join(__dirname, '..', '..', 'podman-desktop');

async function exec(command:string, args: string[] | undefined, options:cp.SpawnOptionsWithoutStdio): Promise<void> {
  return new Promise((resolve, reject) => {
    if (os.platform() === 'win32') {
      if (!options) {
        options = {};
      }

      options.shell = true;
    }
    const proc = cp.spawn(command, args, options);
    proc.stderr.pipe(process.stderr);
    proc.stdout.pipe(process.stdout);
    proc.on('close', code => {
      if (code !== 0) {
        reject(code);
        return;
      }
      resolve();
    });

    proc.on('error', () => {
      reject();
    });
  });
}

async function checkAndCloneDesktopRepo() {
  if (!fs.existsSync(desktopPath)) {
    console.log('Cloning podman-desktop repository...');
    await exec('git', ['clone', 'https://github.com/containers/podman-desktop.git'], {
      cwd: path.join(__dirname, '..', '..'),
    });
  } else {
    console.log('desktop repo already exist...');
  }
}

async function prepareDev() {
  await checkAndCloneDesktopRepo();

  await exec('pnpm', undefined, { cwd: desktopPath });
  await exec('pnpm', [], { cwd: path.join(__dirname, '..') });
}

async function buildPD() {
  await exec('pnpm', ['compile:current'], { cwd: desktopPath });
}

async function buildCrc() {
  await exec('pnpm', ['build'], { cwd: path.join(__dirname, '..') });

  const pluginsPath = path.resolve(os.homedir(), `.local/share/containers/podman-desktop/plugins/${packageJson.name}/`);
  fs.rmSync(pluginsPath, { recursive: true, force: true });

  fs.mkdirSync(pluginsPath, { recursive: true });
  fs.cpSync(path.resolve(__dirname, '..', 'package.json'), pluginsPath + '/package.json');
  fs.cpSync(path.resolve(__dirname, '..', 'dist'), pluginsPath + '/dist', { recursive: true });
  fs.cpSync(path.resolve(__dirname, '..', 'icon.png'), pluginsPath + '/icon.png');
}

async function build() {
  await buildPD();
  await buildCrc();
}

async function run() {
  await buildCrc();
  await exec('pnpm', ['watch'], { cwd: desktopPath });
}

async function debug() {
  exec('pnpm', ['watch'], { cwd: path.join(__dirname, '..') });
  await exec('pnpm', ['watch', '--extension-folder', path.join(__dirname, '..')], { cwd: desktopPath });
}

const firstArg = process.argv[2];

switch (firstArg) {
  case 'build':
    await build();
    break;

  case 'run':
    await run();
    break;
  case 'debug':
    await debug();
    break;

  case 'prepare':
  default:
    await prepareDev();
}
