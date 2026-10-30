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

import * as fs from 'node:fs/promises';

import * as extensionApi from '@podman-desktop/api';
import { AccountManagementClient } from '@redhat-developer/rhaccm-client';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli.js';
import * as crcSetup from './crc-setup.js';
import { AuthenticationScopes, safeStorageErrorMessage, startCrc } from './crc-start.js';
import * as logProvider from './log-provider.js';
import * as daemon from './daemon-commander.js';
import * as macStart from './crc-start-macos.js';
import * as util from './util.js';
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

vi.mock('@redhat-developer/rhaccm-client', () => ({
  AccountManagementClient: vi.fn(),
}));

vi.mock('node:fs/promises');

vi.mock('./crc-start-macos.js', () => ({
  start: vi.fn(),
  SECRET_KEY: 'pull-secret',
}));

vi.mock('./crc-cli.js');

beforeEach(() => {
  vi.restoreAllMocks();
  // Default to non-macOS so existing tests keep working
  vi.spyOn(util, 'isMac').mockReturnValue(false);
});

test('setUpCRC is skipped if already setup, it just perform the daemon start command', async () => {
  vi.mocked(crcCli.execPromise).mockResolvedValue('');
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
  vi.mocked(crcCli.execPromise).mockRejectedValue('daemon not running');

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
  vi.mocked(crcCli.execPromise).mockResolvedValue('');
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
  vi.mocked(crcCli.execPromise).mockRejectedValue('daemon not running');
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
  vi.mocked(crcCli.execPromise).mockResolvedValue('');
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

test('obtains pull secret from REST service using SSO token and starts successfully', async () => {
  const accessToken = 'sso-access-token';
  const pullSecretCfg = {
    auths: {
      'registry.redhat.io': { auth: 'dXNlcjpwYXNz' },
    },
  };
  const postApiAccountsMgmtV1AccessToken = vi.fn().mockResolvedValue(pullSecretCfg);
  vi.mocked(AccountManagementClient).mockImplementation(function AccountManagementClientMock() {
    return {
      default: { postApiAccountsMgmtV1AccessToken },
    };
  } as unknown as typeof AccountManagementClient);
  vi.mocked(crcCli.execPromise).mockResolvedValue('');
  vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
  vi.spyOn(daemon.commander, 'start')
    .mockRejectedValueOnce(new Error('Failed to ask for pull secret'))
    .mockResolvedValueOnce({ Status: 'Running' } as unknown as StartInfo);
  vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue(undefined);
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
  expect(AccountManagementClient).toHaveBeenCalledWith({
    BASE: 'https://api.openshift.com',
    TOKEN: accessToken,
  });
  expect(postApiAccountsMgmtV1AccessToken).toHaveBeenCalledOnce();
  expect(pullSecretStore).toHaveBeenCalledWith(JSON.stringify(pullSecretCfg));
  expect(extensionApi.window.showInputBox).not.toHaveBeenCalled();
  expect(updateStatus).toHaveBeenCalledWith('started');
});

// -------------------------------------------------------------------------
// pull-secret-file validation tests
// -------------------------------------------------------------------------

describe('pull-secret-file validation on start failure', () => {
  beforeEach(() => {
    vi.mocked(crcCli.execPromise).mockResolvedValue('');
    vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
    vi.spyOn(daemon.commander, 'start').mockRejectedValue(new Error('Failed to ask for pull secret'));
  });

  test('throws file-missing error when configured pull-secret-file does not exist', async () => {
    vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue('/home/user/.crc/pull-secret.json');
    vi.mocked(fs.access).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(
      startCrc(
        { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
        {} as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      ),
    ).rejects.toThrow('does not exist');
  });

  test('throws invalid-content error when configured pull-secret-file exists', async () => {
    vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue('/home/user/.crc/pull-secret.json');
    vi.mocked(fs.access).mockResolvedValue(undefined);

    await expect(
      startCrc(
        { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
        {} as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      ),
    ).rejects.toThrow('invalid content');
  });

  test('falls through to prompt when no pull-secret-file is configured', async () => {
    vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue(undefined);
    vi.mocked(extensionApi.authentication.getSession).mockResolvedValue(undefined);
    vi.mocked(extensionApi.window.showInputBox).mockResolvedValue(undefined);

    await expect(
      startCrc(
        { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
        {} as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      ),
    ).rejects.toThrow('Could not start without pullsecret');
  });

  test('falls through to prompt when getPullSecretFilePath rejects', async () => {
    vi.mocked(crcCli.getPullSecretFilePath).mockRejectedValue(new Error('crc binary not found'));
    vi.mocked(extensionApi.authentication.getSession).mockResolvedValue(undefined);
    vi.mocked(extensionApi.window.showInputBox).mockResolvedValue(undefined);

    await expect(
      startCrc(
        { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
        {} as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      ),
    ).rejects.toThrow('Could not start without pullsecret');
  });
});

// -------------------------------------------------------------------------
// macOS-specific tests
// -------------------------------------------------------------------------

describe('macOS path', () => {
  const mockSecrets = {
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
  } as unknown as extensionApi.SecretStorage;

  beforeEach(() => {
    vi.spyOn(util, 'isMac').mockReturnValue(true);
    vi.mocked(crcCli.execPromise).mockResolvedValue('');
    vi.spyOn(logProvider.crcLogProvider, 'startSendingLogs').mockResolvedValue();
    vi.mocked(crcCli.isPullSecretFileConfigSet).mockResolvedValue(false);
  });

  test('throws when secrets is undefined on macOS start path', async () => {
    await expect(
      startCrc(
        { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
        {} as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
        // secrets not passed
      ),
    ).rejects.toThrow(safeStorageErrorMessage);
  });

  test('uses macStart.start() instead of commander.start() on macOS', async () => {
    vi.mocked(macStart.start).mockResolvedValue({ Status: 'Running' } as StartInfo);
    const startDaemon = vi.spyOn(daemon.commander, 'start');
    const updateStatus = vi.fn();

    await startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      mockSecrets,
    );

    expect(macStart.start).toHaveBeenCalledWith(mockSecrets, expect.anything());
    expect(startDaemon).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledWith('started');
  });

  test('uses commander.start() when pull-secret-file config is already set', async () => {
    vi.mocked(crcCli.isPullSecretFileConfigSet).mockResolvedValue(true);
    vi.mocked(macStart.start).mockClear();
    vi.spyOn(crcSetup, 'needSetup').mockResolvedValue(false);
    const startDaemon = vi.spyOn(daemon.commander, 'start').mockResolvedValue({
      Status: 'Running',
    } as unknown as StartInfo);
    const updateStatus = vi.fn();

    await startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      mockSecrets,
    );

    expect(startDaemon).toHaveBeenCalled();
    expect(macStart.start).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledWith('started');
  });

  test('uses commander.start() on non-macOS', async () => {
    vi.spyOn(util, 'isMac').mockReturnValue(false);
    vi.mocked(macStart.start).mockReset();
    const startDaemon = vi.spyOn(daemon.commander, 'start').mockResolvedValue({
      Status: 'Running',
    } as unknown as StartInfo);

    await startCrc(
      { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
    );

    expect(startDaemon).toHaveBeenCalled();
    expect(macStart.start).not.toHaveBeenCalled();
  });

  test('macOS start error triggers missing-pull-secret prompt', async () => {
    vi.mocked(macStart.start)
      .mockRejectedValueOnce(new Error('Failed to ask for pull secret: no pull secret found in storage'))
      .mockResolvedValueOnce({ Status: 'Running' } as StartInfo);
    vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue(undefined);

    const pullSecretCfg = {
      auths: { 'registry.redhat.io': { auth: 'dXNlcjpwYXNz' } },
    };
    vi.mocked(extensionApi.authentication.getSession).mockResolvedValue({
      accessToken: 'token',
    } as extensionApi.AuthenticationSession);
    const postApiAccountsMgmtV1AccessToken = vi.fn().mockResolvedValue(pullSecretCfg);
    vi.mocked(AccountManagementClient).mockImplementation(function () {
      return { default: { postApiAccountsMgmtV1AccessToken } };
    } as unknown as typeof AccountManagementClient);
    const pullSecretStoreSpy = vi.spyOn(daemon.commander, 'pullSecretStore').mockResolvedValue('');
    const updateStatus = vi.fn();

    await startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      mockSecrets,
    );

    expect(mockSecrets.store).toHaveBeenCalledWith('pull-secret', JSON.stringify(pullSecretCfg));
    expect(pullSecretStoreSpy).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledWith('started');
  });

  test('macOS stores pull secret via secrets.store, not commander', async () => {
    // First call: missing pull secret, second call: success
    vi.mocked(macStart.start)
      .mockRejectedValueOnce(new Error('Failed to ask for pull secret: no pull secret'))
      .mockResolvedValueOnce({ Status: 'Running' } as StartInfo);
    vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue(undefined);

    vi.mocked(extensionApi.authentication.getSession).mockResolvedValue(undefined);
    vi.mocked(extensionApi.window.showInputBox).mockResolvedValue('{"auths":{"reg.io":{"auth":"abc"}}}');

    const pullSecretStoreSpy = vi.spyOn(daemon.commander, 'pullSecretStore').mockResolvedValue('');
    const updateStatus = vi.fn();

    await startCrc(
      { updateStatus } as unknown as extensionApi.Provider,
      {} as extensionApi.Logger,
      { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
      mockSecrets,
    );

    expect(mockSecrets.store).toHaveBeenCalledWith('pull-secret', '{"auths":{"reg.io":{"auth":"abc"}}}');
    expect(pullSecretStoreSpy).not.toHaveBeenCalled();
  });

  test('macOS with configured pull-secret-file throws file-missing error', async () => {
    vi.mocked(crcCli.isPullSecretFileConfigSet).mockResolvedValue(true);
    vi.spyOn(daemon.commander, 'start').mockRejectedValue(new Error('Failed to ask for pull secret'));
    vi.mocked(crcCli.getPullSecretFilePath).mockResolvedValue('/home/user/.crc/pull-secret.json');
    vi.mocked(fs.access).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(
      startCrc(
        { updateStatus: vi.fn() } as unknown as extensionApi.Provider,
        { error: vi.fn() } as unknown as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
        mockSecrets,
      ),
    ).rejects.toThrow('does not exist');

    expect(extensionApi.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
  });

  test('refuses to start when secrets is undefined on macOS with no configured file', async () => {
    // isPullSecretFileConfigSet defaults to false in beforeEach — no file configured.
    // Without secrets on macOS the start-path guard throws before any start call.
    const updateStatus = vi.fn();

    await expect(
      startCrc(
        { updateStatus } as unknown as extensionApi.Provider,
        { error: vi.fn() } as unknown as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
        // secrets not passed
      ),
    ).rejects.toThrow(safeStorageErrorMessage);

    expect(updateStatus).toHaveBeenCalledWith('stopped');
  });

  test('macOS non-Running result sets error status', async () => {
    vi.mocked(macStart.start).mockResolvedValue({ Status: 'Stopped' } as StartInfo);
    const updateStatus = vi.fn();

    await expect(
      startCrc(
        { updateStatus } as unknown as extensionApi.Provider,
        {} as extensionApi.Logger,
        { logUsage: vi.fn() } as unknown as extensionApi.TelemetryLogger,
        mockSecrets,
      ),
    ).rejects.toThrow('Error during starting');

    expect(updateStatus).toHaveBeenCalledWith('error');
  });
});
