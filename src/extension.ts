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

import * as extensionApi from '@podman-desktop/api';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { Status } from './daemon-commander';
import { isWindows, productName, providerId } from './util';
import { daemonStart, daemonStop, getCrcVersion } from './crc-cli';
import { getCrcDetectionChecks } from './detection-checks';
import { CrcInstall } from './install/crc-install';

import { crcStatus } from './crc-status';
import { startCrc } from './crc-start';
import { isNeedSetup, needSetup } from './crc-setup';
import { deleteCrc, registerDeleteCommand } from './crc-delete';
import { syncPreferences } from './preferences';
import { stopCrc } from './crc-stop';
import { registerOpenTerminalCommand } from './dev-terminal';

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  const crcInstaller = new CrcInstall();
  extensionApi.configuration.getConfiguration();
  const crcVersion = await getCrcVersion();

  const detectionChecks: extensionApi.ProviderDetectionCheck[] = [];
  let status: extensionApi.ProviderStatus = 'not-installed';

  if (crcVersion) {
    status = 'installed';
    connectToCrc();
  }

  await needSetup();

  detectionChecks.push(...getCrcDetectionChecks(crcVersion));

  // create CRC provider
  const provider = extensionApi.provider.createProvider({
    name: productName,
    id: providerId,
    version: crcVersion?.version,
    status: status,
    detectionChecks: detectionChecks,
    images: {
      icon: './icon.png',
      logo: './icon.png',
    },
  });
  extensionContext.subscriptions.push(provider);

  const daemonStarted = await daemonStart();

  const providerLifecycle: extensionApi.ProviderLifecycle = {
    status: () => crcStatus.getProviderStatus(),

    start: context => {
      return startCrc(context.log);
    },
    stop: () => {
      return stopCrc();
    },
  };

  extensionContext.subscriptions.push(provider.registerLifecycle(providerLifecycle));

  if (!daemonStarted) {
    crcStatus.setErrorStatus();
    return;
  }

  registerDeleteCommand(extensionContext);
  registerOpenTerminalCommand(extensionContext);

  syncPreferences(extensionContext);

  if (!isNeedSetup) {
    // initial preset check
    presetChanged(provider, extensionContext);
  }

  if (crcInstaller.isAbleToInstall()) {
    const installationDisposable = provider.registerInstallation({
      preflightChecks: () => {
        return crcInstaller.getInstallChecks();
      },
      install: (logger: extensionApi.Logger) => {
        return crcInstaller.doInstallCrc(provider, logger, async (setupResult: boolean) => {
          if (!setupResult) {
            return;
          }
          await connectToCrc();
          presetChanged(provider, extensionContext);
        });
      },
    });
    extensionContext.subscriptions.push(installationDisposable);
  }
}

function registerPodmanConnection(provider: extensionApi.Provider, extensionContext: extensionApi.ExtensionContext) {
  let socketPath;

  if (isWindows()) {
    socketPath = '//./pipe/crc-podman';
  } else {
    socketPath = path.resolve(os.homedir(), '.crc/machines/crc/docker.sock');
  }

  if (fs.existsSync(socketPath)) {
    const status = () => crcStatus.getConnectionStatus();

    const containerConnection: extensionApi.ContainerProviderConnection = {
      name: 'Podman',
      type: 'podman',
      endpoint: {
        socketPath,
      },
      status,
    };

    const disposable = provider.registerContainerProviderConnection(containerConnection);
    extensionContext.subscriptions.push(disposable);
  } else {
    console.error(`Could not find crc podman socket at ${socketPath}`);
  }
}

export function deactivate(): void {
  console.log('stopping crc extension');

  daemonStop();

  crcStatus.stopStatusUpdate();
}

async function registerOpenShiftLocalCluster(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
): Promise<void> {
  const status = () => crcStatus.getConnectionStatus();
  const apiURL = 'https://api.crc.testing:6443';
  const kubernetesProviderConnection: extensionApi.KubernetesProviderConnection = {
    name: 'OpenShift',
    endpoint: {
      apiURL,
    },
    status,
    lifecycle: {
      delete: () => {
        return deleteCrc();
      },
      start: ctx => {
        return startCrc(ctx.log);
      },
      stop: () => {
        return stopCrc();
      },
    },
  };

  const disposable = provider.registerKubernetesProviderConnection(kubernetesProviderConnection);
  extensionContext.subscriptions.push(disposable);
}

function readPreset(crcStatus: Status): 'Podman' | 'OpenShift' | 'MicroShift' | 'unknown' {
  try {
    switch (crcStatus.Preset) {
      case 'podman':
        return 'Podman';
      case 'openshift':
        return 'OpenShift';
      case 'microshift':
        return 'MicroShift';
      default:
        return 'unknown';
    }
  } catch (err) {
    console.log('error while getting preset', err);
    return 'unknown';
  }
}

async function connectToCrc(): Promise<void> {
  await crcStatus.initialize();
  crcStatus.startStatusUpdate();
}

function presetChanged(provider: extensionApi.Provider, extensionContext: extensionApi.ExtensionContext): void {
  // TODO: handle situation if some cluster/connection was registered already

  // detect preset of CRC
  const preset = readPreset(crcStatus.status);
  if (preset === 'Podman') {
    // podman connection ?
    registerPodmanConnection(provider, extensionContext);
  } else if (preset === 'OpenShift') {
    // OpenShift
    registerOpenShiftLocalCluster(provider, extensionContext);
  }
}
