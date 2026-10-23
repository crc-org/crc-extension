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

import type * as extensionApi from '@podman-desktop/api';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import * as crcCli from './crc-cli.js';
import * as daemon from './daemon-commander.js';
import type { Status } from './types.js';

// Mock node:child_process — keychainStore / keychainLoad use execFile
const mockExecFile = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock('node:util', () => ({
  promisify: (fn: unknown) =>
    vi.fn().mockImplementation((...args: unknown[]) => {
      return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        (fn as (...a: unknown[]) => void)(...args, (error: Error | null, stdout: string, stderr: string) => {
          if (error) reject(error);
          else resolve({ stdout: stdout ?? '', stderr: stderr ?? '' });
        });
      });
    }),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn().mockResolvedValue('/tmp/crc-ps-test'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:os', () => ({
  tmpdir: () => '/tmp',
}));

vi.mock('node:path', async importOriginal => {
  return importOriginal();
});

vi.mock('./crc-cli.js', () => ({
  execPromise: vi.fn(),
  getCrcCli: vi.fn().mockReturnValue('/usr/local/bin/crc'),
}));

vi.mock('./daemon-commander.js', () => ({
  commander: {
    status: vi.fn(),
  },
}));

vi.mock('./util.js', () => ({
  productName: 'OpenShift Local',
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function mockKeychainLoadSuccess(pullSecret: string): void {
  // execFileAsync calls execFile(path, args, callback)
  mockExecFile.mockImplementation(
    (cmd: string, args: string[], callback?: (err: Error | null, stdout: string, stderr: string) => void) => {
      if (typeof callback === 'function') {
        // This is the promisified execFile path (keychainLoad)
        callback(null, pullSecret + '\n', '');
      }
      // Return a mock child process for the non-promisified path (keychainStore)
      return {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: null,
        stderr: null,
      };
    },
  );
}

function mockKeychainLoadFailure(exitCode = 44): void {
  mockExecFile.mockImplementation(
    (cmd: string, args: string[], callback?: (err: Error | null, stdout: string, stderr: string) => void) => {
      if (typeof callback === 'function') {
        const err: Error & { code?: number } = new Error('The specified item could not be found in the keychain.');
        err.code = exitCode;
        callback(err, '', '');
        return;
      }
      return {
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: null,
        stderr: null,
      };
    },
  );
}

const mockLogger: extensionApi.Logger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as extensionApi.Logger;

describe('hasPullSecret', () => {
  test('returns true when keychain has the pull secret', async () => {
    mockKeychainLoadSuccess('{"auths":{}}');
    const { hasPullSecret } = await import('./crc-start-macos.js');
    expect(await hasPullSecret()).toBe(true);
  });

  test('returns false when keychain item does not exist (exit 44)', async () => {
    mockKeychainLoadFailure(44);
    const { hasPullSecret } = await import('./crc-start-macos.js');
    expect(await hasPullSecret()).toBe(false);
  });

  test('re-throws when keychain fails for a reason other than missing item', async () => {
    mockKeychainLoadFailure(1);
    const { hasPullSecret } = await import('./crc-start-macos.js');
    await expect(hasPullSecret()).rejects.toThrow();
  });
});

describe('storePullSecret', () => {
  test('calls security -i with the pull secret via stdin', async () => {
    const stdinWrite = vi.fn();
    const stdinEnd = vi.fn();

    mockExecFile.mockImplementation((cmd: string, args: string[], callback?: (err: Error | null) => void) => {
      if (Array.isArray(args) && args[0] === '-i') {
        // security -i for keychainStore
        if (typeof callback === 'function') {
          // simulate success after stdin is piped
          setTimeout(() => callback(null), 0);
        }
        return {
          stdin: { write: stdinWrite, end: stdinEnd },
        };
      }
      return { stdin: { write: vi.fn(), end: vi.fn() } };
    });

    const { storePullSecret } = await import('./crc-start-macos.js');
    await storePullSecret('{"auths":{"reg.io":{"auth":"abc"}}}');

    expect(stdinWrite).toHaveBeenCalledOnce();
    const writtenCommand = stdinWrite.mock.calls[0][0] as string;
    expect(writtenCommand).toContain('add-generic-password');
    expect(writtenCommand).toContain('com.redhat.crc-extension.pull-secret');
    expect(writtenCommand).toContain('-U');
    expect(stdinEnd).toHaveBeenCalledOnce();
  });

  test('escapes backslashes and quotes in pull secret', async () => {
    const stdinWrite = vi.fn();

    mockExecFile.mockImplementation((cmd: string, args: string[], callback?: (err: Error | null) => void) => {
      if (typeof callback === 'function') {
        setTimeout(() => callback(null), 0);
      }
      return { stdin: { write: stdinWrite, end: vi.fn() } };
    });

    const { storePullSecret } = await import('./crc-start-macos.js');
    await storePullSecret('val\\"ue');

    const writtenCommand = stdinWrite.mock.calls[0][0] as string;
    expect(writtenCommand).toContain('val\\\\\\"ue');
  });
});

describe('start', () => {
  test('throws missing pull secret error when keychain is empty', async () => {
    mockKeychainLoadFailure();
    const { start } = await import('./crc-start-macos.js');

    await expect(start(mockLogger)).rejects.toThrow('Failed to ask for pull secret');
  });

  test('reads from keychain, writes temp file, calls crc start, and returns Running', async () => {
    const pullSecret = '{"auths":{"registry.redhat.io":{"auth":"dXNlcjpwYXNz"}}}';
    mockKeychainLoadSuccess(pullSecret);

    const fs = await import('node:fs/promises');
    vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
    vi.spyOn(daemon.commander, 'status').mockResolvedValue({
      CrcStatus: 'Running',
    } as Status);

    const { start } = await import('./crc-start-macos.js');
    const result = await start(mockLogger);

    expect(result.Status).toBe('Running');
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('pull-secret.json'), pullSecret, { mode: 0o600 });
    expect(crcCli.execPromise).toHaveBeenCalledWith(
      '/usr/local/bin/crc',
      ['start', '--pull-secret-file', expect.stringContaining('pull-secret.json')],
      expect.objectContaining({ logger: mockLogger }),
    );
  });

  test('cleans up temp file even when crc start fails', async () => {
    mockKeychainLoadSuccess('{"auths":{}}');

    const fs = await import('node:fs/promises');
    vi.spyOn(crcCli, 'execPromise').mockRejectedValue(new Error('start failed'));
    vi.spyOn(daemon.commander, 'status').mockRejectedValue(new Error('daemon unreachable'));

    const { start } = await import('./crc-start-macos.js');

    await expect(start(mockLogger)).rejects.toThrow('start failed');
    expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('pull-secret.json'));
    expect(fs.rmdir).toHaveBeenCalledWith(expect.stringContaining('crc-ps-'));
  });

  test('returns Running if daemon reports Running despite CLI error', async () => {
    mockKeychainLoadSuccess('{"auths":{}}');

    vi.spyOn(crcCli, 'execPromise').mockRejectedValue(new Error('exit code 1'));
    vi.spyOn(daemon.commander, 'status').mockResolvedValue({
      CrcStatus: 'Running',
    } as Status);

    const { start } = await import('./crc-start-macos.js');
    const result = await start(mockLogger);

    expect(result.Status).toBe('Running');
  });

  test('returns non-Running status from daemon on success', async () => {
    mockKeychainLoadSuccess('{"auths":{}}');

    vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
    vi.spyOn(daemon.commander, 'status').mockResolvedValue({
      CrcStatus: 'Starting',
    } as Status);

    const { start } = await import('./crc-start-macos.js');
    const result = await start(mockLogger);

    expect(result.Status).toBe('Starting');
  });
});
