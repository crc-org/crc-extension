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
import type { CrcStatus, Status } from './daemon-commander';
import { commander } from './daemon-commander';
import { LogProvider } from './log-provider';
import { isWindows, productName } from './util';
import { daemonStart, daemonStop, getCrcVersion, needSetup } from './crc-cli';
import { getCrcDetectionChecks } from './detection-checks';
import { CrcInstall } from './install/crc-install';
import { setUpCrc } from './crc-setup';

let statusFetchTimer: NodeJS.Timer;

let crcStatus: Status;

const crcLogProvider = new LogProvider(commander);

const defaultStatus: Status = { CrcStatus: 'Unknown', Preset: 'Unknown' };
const errorStatus: Status = { CrcStatus: 'Error', Preset: 'Unknown' };

let isNeedSetup = false;
let isSetupGoing = false;

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  const crcInstaller = new CrcInstall();

  const crcVersion = await getCrcVersion();

  const detectionChecks: extensionApi.ProviderDetectionCheck[] = [];
  let status: extensionApi.ProviderStatus = 'not-installed';

  if (crcVersion) {
    status = 'installed';
  }
  crcStatus = defaultStatus;

  isNeedSetup = await needSetup();
  if (crcVersion) {
    connectToCrc();
  }

  detectionChecks.push(...getCrcDetectionChecks(crcVersion));

  // create CRC provider
  const provider = extensionApi.provider.createProvider({
    name: productName,
    id: 'crc',
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
    status: () => convertToProviderStatus(crcStatus?.CrcStatus),

    start: context => {
      return startCrc(context.log);
    },
    stop: () => {
      return stopCrc();
    },
  };

  extensionContext.subscriptions.push(provider.registerLifecycle(providerLifecycle));

  if (!daemonStarted) {
    crcStatus = errorStatus;
    return;
  }

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
    const status = () => convertToConnectionStatus(crcStatus?.CrcStatus);

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

  stopUpdateTimer();
}

async function registerOpenShiftLocalCluster(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
): Promise<void> {
  const status = () => convertToConnectionStatus(crcStatus?.CrcStatus);
  const apiURL = 'https://api.crc.testing:6443';
  const kubernetesProviderConnection: extensionApi.KubernetesProviderConnection = {
    name: 'OpenShift',
    endpoint: {
      apiURL,
    },
    status,
  };

  const disposable = provider.registerKubernetesProviderConnection(kubernetesProviderConnection);
  extensionContext.subscriptions.push(disposable);
}

function convertToConnectionStatus(crcStatus: string): extensionApi.ProviderConnectionStatus {
  switch (crcStatus) {
    case 'Running':
      return 'started';
    case 'Starting':
      return 'starting';
    case 'Stopping':
      return 'stopping';
    case 'Stopped':
    case 'No Cluster':
      return 'stopped';
    default:
      return 'unknown';
  }
}

function convertToProviderStatus(crcStatus: string): extensionApi.ProviderStatus {
  switch (crcStatus) {
    case 'Running':
      return 'started';
    case 'Starting':
      return 'starting';
    case 'Stopping':
      return 'stopping';
    case 'Stopped':
      return 'stopped';
    case 'No Cluster':
      return 'stopped';
    case 'Error':
      return 'error';
    default:
      return 'not-installed';
  }
}

async function startStatusUpdateTimer(): Promise<void> {
  if (statusFetchTimer) {
    return; // we already set timer
  }
  statusFetchTimer = setInterval(async () => {
    try {
      // we don't need to update status while setup is going
      if (isSetupGoing) {
        crcStatus = createStatus('Starting', crcStatus.Preset);
        return;
      }
      crcStatus = await commander.status();
    } catch (e) {
      console.error('CRC Status tick: ' + e);
      crcStatus = defaultStatus;
    }
  }, 1000);
}

function stopUpdateTimer(): void {
  if (statusFetchTimer) {
    clearInterval(statusFetchTimer);
  }
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
  try {
    // initial status
    crcStatus = await commander.status();
  } catch (err) {
    console.error('error in CRC extension', err);
    crcStatus = defaultStatus;
  }

  startStatusUpdateTimer();
}

function presetChanged(provider: extensionApi.Provider, extensionContext: extensionApi.ExtensionContext): void {
  // TODO: handle situation if some cluster/connection was registered already

  // detect preset of CRC
  const preset = readPreset(crcStatus);
  if (preset === 'Podman') {
    // podman connection ?
    registerPodmanConnection(provider, extensionContext);
  } else if (preset === 'OpenShift') {
    // OpenShift
    registerOpenShiftLocalCluster(provider, extensionContext);
  }
}

async function startCrc(logger: extensionApi.Logger): Promise<void> {
  try {
    // call crc setup to prepare bundle, before start
    if (isNeedSetup) {
      try {
        isSetupGoing = true;
        crcStatus = createStatus('Starting', crcStatus.Preset);
        await setUpCrc(logger);
        isNeedSetup = false;
      } catch (error) {
        logger.error(error);
        return;
      } finally {
        isSetupGoing = false;
      }
    }
    crcLogProvider.startSendingLogs(logger);
    await commander.start();
  } catch (err) {
    console.error(err);
  }
}

async function stopCrc(): Promise<void> {
  console.log('extension:crc: receive the call stop');
  try {
    await commander.stop();
    crcLogProvider.stopSendingLogs();
  } catch (err) {
    console.error(err);
  }
}

function createStatus(crcStatus: CrcStatus, preset: string): Status {
  return {
    CrcStatus: crcStatus,
    Preset: preset,
  };
}
