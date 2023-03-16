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
import type { Preset } from './daemon-commander';
import { productName } from './util';

interface PresetQuickPickItem extends extensionApi.QuickPickItem {
  data: Preset;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function setUpCrc(logger: extensionApi.Logger, askForPreset = false): Promise<boolean> {
  if (askForPreset) {
    const preset = await extensionApi.window.showQuickPick<PresetQuickPickItem>(createPresetItems(), {
      canPickMany: false,
      title: `Select ${productName} Preset`,
      placeHolder: `Select ${productName} Preset`,
    });
    if (!preset) {
      extensionApi.window.showNotification({
        title: productName,
        body: 'Default preset will used.',
      });
    } else {
      await execPromise(getCrcCli(), ['config', 'set', 'preset', preset.data]);
    }
  }

  const setupBar = extensionApi.window.createStatusBarItem('RIGHT', 2000);
  try {
    setupBar.text = `Configuring ${productName}...`;
    setupBar.show();
    await execPromise(getCrcCli(), ['setup'], {
      logger: {
        error: (data: string) => {
          if (!data.startsWith('level=')) {
            const downloadMsg = 'Downloading bundle: ' + data.substring(data.lastIndexOf(']') + 1, data.length).trim();
            setupBar.text = downloadMsg;
            setupBar.tooltip =
              'Downloading bundle: ' +
              data.substring(0, data.indexOf('[')).trim() +
              ' ' +
              data.substring(data.lastIndexOf(']') + 1, data.length).trim();
          } else {
            const msg = data.substring(data.indexOf('msg="') + 5, data.length - 1);
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
    extensionApi.window.showErrorMessage(`${productName} configuration is fail:\n${err}`);
    return false;
  } finally {
    setupBar.hide();
    setupBar.dispose();
  }

  return true;
}

function createPresetItems(): PresetQuickPickItem[] {
  return [
    {
      data: 'openshift',
      label: 'openshift',
      description:
        'Run a full OpenShift cluster environment as a single node, providing a registry and access to Operator Hub',
      detail:
        'Run a full OpenShift cluster environment as a single node, providing a registry and access to Operator Hub',
    },
    {
      data: 'microshift',
      label: 'microshift',
      description: 'MicroShift is a optimized OpenShift Kubernetes for small form factor and edge computing.',
      detail: 'MicroShift is a optimized OpenShift Kubernetes for small form factor and edge computing.',
    },
  ];
}
