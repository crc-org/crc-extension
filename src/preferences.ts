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
import type { Configuration, Preset } from './types';
import { commander } from './daemon-commander';
import { isEmpty, productName } from './util';
import { getDefaultCPUs, getDefaultMemory } from './constants';
import { crcStatus } from './crc-status';
import { stopCrc } from './crc-stop';
import { deleteCrc } from './crc-delete';
import { startCrc } from './crc-start';
import { defaultLogger } from './logger';

const presetChangedEventEmitter = new extensionApi.EventEmitter<Preset>();
export const presetChangedEvent = presetChangedEventEmitter.event;

const configMap = {
  'OpenShift-Local.cpus': { name: 'cpus', label: 'CPUS', needDialog: true, validation: validateCpus },
  'OpenShift-Local.memory': { name: 'memory', label: 'Memory', needDialog: true, validation: validateRam },
  'OpenShift-Local.preset': {
    name: 'preset',
    label: 'Preset',
    needDialog: true,
    requiresRecreate: true,
    requiresRefresh: true,
    fireEvent: 'preset',
  },
  'OpenShift-Local.disksize': { name: 'disk-size', label: 'Disk Size', needDialog: true },
  'OpenShift-Local.pullsecretfile': { name: 'pull-secret-file', label: 'Pullsecret file path', needDialog: false },
} as {
  [key: string]: ConfigEntry;
};

const eventMap = {
  preset: (preset: Preset) => {
    presetChangedEventEmitter.fire(preset);
  },
};

type FireFn = (newVal: string | number) => void;
type FireFnArray = [FireFn, string | number][];

type EventType = keyof typeof eventMap;

type validateFn = (newVal: string | number, preset: Preset) => string | undefined;

interface ConfigEntry {
  name: string;
  label: string;
  needDialog: boolean;
  validation?: validateFn;
  requiresRecreate?: boolean;
  requiresRefresh?: boolean;
  fireEvent?: EventType;
}

let initialCrcConfig: Configuration;

let isRefreshing = false;

export async function syncPreferences(
  provider: extensionApi.Provider,
  context: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<void> {
  try {
    initialCrcConfig = await commander.configGet();

    const extConfig = extensionApi.configuration.getConfiguration();

    for (const key in configMap) {
      const element = configMap[key];
      await extConfig.update(key, initialCrcConfig[element.name]);
    }

    context.subscriptions.push(
      extensionApi.configuration.onDidChangeConfiguration(e => {
        if (!isRefreshing) {
          configChanged(e, provider, telemetryLogger).catch((e)=>console.log(String(e)));
        }
      }),
    );

    await syncProxy(context);
  } catch (err) {
    console.error('Cannot sync preferences: ', err);
  }
}

async function syncProxy(context: extensionApi.ExtensionContext): Promise<void> {
  // sync proxy settings
  if (extensionApi.proxy.isEnabled()) {
    await handleProxyChange(extensionApi.proxy.getProxySettings());
  }

  context.subscriptions.push(
    extensionApi.proxy.onDidStateChange(e => {
      if (e) {
        handleProxyChange(extensionApi.proxy.getProxySettings()).catch(e => console.error(String(e)));
      } else {
        handleProxyChange().catch(e => console.error(String(e)));
      }
    }),
  );

  context.subscriptions.push(
    extensionApi.proxy.onDidUpdateProxy(e => {
      handleProxyChange(e).catch(err => console.error(String(err)));
    }),
  );
}

async function handleProxyChange(proxy?: extensionApi.ProxySettings): Promise<void> {
  try {
    const newConfig = {} as Configuration;
    if (proxy) {
      if (proxy.httpProxy) {
        newConfig['http-proxy'] = proxy.httpProxy;
      }
      if (proxy.httpsProxy) {
        newConfig['https-proxy'] = proxy.httpsProxy;
      }
      if (proxy.noProxy) {
        newConfig['no-proxy'] = proxy.noProxy;
      }
      if (!isEmpty(newConfig)) {
        await commander.configSet(newConfig);
      }
    } else {
      await commander.configUnset(['http-proxy', 'https-proxy', 'no-proxy']);
    }
  } catch (err) {
    console.error(err);
    void extensionApi.window.showErrorMessage(`Could not update ${productName} proxy configuration: ${err}`);
  }
}

async function configChanged(
  e: extensionApi.ConfigurationChangeEvent,
  provider: extensionApi.Provider,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<void> {
  const currentConfig = await commander.configGet();

  const extConfig = extensionApi.configuration.getConfiguration();

  const newConfig = {} as Configuration;

  let needRecreateCrc = false;
  let needRefreshConfig = false;

  const eventToFire: FireFnArray = [];

  for (const key in configMap) {
    const element = configMap[key];
    if (e.affectsConfiguration(key)) {
      const newValue: string | number = extConfig.get(key);
      //validate new value
      if (element.validation) {
        const validationResult = element.validation(newValue, currentConfig.preset);
        if (validationResult) {
          void extensionApi.window.showErrorMessage(validationResult);
          await extConfig.update(key, currentConfig[element.name]);
          continue;
        }
      }
      if (initialCrcConfig[element.name] !== currentConfig[element.name]) {
        if (await useCrcSettingValue(element.label, newValue + '', currentConfig[element.name] + '')) {
          initialCrcConfig[element.name] = currentConfig[element.name];
          await extConfig.update(key, currentConfig[element.name]);
          continue;
        }
      }

      if (element.fireEvent) {
        eventToFire.push([eventMap[element.fireEvent], newValue]);
      }

      newConfig[element.name] = newValue;
      initialCrcConfig[element.name] = newValue;
      if (element.needDialog && !element.requiresRecreate) {
        extensionApi.window.showNotification({
          title: productName,
          body: `Changes to configuration property '${element.label}' are only applied when the ${productName} instance is started.\n If you already have a running CRC instance, then for this configuration change to take effect, stop the ${productName} instance with 'stop' and restart it with 'start'.`,
        });
      } else if (element.requiresRecreate) {
        needRecreateCrc = true;
      }

      if (element.requiresRefresh) {
        needRefreshConfig = true;
      }
    }
  }

  // check for recreate need based on current status too
  if (crcStatus.status.Preset !== newConfig.preset) {
    needRecreateCrc = true;
    needRefreshConfig = true;
  } else {
    needRecreateCrc = false;
    needRefreshConfig = true;
  }

  try {
    if (!isEmpty(newConfig)) {
      await commander.configSet(newConfig);
      if (eventToFire.length > 0) {
        for (const event of eventToFire) {
          event[0](event[1]);
        }
      }
      if (needRecreateCrc) {
        const recreateResult = await handleRecreate(provider, telemetryLogger);
        if (!recreateResult) {
          // User cancelled

          const resetConfig = {} as Configuration;
          resetConfig.preset = currentConfig.preset;
          await commander.configSet(resetConfig);

          needRefreshConfig = true;
        }
      }
      if (needRefreshConfig) {
        await refreshConfig();
      }
    }
  } catch (err) {
    console.error(err);
  }
}

async function refreshConfig(): Promise<void> {
  isRefreshing = true;
  try {
    initialCrcConfig = await commander.configGet();

    const extConfig = extensionApi.configuration.getConfiguration();

    for (const key in configMap) {
      const element = configMap[key];
      await extConfig.update(key, initialCrcConfig[element.name]);
    }
  } finally {
    isRefreshing = false;
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

function validateCpus(newVal: string | number, preset: Preset): string | undefined {
  if (typeof newVal !== 'number') {
    return 'CPUs should be a number';
  }
  if (newVal < getDefaultCPUs(preset)) {
    return `Requires CPUs >= ${getDefaultCPUs(preset)}`;
  }
}

function validateRam(newVal: string | number, preset: Preset): string | undefined {
  if (typeof newVal !== 'number') {
    return 'Memory should be a number';
  }
  if (newVal < getDefaultMemory(preset)) {
    return `Requires Memory in MiB >= ${getDefaultMemory(preset)}`;
  }
}

async function handleRecreate(
  provider: extensionApi.Provider,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<boolean> {
  const needDelete = crcStatus.status.CrcStatus !== 'No Cluster';
  const needStop = crcStatus.getProviderStatus() === 'started' || crcStatus.getProviderStatus() === 'starting';

  const buttons = ['Cancel'];

  if (!needStop && needDelete) {
    buttons.unshift('Delete');
  }
  if (needStop) {
    buttons.unshift('Stop and Delete');
    buttons.unshift('Delete and Restart');
  }

  const result = await extensionApi.window.showInformationMessage(
    `To apply changes ${productName} need to create new instance.`,
    ...buttons,
  );

  // we might wanna log what user clicked on.
  // for now we infer from the logged events
  if (result === 'Stop and Delete') {
    await stopCrc(telemetryLogger);
    await deleteCrc();
    return true;
  } else if (result === 'Delete and Restart') {
    await stopCrc(telemetryLogger);
    await deleteCrc();
    await startCrc(provider, defaultLogger, telemetryLogger);
    return true;
  } else if (result === 'Delete') {
    await deleteCrc();
    return true;
  } else if (result === 'Cancel') {
    // do nothing
    return false;
  }
}
