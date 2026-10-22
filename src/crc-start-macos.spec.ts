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

import * as fs from 'node:fs/promises';
import * as os from 'node:os';

import type * as extensionApi from '@podman-desktop/api';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import * as crcCli from './crc-cli.js';
import { start } from './crc-start-macos.js';
import * as daemon from './daemon-commander.js';
import type { Status } from './types.js';

// Auto-mock complete modules — implementations set via vi.mocked() in beforeEach.
vi.mock('node:fs/promises');
vi.mock('node:os');
vi.mock('./crc-cli.js');
vi.mock('./daemon-commander.js');
vi.mock('./util.js');

beforeEach(() => {
  vi.resetAllMocks();

  // node:fs/promises defaults
  vi.mocked(fs.mkdtemp).mockResolvedValue('/tmp/crc-ps-test');
  vi.mocked(fs.writeFile).mockResolvedValue();
  vi.mocked(fs.rm).mockResolvedValue();

  // node:os defaults
  vi.mocked(os.tmpdir).mockReturnValue('/tmp');

  // ./crc-cli.js defaults
  vi.mocked(crcCli.getCrcCli).mockReturnValue('/usr/local/bin/crc');
});

const mockLogger: extensionApi.Logger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as extensionApi.Logger;

// ---------------------------------------------------------------------------
// SecretStorage mock
// ---------------------------------------------------------------------------

function createMockSecrets(store: Record<string, string> = {}): extensionApi.SecretStorage {
  return {
    get: vi.fn(async (key: string) => store[key]),
    store: vi.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
    delete: vi.fn(async (key: string) => {
      delete store[key];
    }),
    onDidChange: vi.fn(),
  } as unknown as extensionApi.SecretStorage;
}

describe('start', () => {
  test('throws missing pull secret error when storage is empty', async () => {
    const secrets = createMockSecrets();
    await expect(start(secrets, mockLogger)).rejects.toThrow('Failed to ask for pull secret');
  });

  test('reads from storage, writes temp file, calls crc start, and returns Running', async () => {
    const pullSecret = '{"auths":{"registry.redhat.io":{"auth":"dXNlcjpwYXNz"}}}';
    const secrets = createMockSecrets({ 'pull-secret': pullSecret });

    vi.mocked(crcCli.execPromise).mockResolvedValue('');
    vi.mocked(daemon.commander.status).mockResolvedValue({
      CrcStatus: 'Running',
    } as Status);

    const result = await start(secrets, mockLogger);

    expect(result.Status).toBe('Running');
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('pull-secret.json'), pullSecret, { mode: 0o600 });
    expect(crcCli.execPromise).toHaveBeenCalledWith(
      '/usr/local/bin/crc',
      ['start', '--pull-secret-file', expect.stringContaining('pull-secret.json')],
      expect.objectContaining({ logger: mockLogger }),
    );
  });

  test('cleans up temp file even when crc start fails', async () => {
    const secrets = createMockSecrets({ 'pull-secret': '{"auths":{}}' });

    vi.mocked(crcCli.execPromise).mockRejectedValue(new Error('start failed'));
    vi.mocked(daemon.commander.status).mockRejectedValue(new Error('daemon unreachable'));

    await expect(start(secrets, mockLogger)).rejects.toThrow('start failed');
    expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('crc-ps-'), { recursive: true, force: true });
  });

  test('returns Running if daemon reports Running despite CLI error', async () => {
    const secrets = createMockSecrets({ 'pull-secret': '{"auths":{}}' });

    vi.mocked(crcCli.execPromise).mockRejectedValue(new Error('exit code 1'));
    vi.mocked(daemon.commander.status).mockResolvedValue({
      CrcStatus: 'Running',
    } as Status);

    const result = await start(secrets, mockLogger);

    expect(result.Status).toBe('Running');
  });

  test('returns non-Running status from daemon on success', async () => {
    const secrets = createMockSecrets({ 'pull-secret': '{"auths":{}}' });

    vi.mocked(crcCli.execPromise).mockResolvedValue('');
    vi.mocked(daemon.commander.status).mockResolvedValue({
      CrcStatus: 'Starting',
    } as Status);

    const result = await start(secrets, mockLogger);

    expect(result.Status).toBe('Starting');
  });
});
