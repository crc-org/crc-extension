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

import { spawn } from 'node:child_process';
import { isMac, isWindows } from './util.js';

import type { Logger } from '@podman-desktop/api';
import type { Preset } from './types.js';

const macosExtraPath = '/usr/local/bin:/opt/local/bin';
const crcWindowsInstallPath = 'C:\\Program Files\\Red Hat OpenShift Local';

export function getInstallationPath(): string {
  const env = process.env;
  if (isWindows()) {
    return `${crcWindowsInstallPath};${env.PATH}`;
  } else if (isMac()) {
    if (!env.PATH) {
      return macosExtraPath;
    } else {
      return env.PATH.concat(':').concat(macosExtraPath);
    }
  } else {
    return env.PATH;
  }
}

export function getCrcCli(): string {
  if (isWindows()) {
    return 'crc.exe';
  }
  return 'crc';
}

export interface ExecOptions {
  logger?: Logger;
  env: NodeJS.ProcessEnv | undefined;
}

export function execPromise(command: string, args?: string[], options?: ExecOptions): Promise<string> {
  let env = Object.assign({}, process.env); // clone original env object

  // In production mode, applications don't have access to the 'user' path like brew
  if (isMac() || isWindows()) {
    env.PATH = getInstallationPath();
  } else if (env.FLATPAK_ID) {
    // need to execute the command on the host
    args = ['--host', command, ...args];
    command = 'flatpak-spawn';
  }

  if (options?.env) {
    env = Object.assign(env, options.env);
  }
  return new Promise((resolve, reject) => {
    let stdOut = '';
    let stdErr = '';
    let stdErrBuffer = ''; // New buffer for line-by-line processing

    const process = spawn(command, args, { env });
    process.stdout.setEncoding('utf8');
    process.stderr.setEncoding('utf8');

    process.stdout.on('data', data => {
      stdOut += data;
      options?.logger?.log(data);
    });

    // Helper to evaluate and route individual lines
    const routeStderrLine = (line: string) => {
      if (
        line.trim() &&
        (!line.startsWith('level=') || line.startsWith('level=error') || line.startsWith('level=fatal'))
      ) {
        options?.logger?.error(line);
      } else {
        options?.logger?.log(line);
      }
    };

    process.stderr.on('data', data => {
      stdErr += data; // Keep tracking raw output for reject/resolve content
      stdErrBuffer += data;

      let newlineIndex;
      // Extract and log complete lines as they arrive
      while ((newlineIndex = stdErrBuffer.indexOf('\n')) !== -1) {
        const line = stdErrBuffer.slice(0, newlineIndex + 1);
        stdErrBuffer = stdErrBuffer.slice(newlineIndex + 1);
        routeStderrLine(line);
      }
    });

    process.on('error', error => {
      let content = '';
      if (stdOut && stdOut !== '') {
        content += stdOut + '\n';
      }
      if (stdErr && stdErr !== '') {
        content += stdErr + '\n';
      }
      reject(content + error);
    });

    process.on('close', exitCode => {
      // Flush any remaining partial line in the buffer
      if (stdErrBuffer) {
        routeStderrLine(stdErrBuffer);
        stdErrBuffer = '';
      }

      let content = '';
      if (stdOut && stdOut !== '') {
        content += stdOut + '\n';
      }
      if (stdErr && stdErr !== '') {
        content += stdErr + '\n';
      }

      if (exitCode !== 0) {
        reject(content);
      }
      resolve(stdOut.trim());
    });
  });
}

export interface CrcVersion {
  version: string;
  openshiftVersion: string;
  podmanVersion: string;
}

export async function getCrcVersion(): Promise<CrcVersion | undefined> {
  try {
    const versionOut = await execPromise(getCrcCli(), ['version', '-o', 'json']);
    if (versionOut) {
      return JSON.parse(versionOut);
    }
  } catch (err) {
    // no crc binary or we cant parse output
  }

  return undefined;
}

export async function getPreset(): Promise<Preset | undefined> {
  try {
    const presetOut = await execPromise(getCrcCli(), ['config', 'get', 'preset']);
    if (presetOut) {
      const splitArr = presetOut.split(':');
      return splitArr[1].trim() as Preset;
    }
  } catch (err) {
    // no crc binary or we cant parse output
  }

  return undefined;
}
