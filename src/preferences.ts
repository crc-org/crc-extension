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
import type { Configuration, Preset } from './types.js';
import { commander } from './daemon-commander.js';
import { isEmpty, productName } from './util.js';
import { crcStatus } from './crc-status.js';
import { stopCrc } from './crc-stop.js';
import { deleteCrc } from './crc-delete.js';
import { startCrc } from './crc-start.js';
import { defaultLogger } from './logger.js';
import { getPreset } from './crc-cli.js';

const presetChangedEventEmitter = new extensionApi.EventEmitter<Preset>();
export const presetChangedEvent = presetChangedEventEmitter.event;

const configMap = {
  'OpenShift-Local.preset': {
    name: 'preset',
    label: 'Preset',
    needDialog: true,
    requiresRecreate: true,
    requiresRefresh: true,
    fireEvent: 'preset',
  },
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
    await refreshConfig();

    context.subscriptions.push(
      extensionApi.configuration.onDidChangeConfiguration(e => {
        if (!isRefreshing) {
          configChanged(e, provider, telemetryLogger).catch(e => console.log(String(e)));
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
    await extensionApi.window.showErrorMessage(`Could not update ${productName} proxy configuration: ${err}`);
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
          await extensionApi.window.showErrorMessage(validationResult);
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

    const preset = initialCrcConfig.preset ?? 'openshift';
    if (preset !== 'podman') {
      await extConfig.update(`crc.factory.${preset}.memory`, +initialCrcConfig['memory'] * (1024 * 1024));
      await extConfig.update(`crc.factory.${preset}.cpus`, initialCrcConfig['cpus']);
      await extConfig.update('crc.factory.disksize', +initialCrcConfig['disk-size'] * (1024 * 1024 * 1024));
    }

    await extConfig.update('crc.factory.pullsecretfile', initialCrcConfig['pull-secret-file']);
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

export async function saveConfig(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}) {
  const preset = (await getPreset()) ?? 'openshift';

  const configuration: { [key: string]: string | number } = {};
  if (params[`crc.factory.${preset}.cpus`]) {
    configuration.cpus = +params[`crc.factory.${preset}.cpus`];
  }

  if (params[`crc.factory.${preset}.memory`]) {
    const memoryAsMiB = +params[`crc.factory.${preset}.memory`] / (1024 * 1024);
    configuration.memory = Math.floor(memoryAsMiB);
  }

  if (params['crc.factory.disksize']) {
    const diskAsGiB = +params['crc.factory.disksize'] / (1024 * 1024 * 1024);
    configuration['disk-size'] = Math.floor(diskAsGiB);
  }

  if (params['crc.factory.pullsecretfile']) {
    configuration['pull-secret-file'] = params['crc.factory.pullsecretfile'];
  }

  await commander.configSet(configuration);
  await refreshConfig();
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
