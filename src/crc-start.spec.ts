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

import * as extensionApi from '@podman-desktop/api';
import { AccountManagementV1 } from './rh-api/rhaccm-client.js';
import { beforeEach, expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli.js';
import * as crcSetup from './crc-setup.js';
import { AuthenticationScopes, startCrc } from './crc-start.js';
import * as logProvider from './log-provider.js';
import * as daemon from './daemon-commander.js';
import type { StartInfo } from './types.js';
import { crcStatus } from './crc-status.js';

vi.mock('@podman-desktop/api', async () => {
  return {
    EventEmitter: vi.fn(),
    window: {
      showErrorMessage: vi.fn(),
      showInputBox: vi.fn(),
    },
    authentication: {
      getSession: vi.fn(),
    },
  };
});

vi.mock('./rh-api/rhaccm-client.js', () => ({
  AccountManagementV1: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(extensionApi.window.showErrorMessage).mockReset();
  vi.mocked(extensionApi.window.showInputBox).mockReset();
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

const pullSecretCfg = {
  auths: {
    'registry.redhat.io': { auth: 'dXNlcjpwYXNz' },
  },
};

function mockAccountManagement(getPullSecret: ReturnType<typeof vi.fn>): void {
  vi.mocked(AccountManagementV1).mockImplementation(function AccountManagementV1Mock() {
    return { getPullSecret };
  } as unknown as typeof AccountManagementV1);
}

function mockMissingPullSecretStart(): void {
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
  vi.spyOn(daemon.commander, 'start')
    .mockRejectedValueOnce(new Error('Failed to ask for pull secret'))
    .mockResolvedValueOnce({ Status: 'Running' } as unknown as StartInfo);
}

test('obtains pull secret from REST service using SSO token and starts successfully', async () => {
  const accessToken = 'sso-access-token';
  const getPullSecret = vi.fn().mockResolvedValue(pullSecretCfg);
  mockAccountManagement(getPullSecret);
  mockMissingPullSecretStart();
  const pullSecretStore = vi.spyOn(daemon.commander, 'pullSecretStore').mockResolvedValue('');
  vi.mocked(extensionApi.authentication.getSession).mockResolvedValue({
    accessToken,
  } as extensionApi.AuthenticationSession);
  const updateStatus = vi.fn();

  await startCrc(
    { updateStatus } as unknown as extensionApi.Provider,
    {} as extensionApi.Logger,
    { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
  );

  expect(extensionApi.authentication.getSession).toHaveBeenCalledWith(
    'redhat.authentication-provider',
    AuthenticationScopes,
    { createIfNone: true },
  );
  expect(AccountManagementV1).toHaveBeenCalledWith(accessToken);
  expect(getPullSecret).toHaveBeenCalledOnce();
  expect(pullSecretStore).toHaveBeenCalledWith(JSON.stringify(pullSecretCfg));
  expect(extensionApi.window.showErrorMessage).not.toHaveBeenCalledWith(
    'Failed to obtain pull secret. Do you want to provide a *pull secret* manually?',
    'Yes',
    'No',
  );
  expect(extensionApi.window.showInputBox).not.toHaveBeenCalled();
  expect(updateStatus).toHaveBeenCalledWith('started');
});

test('asks for a manual pull secret when REST service fails and user accepts', async () => {
  const getPullSecret = vi.fn().mockRejectedValue(new Error('Auth token is invalid'));
  mockAccountManagement(getPullSecret);
  mockMissingPullSecretStart();
  const pullSecretStore = vi.spyOn(daemon.commander, 'pullSecretStore').mockResolvedValue('');
  vi.mocked(extensionApi.authentication.getSession).mockResolvedValue({
    accessToken: 'sso-access-token',
  } as extensionApi.AuthenticationSession);
  vi.spyOn(extensionApi.window, 'showErrorMessage').mockResolvedValue('Yes');
  vi.spyOn(extensionApi.window, 'showInputBox').mockResolvedValue(JSON.stringify(pullSecretCfg));
  const updateStatus = vi.fn();

  await startCrc(
    { updateStatus } as unknown as extensionApi.Provider,
    {} as extensionApi.Logger,
    { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
  );

  expect(getPullSecret).toHaveBeenCalledOnce();
  expect(extensionApi.window.showErrorMessage).toHaveBeenCalledWith(
    'Failed to obtain pull secret. Do you want to provide a *pull secret* manually?',
    'Yes',
    'No',
  );
  expect(extensionApi.window.showInputBox).toHaveBeenCalledOnce();
  expect(pullSecretStore).toHaveBeenCalledWith(JSON.stringify(pullSecretCfg));
  expect(updateStatus).toHaveBeenCalledWith('started');
});

test('does not start when REST service fails and user declines a manual pull secret', async () => {
  const getPullSecret = vi.fn().mockRejectedValue(new Error('Auth token is invalid'));
  mockAccountManagement(getPullSecret);
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
  vi.spyOn(daemon.commander, 'start').mockRejectedValue(new Error('Failed to ask for pull secret'));
  const pullSecretStore = vi.spyOn(daemon.commander, 'pullSecretStore').mockResolvedValue('');
  vi.mocked(extensionApi.authentication.getSession).mockResolvedValue({
    accessToken: 'sso-access-token',
  } as extensionApi.AuthenticationSession);
  vi.spyOn(extensionApi.window, 'showErrorMessage').mockResolvedValue('No');
  const updateStatus = vi.fn();

  await expect(
    startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
    ),
  ).rejects.toThrow('Could not start without pullsecret!');

  expect(extensionApi.window.showInputBox).not.toHaveBeenCalled();
  expect(pullSecretStore).not.toHaveBeenCalled();
});
