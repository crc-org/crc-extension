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
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { isMac, isWindows, providerId } from './util';
import { crcStatus } from './crc-status';
import { getCrcCli } from './crc-cli';
import which from 'which';

let terminalCmdDisposable: extensionApi.Disposable;

export function registerOpenTerminalCommand(extensionContext: extensionApi.ExtensionContext): void {
  const isStarted = crcStatus.status.CrcStatus === 'Running';
  terminalCmdDisposable = addTerminalCmd(isStarted);

  extensionContext.subscriptions.push(terminalCmdDisposable);
  extensionContext.subscriptions.push(
    extensionApi.commands.registerCommand('crc.dev.terminal', () => {
      return openTerminalWithOC();
    }),
  );

  crcStatus.onStatusChange(e => {
    if (e.CrcStatus === 'Running') {
      recreateCmd(true, extensionContext.subscriptions);
    } else {
      recreateCmd(false, extensionContext.subscriptions);
    }
  });
}

function recreateCmd(enabled: boolean, subscriptions: { dispose(): unknown }[]): void {
  subscriptions.splice(subscriptions.indexOf(terminalCmdDisposable));
  terminalCmdDisposable.dispose();
  terminalCmdDisposable = addTerminalCmd(enabled);
  subscriptions.push(terminalCmdDisposable);
}

function addTerminalCmd(enabled: boolean): extensionApi.Disposable {
  return extensionApi.tray.registerProviderMenuItem(providerId, {
    id: 'crc.dev.terminal',
    visible: true,
    enabled,
    label: 'Open developer terminal',
  });
}

async function openTerminalWithOC(): Promise<void> {
  let command = '';

  switch (crcStatus.status.Preset) {
    case 'openshift':
      command = 'oc-env';
      break;
    case 'podman':
      command = 'podman-env';
      break;
    default:
      console.warn(`There are no env for ${crcStatus.status.Preset}`);
      return;
  }

  if (isWindows()) {
    const poshPath = await which('powershell.exe', { nothrow: true });

    const cmd = `-NoExit -Command "&{${getCrcCli()} ${command} | Invoke-Expression}"`;
    if (poshPath !== null) {
      const posh = childProcess.spawn(poshPath, [cmd], {
        detached: true,
        shell: true,
        cwd: os.homedir(),
        stdio: 'ignore',
      });

      posh.unref();
    }
  } else if (isMac()) {
    const script = `tell application "Terminal"
    do script "eval $('${getCrcCli()}' ${command})"
end tell

tell application "System events"
    try
        set frontmost of application process "Terminal" to true
    end try
end`;

    const scriptFileName = path.join(os.tmpdir(), 'crc-mac-terminal-script');
    try {
      await fs.promises.writeFile(scriptFileName, script);
      const terminal = childProcess.spawn('osascript', [scriptFileName], {
        detached: true,
        shell: true,
        stdio: 'ignore',
      });

      terminal.unref();
    } catch (err) {
      extensionApi.window.showNotification({
        body: 'Failed to open Developer terminal' + err.message,
      });
    }
  } else {
    extensionApi.window.showNotification({
      body: 'Only supported on Windows and macOS currently',
    });
  }
}
