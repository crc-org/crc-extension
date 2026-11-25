/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
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
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { getPreset } from './crc-cli.js';
import { deleteCrc, onDidDeleteCrc } from './crc-delete.js';
import { startCrc } from './crc-start.js';
import { crcStatus } from './crc-status.js';
import { getCrcDetectionChecks } from './detection-checks.js';
import { activate } from './extension.js';

vi.mock('./crc-cli.js');
vi.mock('./detection-checks.js');
vi.mock('./crc-status.js');
vi.mock('./crc-start.js');
vi.mock('./crc-delete.js');
vi.mock('./preferences.js');
vi.mock('./command.js');

const provider = {
  setKubernetesProviderConnectionFactory: vi.fn(),
  registerKubernetesProviderConnection: vi.fn(),
  updateVersion: vi.fn(),
  updateStatus: vi.fn(),
};
let factory: extensionApi.KubernetesProviderConnectionFactory;
let onCrcDeleted: () => void;

beforeAll(async () => {
  vi.mocked(getCrcDetectionChecks).mockReturnValue([]);
  vi.mocked(crcStatus.getProviderStatus).mockReturnValue('installed');
  vi.mocked(extensionApi.provider.createProvider).mockReturnValue(provider as unknown as extensionApi.Provider);

  await activate({ subscriptions: [], secrets: {} } as unknown as extensionApi.ExtensionContext);
  await vi.waitFor(() => expect(provider.setKubernetesProviderConnectionFactory).toHaveBeenCalled());
  factory = provider.setKubernetesProviderConnectionFactory.mock.calls[0][0];
  onCrcDeleted = vi.mocked(onDidDeleteCrc).mock.calls[0][0];
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(crcStatus, 'status', 'get').mockReturnValue({ CrcStatus: 'No Cluster' });
  vi.mocked(getPreset).mockResolvedValue('openshift');
  vi.mocked(extensionApi.configuration.getConfiguration).mockReturnValue({
    update: vi.fn(),
  } as unknown as extensionApi.Configuration);
  provider.registerKubernetesProviderConnection.mockReturnValue({ dispose: vi.fn() });
});

afterEach(() => {
  // the registered connection is disposed
  onCrcDeleted();
});

test('create starts the machine and registers the connection when crc.factory.start.now is true', async () => {
  await factory.create?.({ 'crc.factory.preset': 'openshift', 'crc.factory.start.now': true });

  expect(startCrc).toHaveBeenCalledOnce();
  expect(provider.registerKubernetesProviderConnection).toHaveBeenCalledOnce();
});

test('create registers the connection without starting when crc.factory.start.now is false', async () => {
  await factory.create?.({ 'crc.factory.preset': 'openshift', 'crc.factory.start.now': false });

  expect(startCrc).not.toHaveBeenCalled();
  expect(provider.registerKubernetesProviderConnection).toHaveBeenCalledOnce();
});

test('initialize registers the connection without starting the machine', async () => {
  await factory.initialize?.();

  expect(startCrc).not.toHaveBeenCalled();
  expect(provider.registerKubernetesProviderConnection).toHaveBeenCalledOnce();
});

test('deleting a connection without a machine disposes the connection without calling deleteCrc', async () => {
  const connectionDisposable = { dispose: vi.fn() };
  provider.registerKubernetesProviderConnection.mockReturnValue(connectionDisposable);
  await factory.create?.({ 'crc.factory.preset': 'openshift', 'crc.factory.start.now': false });
  const connection: extensionApi.KubernetesProviderConnection =
    provider.registerKubernetesProviderConnection.mock.calls[0][0];

  await connection.lifecycle?.delete?.();

  expect(deleteCrc).not.toHaveBeenCalled();
  expect(connectionDisposable.dispose).toHaveBeenCalledOnce();
});

test('deleting a connection with an existing machine calls deleteCrc', async () => {
  await factory.create?.({ 'crc.factory.preset': 'openshift', 'crc.factory.start.now': false });
  const connection: extensionApi.KubernetesProviderConnection =
    provider.registerKubernetesProviderConnection.mock.calls[0][0];
  vi.spyOn(crcStatus, 'status', 'get').mockReturnValue({ CrcStatus: 'Stopped' });

  await connection.lifecycle?.delete?.();

  expect(deleteCrc).toHaveBeenCalledWith(true);
});
