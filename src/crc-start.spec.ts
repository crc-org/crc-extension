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

import type * as extensionApi from '@podman-desktop/api';
import { beforeEach, expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli.js';
import * as crcSetup from './crc-setup.js';
import { startCrc } from './crc-start.js';
import * as logProvider from './log-provider.js';
import * as daemon from './daemon-commander.js';
import type { StartInfo } from './types.js';
import { crcStatus } from './crc-status.js';

vi.mock('@podman-desktop/api', async () => {
  return {
    EventEmitter: vi.fn(),
    window: {
      showErrorMessage: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.restoreAllMocks();
});

test('setUpCRC is skipped if already setup, it just perform the daemon start command', async () => {
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockImplementation(() => {
    return Promise.resolve();
  });
  const startDaemon = vi.spyOn(daemon.commander, 'start').mockResolvedValue({
    Status: 'Running',
  } as unknown as StartInfo);
  const setUpMock = vi.spyOn(crcSetup, 'setUpCrc');
  await startCrc(
    {
      updateStatus: vi.fn(),
    } as unknown as extensionApi.Provider,
    {} as extensionApi.Logger,
    { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
  );
  expect(setUpMock).not.toBeCalled();
  expect(startDaemon).toBeCalled();
});

test('set up CRC and then start the daemon', async () => {
  vi.spyOn(crcCli, 'execPromise').mockRejectedValue('daemon not running');

  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockImplementation(() => {
    return Promise.resolve();
  });
  const startDaemon = vi.spyOn(daemon.commander, 'start').mockResolvedValue({
    Status: 'Running',
  } as unknown as StartInfo);
  const setUpMock = vi.spyOn(crcSetup, 'setUpCrc').mockImplementation(() => Promise.resolve(true));
  await startCrc(
    {
      updateStatus: vi.fn(),
    } as unknown as extensionApi.Provider,
    {} as extensionApi.Logger,
    { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
  );
  expect(setUpMock).toBeCalled();
  expect(startDaemon).toBeCalled();
});

test('startCrc throws when start result is not Running', async () => {
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
  vi.spyOn(daemon.commander, 'start').mockResolvedValue({
    Status: 'Stopped',
  } as unknown as StartInfo);
  const updateStatus = vi.fn();

  await expect(
    startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
    ),
  ).rejects.toThrow('Error during starting');

  expect(updateStatus).toHaveBeenCalledWith('error');
});

test('startCrc throws when setup fails', async () => {
  vi.spyOn(crcCli, 'execPromise').mockRejectedValue('daemon not running');
  vi.spyOn(crcSetup, 'needSetup').mockResolvedValue(true);
  vi.spyOn(crcSetup, 'setUpCrc').mockRejectedValue(new Error('setup failed'));
  vi.spyOn(crcStatus, 'setSetupRunning').mockReturnValue();
  const updateStatus = vi.fn();

  await expect(
    startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      { error: vi.fn() } as unknown as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
    ),
  ).rejects.toThrow('setup failed');

  expect(updateStatus).toHaveBeenCalledWith('stopped');
});

test('startCrc throws on general error', async () => {
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
  vi.spyOn(daemon.commander, 'start').mockRejectedValue(new Error('connection timeout'));
  const updateStatus = vi.fn();

  await expect(
    startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
    ),
  ).rejects.toThrow('connection timeout');

  expect(updateStatus).toHaveBeenCalledWith('stopped');
});
