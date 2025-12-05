/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
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
import { expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli.js';
import * as daemon from './daemon-commander.js';
import type { Configuration } from './types.js';
import * as preferences from './preferences.js';
import * as crcStatus from './crc-status.js';

vi.mock('./crc-status', async () => {
  return {
    crcStatus: {
      onStatusChange: vi.fn(),
    },
  };
});

vi.mock('@podman-desktop/api', async () => {
  const EventEmitter = vi.fn();
  EventEmitter.prototype.fire = vi.fn();
  return {
    configuration: {
      getConfiguration: vi.fn(),
    },
    EventEmitter,
  };
});

test('should update configuration accordingly with params', async () => {
  vi.mocked(crcStatus);
  const updateConfigMock = vi.fn();
  const apiConfig: extensionApi.Configuration = {
    update: updateConfigMock,
    get: function <T>(): T {
      throw new Error('Function not implemented.');
    },
    has: function (): boolean {
      throw new Error('Function not implemented.');
    },
  };
  const configuration: Configuration = {
    cpus: 10,
    memory: 286102,
    'disk-size': 186,
    'pull-secret-file': 'file',
    preset: 'openshift',
  };

  vi.spyOn(daemon.commander, 'configGet').mockResolvedValue(configuration);
  vi.spyOn(extensionApi.configuration, 'getConfiguration').mockReturnValue(apiConfig);

  vi.spyOn(crcCli, 'getPreset').mockResolvedValue('openshift');

  const configSetMock = vi.spyOn(daemon.commander, 'configSet').mockImplementation(() => {
    return Promise.resolve();
  });
  await preferences.saveConfig({
    'crc.factory.openshift.cpus': '10',
    'crc.factory.openshift.memory': '300000000000',
    'crc.factory.disksize': '200000000000',
    'crc.factory.preset': 'openshift',
    'crc.factory.pullsecretfile': 'file',
  });

  expect(configSetMock).toHaveBeenCalledWith({
    cpus: 10,
    memory: 286102,
    'disk-size': 186,
    'pull-secret-file': 'file',
  });

  expect(updateConfigMock).toHaveBeenNthCalledWith(1, 'crc.factory.openshift.memory', 299999690752);
  expect(updateConfigMock).toHaveBeenNthCalledWith(2, 'crc.factory.openshift.cpus', 10);
  expect(updateConfigMock).toHaveBeenNthCalledWith(3, 'crc.factory.disksize', 199715979264);
  expect(updateConfigMock).toHaveBeenNthCalledWith(4, 'crc.factory.pullsecretfile', 'file');
});

test('should update OpenShift Local preset based on form selection using connection audit', async () => {
  const cliBinary = crcCli.getCrcCli();
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  await preferences.connectionAuditor({ 'crc.factory.disksize': '20000000', 'crc.factory.preset': 'microshift' });
  expect(crcCli.execPromise).toHaveBeenCalledWith(cliBinary, ['config', 'set', 'preset', 'microshift']);
});
