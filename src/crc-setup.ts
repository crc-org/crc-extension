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
import { execPromise, getCrcCli } from './crc-cli';
import { productName } from './util';

export let isNeedSetup = false;

export async function needSetup(): Promise<boolean> {
  try {
    await execPromise(getCrcCli(), ['setup', '--check-only']);
    isNeedSetup = false;
    return false;
  } catch (e) {
    isNeedSetup = true;
    return true;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setUpCrc(logger: extensionApi.Logger, askForPreset = false): Promise<boolean> {
  if (askForPreset) {
    const preset = await extensionApi.window.showInformationMessage(
      'Which preset bundle would you like to use with OpenShift Local. Microshift (experimental), provides a lightweight and optimized environment with a limited set of services. OpenShift, provides a single node OpenShift cluster with a fuller set of services, including a web console (requires more resources).',
      'OpenShift',
      'MicroShift (experimental)',
    );
    if (!preset) {
      extensionApi.window.showNotification({
        title: productName,
        body: 'Default preset will be used.',
      });
    } else {
      let choice = preset.toLowerCase();
      if (choice.includes('microshift')) {
        choice = 'microshift';
      }
      await execPromise(getCrcCli(), ['config', 'set', 'preset', choice]);
    }
  }

  const setupBar = extensionApi.window.createStatusBarItem('RIGHT', 2000);
  try {
    setupBar.text = `Configuring ${productName}...`;
    setupBar.show();
    let lastProgressTitle = '';
    await execPromise(getCrcCli(), ['setup', '--show-progressbars'], {
      logger: {
        error: (data: string) => {
          if (!data.startsWith('level=')) {
            let progressStart = lastProgressTitle;
            if (data.indexOf(':') > 0) {
              progressStart += data.substring(0, data.indexOf(':')) + ' ';
            }
            const downloadMsg = progressStart + data.substring(data.lastIndexOf(']') + 1, data.length).trim();
            setupBar.text = downloadMsg;
          } else {
            const msg = data.substring(data.indexOf('msg="') + 5, data.length - 2);
            if (msg.startsWith('Uncompressing')) {
              lastProgressTitle = 'Uncompressing: ';
            } else if (msg.startsWith('Downloading')) {
              lastProgressTitle = 'Downloading: ';
            }
            setupBar.text = msg;
          }
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        warn: (data: string) => {
          //ignore
        },
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        log: (data: string) => {
          //ignore
        },
      },
      env: undefined,
    });

    setupBar.text = 'All done.';
  } catch (err) {
    console.error(err);
    extensionApi.window.showErrorMessage(`${productName} configuration failed:\n${err}`);
    return false;
  } finally {
    setupBar.hide();
    setupBar.dispose();
  }

  return true;
}
