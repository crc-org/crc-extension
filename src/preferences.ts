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
import { execPromise, getCrcCli, getPreset } from './crc-cli.js';

const presetChangedEventEmitter = new extensionApi.EventEmitter<Preset>();
export const presetChangedEvent = presetChangedEventEmitter.event;

export async function syncProxy(context: extensionApi.ExtensionContext): Promise<void> {
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

function isPreset(data: string): data is Preset {
  if (data === 'microshift' || data === 'openshift' || data === 'podman') {
    return true;
  } else {
    return false;
  }
}

export async function connectionAuditor(items: extensionApi.AuditRequestItems): Promise<void> {
  // check if a preset has been chosen to update the form default values for other properties
  if (
    items['crc.factory.preset'] &&
    typeof items['crc.factory.preset'] === 'string' &&
    isPreset(items['crc.factory.preset'])
  ) {
    try {
      await execPromise(getCrcCli(), ['config', 'set', 'preset', items['crc.factory.preset']]);
      presetChangedEventEmitter.fire(items['crc.factory.preset']);
    } catch (e) {
      console.error('Unable to update preset', e);
    }
  }
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
}
