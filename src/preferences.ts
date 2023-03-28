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
import type { Configuration } from './daemon-commander';
import { commander } from './daemon-commander';
import { isEmpty, productName } from './util';

const configMap = {
  'openshift-local.cpus': ['cpus', 'CPUS'],
  'openshift-local.memory': ['memory', 'Memory'],
  'openshift-local.preset': ['preset', 'Preset'],
  'openshift-local.disksize': ['disk-size', 'Disk Size'],
  'openshift-local.pullsecretfile': ['pull-secret-file', 'Pullsecret file path'],
} as {
  [key: string]: [string, string];
};

let initialCrcConfig: Configuration;

export async function syncPreferences(context: extensionApi.ExtensionContext): Promise<void> {
  initialCrcConfig = await commander.configGet();

  const extConfig = extensionApi.configuration.getConfiguration();

  for (const key in configMap) {
    const element = configMap[key];
    await extConfig.update(key, initialCrcConfig[element[0]]);
  }

  context.subscriptions.push(
    extensionApi.configuration.onDidChangeConfiguration(e => {
      configChanged(e);
    }),
  );
}

async function configChanged(e: extensionApi.ConfigurationChangeEvent): Promise<void> {
  const currentConfig = await commander.configGet();

  const extConfig = extensionApi.configuration.getConfiguration();

  const newConfig = {} as Configuration;

  for (const key in configMap) {
    const element = configMap[key];
    if (e.affectsConfiguration(key)) {
      const newValue: string | number = extConfig.get(key);
      if (initialCrcConfig[element[0]] !== currentConfig[element[0]]) {
        if (await useCrcSettingValue(element[1], newValue + '', currentConfig[element[0]] + '')) {
          initialCrcConfig[element[0]] = currentConfig[element[0]];
          extConfig.update(key, currentConfig[element[0]]);
          continue;
        }
      }

      newConfig[element[0]] = newValue;
      initialCrcConfig[element[0]] = newValue;
    }
  }

  try {
    if (!isEmpty(newConfig)) {
      await commander.configSet(newConfig);
    }
  } catch (err) {
    console.error(err);
  }
}

async function useCrcSettingValue(name: string, settingValue: string, crcConfigValue: string): Promise<boolean> {
  const keep = `Keep ${crcConfigValue}`;
  const use = `Use ${settingValue}`;
  const result = await extensionApi.window.showWarningMessage(
    `Conflict with ${productName} ${name} config.\nKeep ${crcConfigValue} or use ${settingValue}?`,
    keep,
    use,
  );

  if (result === keep) {
    return true;
  }

  return false;
}
