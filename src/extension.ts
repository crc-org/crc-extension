/**********************************************************************
 * Copyright (C) 2022-2024 Red Hat, Inc.
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
import { commander, isDaemonRunning } from './daemon-commander';
import { defaultPreset, getPresetLabel, isWindows, productName, providerId } from './util';
import type { CrcVersion } from './crc-cli';
import { getPreset } from './crc-cli';
import { getCrcVersion } from './crc-cli';
import { getCrcDetectionChecks } from './detection-checks';
import { CrcInstall } from './install/crc-install';

import { crcStatus } from './crc-status';
import { startCrc } from './crc-start';
import { needSetup, setUpCrc } from './crc-setup';
import { deleteCrc, registerDeleteCommand } from './crc-delete';
import { presetChangedEvent, saveConfig, syncPreferences } from './preferences';
import { stopCrc } from './crc-stop';
import { registerOpenTerminalCommand } from './dev-terminal';
import { commandManager } from './command';
import { registerOpenConsoleCommand } from './crc-console';
import { registerLogInCommands } from './login-commands';
import { defaultLogger } from './logger';
import { pushImageToCrcCluster } from './image-handler';
import type { Preset } from './types';

const CRC_PUSH_IMAGE_TO_CLUSTER = 'crc.image.push.to.cluster';
const CRC_PRESET_KEY = 'crc.crcPreset';

let connectionDisposable: extensionApi.Disposable;
let connectionFactoryDisposable: extensionApi.Disposable;

let crcVersion: CrcVersion | undefined;

function isNeedSetup() {
  return crcStatus.status.CrcStatus === 'Need Setup';
}

async function _activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  const crcInstaller = new CrcInstall(extensionContext.storagePath);

  crcVersion = await getCrcVersion();
  const telemetryLogger = extensionApi.env.createTelemetryLogger();

  const detectionChecks: extensionApi.ProviderDetectionCheck[] = [];
  let hasDaemonRunning = false;

  if (crcVersion) {
    await crcStatus.initialize();

    if (!isNeedSetup()) {
      await connectToCrc();
    }

    hasDaemonRunning = await isDaemonRunning();
  }

  detectionChecks.push(...getCrcDetectionChecks(crcVersion));

  commandManager.setExtContext(extensionContext);
  commandManager.setTelemetryLogger(telemetryLogger);

  const links: extensionApi.Link[] = [
    {
      title: 'Website',
      url: 'https://developers.redhat.com/products/openshift-local/overview',
    },
    {
      title: 'Installation guide',
      url: 'https://access.redhat.com/documentation/en-us/red_hat_openshift_local/2.18/html/getting_started_guide/installation_gsg',
    },
    {
      title: 'Obtain pull-secret',
      url: 'https://cloud.redhat.com/openshift/create/local',
    },
    {
      title: 'Troubleshooting',
      url: 'https://access.redhat.com/documentation/en-us/red_hat_openshift_local/2.18/html/getting_started_guide/troubleshooting_gsg',
    },
    {
      title: 'Repository',
      url: 'https://github.com/crc-org/crc-extension',
    },
  ];

  // create CRC provider
  const provider = extensionApi.provider.createProvider({
    name: productName,
    id: providerId,
    version: crcVersion?.version,
    status: crcStatus.getProviderStatus(),
    detectionChecks: detectionChecks,
    images: {
      icon: './icon.png',
      logo: './icon.png',
    },
    links,
    emptyConnectionMarkdownDescription:
      'Red Hat OpenShift Local is the quickest way to get started building OpenShift clusters. OpenShift Local is designed for local development and testing on an OpenShift cluster.\n\nMore information: [Red Hat OpenShift Local](https://developers.redhat.com/products/openshift-local/overview)',
  });
  extensionContext.subscriptions.push(provider);

  if (crcStatus.getProviderStatus() === 'installed' || crcStatus.status.CrcStatus === 'No Cluster') {
    registerProviderConnectionFactory(provider, extensionContext, telemetryLogger);
  }

  //if crc installed
  if (crcVersion) {
    // if daemon running we could sync preferences
    if (hasDaemonRunning) {
      syncPreferences(provider, extensionContext, telemetryLogger);
    }

    // if no need to setup we could add commands
    if (!isNeedSetup()) {
      addCommands(telemetryLogger);
    }

    // no need to setup and crc has cluster
    if (!isNeedSetup() && crcStatus.status.CrcStatus !== 'No Cluster') {
      presetChanged(provider, extensionContext, telemetryLogger);
    } else {
      // else get preset from cli as setup is not finished and daemon may not running
      const preset = await getPreset();
      extensionApi.context.setValue(CRC_PRESET_KEY, preset ?? 'openshift');
      if (preset) {
        updateProviderVersionWithPreset(provider, preset);
      }
    }
  }

  if (crcInstaller.isAbleToInstall()) {
    const installationDisposable = provider.registerInstallation({
      preflightChecks: () => {
        return crcInstaller.getInstallChecks();
      },
      install: (logger: extensionApi.Logger) => {
        return crcInstaller.doInstallCrc(provider, logger, async (setupResult: boolean, newVersion: CrcVersion) => {
          provider.updateStatus('installed');
          if (newVersion) {
            crcVersion = newVersion;
          }
          if (!setupResult) {
            return;
          }
          registerProviderConnectionFactory(provider, extensionContext, telemetryLogger);
          await connectToCrc();
          addCommands(telemetryLogger);
          syncPreferences(provider, extensionContext, telemetryLogger);
          presetChanged(provider, extensionContext, telemetryLogger);
        });
      },
    });
    extensionContext.subscriptions.push(installationDisposable);
  }

  if (crcVersion) {
    await registerCrcUpdate(crcVersion, crcInstaller, provider, telemetryLogger);
  }

  extensionContext.subscriptions.push(
    presetChangedEvent(() => {
      presetChanged(provider, extensionContext, telemetryLogger);
    }),
  );

  extensionContext.subscriptions.push(
    crcStatus.onStatusChange(e => {
      updateProviderVersionWithPreset(provider, e.Preset as Preset);
      provider.updateStatus(crcStatus.getProviderStatus());
    }),
  );
}

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  _activate(extensionContext).catch(console.error);
}

async function registerCrcUpdate(
  crcVersion: CrcVersion,
  crcInstaller: CrcInstall,
  provider: extensionApi.Provider,
  telemetry: extensionApi.TelemetryLogger,
): Promise<void> {
  try {
    const updateInfo = await crcInstaller.hasUpdate(crcVersion);
    if (updateInfo.hasUpdate) {
      provider.registerUpdate({
        version: updateInfo.newVersion.version.crcVersion,
        update: logger => {
          return crcInstaller.askForUpdate(provider, updateInfo, logger, telemetry);
        },
        preflightChecks: () => crcInstaller.getUpdatePreflightChecks(),
      });
    }
  } catch (error: unknown) {
    console.error(String(Error));
  }
}

function registerProviderConnectionFactory(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
): void {
  connectionFactoryDisposable = provider.setKubernetesProviderConnectionFactory(
    {
      initialize: async () => {
        await createCrcVm(provider, extensionContext, telemetryLogger, defaultLogger);
      },
      create: async (params, logger) => {
        await presetChanged(provider, extensionContext, telemetryLogger);
        await saveConfig(params);
        if (params['crc.factory.start.now']) {
          await createCrcVm(provider, extensionContext, telemetryLogger, logger);
        }
      },
    },
    {
      auditItems: () => {
        return Promise.resolve({ records: [] });
      },
    },
  );
  extensionContext.subscriptions.push(connectionFactoryDisposable);
}

async function createCrcVm(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
  logger: extensionApi.Logger,
): Promise<void> {
  // we already have an instance
  if (crcStatus.status.CrcStatus !== 'No Cluster' && !isNeedSetup()) {
    return;
  }

  if (!isNeedSetup()) {
    const initResult = await initializeCrc(provider, extensionContext, telemetryLogger, logger);
    if (!initResult) {
      throw new Error(`${productName} not initialized.`);
    }
  }

  const hasStarted = await startCrc(provider, logger, telemetryLogger);
  if (!connectionDisposable && hasStarted) {
    addCommands(telemetryLogger);
    presetChanged(provider, extensionContext, telemetryLogger);
  }
}

async function initializeCrc(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
  logger: extensionApi.Logger,
): Promise<boolean> {
  const hasSetupFinished = await setUpCrc(logger, true);
  if (hasSetupFinished) {
    await needSetup();
    await connectToCrc();
    presetChanged(provider, extensionContext, telemetryLogger);
    addCommands(telemetryLogger);
    syncPreferences(provider, extensionContext, telemetryLogger);
  }
  return hasSetupFinished;
}

function addCommands(telemetryLogger: extensionApi.TelemetryLogger): void {
  registerOpenTerminalCommand();
  registerOpenConsoleCommand();
  registerLogInCommands();
  registerDeleteCommand();

  commandManager.addCommand(CRC_PUSH_IMAGE_TO_CLUSTER, image => {
    telemetryLogger.logUsage('pushImage');
    pushImageToCrcCluster(image);
  });
}

function deleteCommands(): void {
  commandManager.dispose();
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
  crcStatus.stopStatusUpdate();
}

async function registerOpenShiftLocalCluster(
  name,
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<void> {
  const status = () => crcStatus.getConnectionStatus();
  const apiURL = 'https://api.crc.testing:6443';
  const kubernetesProviderConnection: extensionApi.KubernetesProviderConnection = {
    name,
    endpoint: {
      apiURL,
    },
    status,
  };

  connectionDisposable = provider.registerKubernetesProviderConnection(kubernetesProviderConnection);
  kubernetesProviderConnection.lifecycle = {
    delete: () => {
      return handleDelete(provider, extensionContext, telemetryLogger);
    },
    start: async ctx => {
      provider.updateStatus('starting');
      await startCrc(provider, ctx.log, telemetryLogger);
    },
    stop: () => {
      provider.updateStatus('stopping');
      return stopCrc(telemetryLogger);
    },
  };
  extensionContext.subscriptions.push(connectionDisposable);
}

async function handleDelete(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<void> {
  const deleteResult = await deleteCrc(true);
  // delete performed
  if (deleteResult) {
    registerProviderConnectionFactory(provider, extensionContext, telemetryLogger);
    deleteCommands();
    if (connectionDisposable) {
      connectionDisposable.dispose();
    }
  }
}

async function readPreset(): Promise<Preset> {
  try {
    const config = await commander.configGet();
    return config.preset;
  } catch (err) {
    console.log('error while getting preset', err);
    // return default one
    return defaultPreset;
  }
}

async function connectToCrc(): Promise<void> {
  await crcStatus.initialize();
  crcStatus.startStatusUpdate();
}

function updateProviderVersionWithPreset(provider: extensionApi.Provider, preset: Preset): void {
  provider.updateVersion(`${crcVersion.version} (${getPresetLabel(preset)})`);
}

async function presetChanged(
  provider: extensionApi.Provider,
  extensionContext: extensionApi.ExtensionContext,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<void> {
  // detect preset of CRC
  const preset = await readPreset();
  extensionApi.context.setValue(CRC_PRESET_KEY, preset);
  updateProviderVersionWithPreset(provider, preset);

  if (connectionDisposable) {
    connectionDisposable.dispose();
    connectionDisposable = undefined;
  }

  if (preset === 'podman') {
    // do nothing
    extensionApi.window.showInformationMessage(
      'Currently we do not support the Podman preset of OpenShift Local. Please use preference to change this:\n\nSettings > Preferences > Red Hat OpenShift Local > Preset',
      'OK',
    );

    // podman connection
    registerPodmanConnection(provider, extensionContext);
  } else if (preset === 'openshift' || preset === 'microshift') {
    registerOpenShiftLocalCluster(getPresetLabel(preset), provider, extensionContext, telemetryLogger);
  }
}
