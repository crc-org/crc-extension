/**********************************************************************
 * Copyright (C) 2024-2026 Red Hat, Inc.
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

import { beforeEach, expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli.js';
import * as daemon from './daemon-commander.js';
import type { Configuration } from './types.js';
import * as preferences from './preferences.js';
import * as crcStatus from './crc-status.js';
import { EventEmitter, process } from '@podman-desktop/api';

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
  EventEmitter.prototype.event = vi.fn();
  return {
    configuration: {
      getConfiguration: vi.fn(),
    },
    process: {
      exec: vi.fn(),
    },
    EventEmitter,
  };
});

beforeEach(() => {
  vi.resetAllMocks();
});

test('should update configuration accordingly with params', async () => {
  vi.mocked(crcStatus);
  const configuration: Configuration = {
    cpus: 10,
    memory: 286102,
    'disk-size': 186,
    'pull-secret-file': 'file',
    preset: 'openshift',
  };

  vi.spyOn(daemon.commander, 'configGet').mockResolvedValue(configuration);

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
});

test('should update OpenShift Local preset based on form selection using connection audit', async () => {
  vi.spyOn(crcCli, 'getPreset').mockResolvedValue('openshift');

  await preferences.connectionAuditor({ 'crc.factory.disksize': '20000000', 'crc.factory.preset': 'microshift' });
  expect(process.exec).toHaveBeenCalledWith(expect.any(String), ['config', 'set', 'preset', 'microshift']);
});

test.each<{ value: string; expected: boolean }>([
  { value: 'openshift', expected: true },
  { value: 'microshift', expected: true },
  { value: 'podman', expected: true },
  { value: 'invalid', expected: false },
  { value: '', expected: false },
])('isPreset($value) returns $expected', ({ value, expected }) => {
  expect(preferences.isPreset(value)).toBe(expected);
});

test('presetChanged fires the event emitter with the given preset', () => {
  preferences.presetChanged('microshift');

  expect(EventEmitter.prototype.fire).toHaveBeenCalledTimes(1);
  expect(EventEmitter.prototype.fire).toHaveBeenCalledWith('microshift');
});
