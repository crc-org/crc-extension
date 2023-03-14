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
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';

const windows = os.platform() === 'win32';
export function isWindows(): boolean {
  return windows;
}
const mac = os.platform() === 'darwin';
export function isMac(): boolean {
  return mac;
}
const linux = os.platform() === 'linux';
export function isLinux(): boolean {
  return linux;
}

/**
 * @returns true if app running in dev mode
 */
export function isDev(): boolean {
  const isEnvSet = 'ELECTRON_IS_DEV' in process.env;
  const envSet = Number.parseInt(process.env.ELECTRON_IS_DEV, 10) === 1;
  return isEnvSet ? envSet : false;
}

export function getAssetsFolder(): string {
  return path.resolve(__dirname, '..', 'assets');
}

export interface SpawnResult {
  exitCode: number;
  stdOut: string;
  stdErr: string;
}

export function runCliCommand(command: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    let output = '';
    let err = '';
    const env = Object.assign({}, process.env);

    if (isWindows()) {
      // Escape any whitespaces in command
      command = `"${command}"`;
    } else if (env.FLATPAK_ID) {
      // need to execute the command on the host
      args = ['--host', command, ...args];
      command = 'flatpak-spawn';
    }

    const spawnProcess = spawn(command, args, { shell: isWindows(), env });
    spawnProcess.on('error', err => {
      reject(err);
    });
    spawnProcess.stdout.setEncoding('utf8');
    spawnProcess.stdout.on('data', data => {
      output += data;
    });
    spawnProcess.stderr.setEncoding('utf8');
    spawnProcess.stderr.on('data', data => {
      err += data;
    });

    spawnProcess.on('close', exitCode => {
      resolve({ exitCode, stdOut: output, stdErr: err });
    });
  });
}

export async function isFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (err) {
    return false;
  }
}
