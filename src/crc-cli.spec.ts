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

import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import type * as ChildProcessModule from 'node:child_process';

import type { Logger } from '@podman-desktop/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { execPromise } from './crc-cli.js';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof ChildProcessModule>();
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

vi.mock('./util.js');

describe('execPromise', () => {
  const DUMMY_CMD = 'dummy-cmd';
  let mockLogger: Logger;

  interface MockSpawnOptions {
    stdout?: string[];
    stderr?: string[];
    exitCode?: number;
  }

  function mockSpawn({ stdout = [], stderr = [], exitCode = 0 }: MockSpawnOptions = {}): void {
    const handlers = new Map<string, (...args: unknown[]) => void>();

    const mockProcess = {
      stdout: {
        setEncoding: vi.fn(),
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers.set(`stdout:${event}`, cb);
        }),
      },
      stderr: {
        setEncoding: vi.fn(),
        on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
          handlers.set(`stderr:${event}`, cb);
        }),
      },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers.set(`process:${event}`, cb);
        // 'close' is the last listener registered in execPromise; schedule events
        if (event === 'close') {
          setTimeout(() => {
            for (const chunk of stdout) handlers.get('stdout:data')?.(chunk);
            for (const chunk of stderr) handlers.get('stderr:data')?.(chunk);
            cb(exitCode);
          }, 0);
        }
      }),
    };

    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger;
  });

  it('logs stdout data via logger.log', async () => {
    mockSpawn({ stdout: ['hello world'] });
    await execPromise(DUMMY_CMD, [], { logger: mockLogger, env: undefined });
    expect(mockLogger.log).toHaveBeenCalledWith('hello world');
  });

  it('logs stderr data via logger.log', async () => {
    mockSpawn({ stderr: ['level=info msg="Starting OpenShift Local"'] });
    await execPromise(DUMMY_CMD, [], { logger: mockLogger, env: undefined });
    expect(mockLogger.log).toHaveBeenCalledWith('level=info msg="Starting OpenShift Local"');
  });

  it('logs all stdout and stderr chunks via logger.log', async () => {
    mockSpawn({
      stdout: ['stdout line 1', 'stdout line 2'],
      stderr: ['stderr line 1', 'stderr line 2'],
    });
    await execPromise(DUMMY_CMD, [], { logger: mockLogger, env: undefined });

    expect(mockLogger.log).toHaveBeenCalledTimes(4);
    expect(mockLogger.log).toHaveBeenCalledWith('stdout line 1');
    expect(mockLogger.log).toHaveBeenCalledWith('stdout line 2');
    expect(mockLogger.log).toHaveBeenCalledWith('stderr line 1');
    expect(mockLogger.log).toHaveBeenCalledWith('stderr line 2');
  });

  it('resolves with trimmed stdout on exit code 0', async () => {
    mockSpawn({ stdout: ['  result  '] });
    await expect(execPromise(DUMMY_CMD, [], { env: undefined })).resolves.toBe('result');
  });

  it('rejects with stderr content on non-zero exit code', async () => {
    mockSpawn({ stderr: ['connection refused'], exitCode: 1 });
    await expect(execPromise(DUMMY_CMD, [], { logger: mockLogger, env: undefined })).rejects.toContain(
      'connection refused',
    );
  });

  it('includes both stdout and stderr in rejection on non-zero exit code', async () => {
    mockSpawn({ stdout: ['partial output'], stderr: ['fatal error'], exitCode: 1 });
    try {
      await execPromise(DUMMY_CMD, [], { env: undefined });
      expect.unreachable('should have rejected');
    } catch (content) {
      expect(content).toContain('partial output');
      expect(content).toContain('fatal error');
    }
  });

  it('still logs stderr via logger.log before rejecting on non-zero exit code', async () => {
    mockSpawn({ stderr: ['something went wrong'], exitCode: 1 });
    try {
      await execPromise(DUMMY_CMD, [], { logger: mockLogger, env: undefined });
    } catch {
      // rejection expected
    }
    expect(mockLogger.log).toHaveBeenCalledWith('something went wrong');
  });

  it('does not throw when logger is undefined', async () => {
    mockSpawn({ stdout: ['output'], stderr: ['warning'] });
    await expect(execPromise(DUMMY_CMD, [], { env: undefined })).resolves.toBeDefined();
  });
});
