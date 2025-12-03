/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
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
import type { Status } from './types.js';
import { crcStatus } from './crc-status.js';
import { Disposable } from '@podman-desktop/api';
import { CommandManager } from './command.js';
import * as extensionApi from '@podman-desktop/api';

vi.mock('./crc-status', () => {
  return {
    crcStatus: {
      status: { CrcStatus: 'Stopped' } as Status,
      onStatusChange: vi.fn(),
    },
  };
});

vi.mock('@podman-desktop/api', async () => {
  return {
    tray: {
      registerProviderMenuItem: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(),
    },
    Disposable: {
      from: vi.fn(),
    },
  };
});

const telemetryLoggerMock: extensionApi.TelemetryLogger = {
  logUsage: vi.fn(),
} as unknown as extensionApi.TelemetryLogger;

beforeEach(() => {
  vi.resetAllMocks();
});

test('commands are reregistered on crc status change to running including CRC_PUSH_IMAGE_TO_CLUSTER', () => {
  let statusChangeEvent;
  vi.mocked(crcStatus.onStatusChange).mockImplementation(fn => {
    statusChangeEvent = fn;
    return Disposable.from();
  });

  const commandManager = new CommandManager();
  commandManager.setTelemetryLogger(telemetryLoggerMock);
  expect(statusChangeEvent).toBeDefined();

  statusChangeEvent({ CrcStatus: 'Running' });

  expect(extensionApi.commands.registerCommand).toHaveBeenCalledTimes(6);
});

test('commands are reregistered on crc status change to not running excluding CRC_PUSH_IMAGE_TO_CLUSTER', () => {
  let statusChangeEvent: (e: Status) => unknown;
  vi.mocked(crcStatus.onStatusChange).mockImplementation(fn => {
    statusChangeEvent = fn;
    return Disposable.from();
  });

  const commandManager = new CommandManager();
  commandManager.setTelemetryLogger(telemetryLoggerMock);
  expect(statusChangeEvent).toBeDefined();

  statusChangeEvent({ CrcStatus: 'Stopping' });

  expect(extensionApi.commands.registerCommand).toHaveBeenCalledTimes(5);
});
