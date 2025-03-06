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
import { expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli.js';
import * as crcSetup from './crc-setup.js';
import { startCrc } from './crc-start.js';
import * as logProvider from './log-provider.js';
import * as daemon from './daemon-commander.js';
import type { StartInfo } from './types.js';
import { getLoggerCallback } from './util.js';

vi.mock('@podman-desktop/api', async () => {
  return {
    EventEmitter: vi.fn(),
  };
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
    getLoggerCallback(),
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
    getLoggerCallback(),
    { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
  );
  expect(setUpMock).toBeCalled();
  expect(startDaemon).toBeCalled();
});
