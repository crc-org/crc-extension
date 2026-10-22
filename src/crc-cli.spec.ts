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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { execPromise } from './crc-cli.js'; // TODO: Update with your actual file name
import type { Logger } from '@podman-desktop/api';

// Mock the child_process module
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('execPromise - stderr streaming coverage', () => {
  const DUMMY_CMD = 'dummy-cmd';

  const ERROR_LINE = 'level=error msg="Something went wrong"\n';
  const ERROR_PART_1 = 'level=error msg="Something went';
  const ERROR_PART_2 = ' wrong"\n';

  const INFO_LINE = 'level=info msg="Something went right"\n';
  const INFO_LINE_NO_NL = 'level=info msg="Something went right"';

  const FATAL_LINE = 'level=fatal msg="Something fatal"\n';
  const FATAL_LINE_NO_NL = 'level=fatal msg="critical error"';

  const WHITESPACE_INPUT = '   \n  ';
  const WHITESPACE_EXPECTED = '   \n';

  let stderrDataCallback: (data: string) => void;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLogger = {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };

    const mockProcess = {
      stdout: {
        setEncoding: vi.fn(),
        on: vi.fn(),
      },
      stderr: {
        setEncoding: vi.fn(),
        on: vi.fn((event, cb) => {
          if (event === 'data') {
            // Capture the callback so we can trigger it manually in tests
            stderrDataCallback = cb;
          }
        }),
      },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          // Auto-resolve the promise so tests don't hang
          setTimeout(() => cb(0), 0);
        }
      }),
    };

    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
  });

  it('should log via logger.log when data is purely whitespace (fails data.trim() check)', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });

    stderrDataCallback(WHITESPACE_INPUT);
    await promise;

    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(WHITESPACE_EXPECTED);
  });

  it('should log via logger.log only when line closed by a newline character', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });

    stderrDataCallback(ERROR_PART_1);
    expect(mockLogger.error).not.toHaveBeenCalled();

    stderrDataCallback(ERROR_PART_2);
    expect(mockLogger.error).toHaveBeenCalledWith(ERROR_LINE);

    await promise;
  });

  it('should route all but last line without newline character arrived in the same buffer and route last line separately on close', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });

    const buffer = [ERROR_LINE, INFO_LINE, FATAL_LINE, INFO_LINE_NO_NL];
    stderrDataCallback(buffer.join(''));

    expect(mockLogger.error).toHaveBeenCalledWith(ERROR_LINE);
    expect(mockLogger.log).toHaveBeenCalledWith(INFO_LINE);
    expect(mockLogger.error).toHaveBeenCalledWith(FATAL_LINE);
    expect(mockLogger.log).not.toHaveBeenCalledWith(INFO_LINE_NO_NL); // Not logged yet due to missing newline

    await promise; // Triggers close
    expect(mockLogger.log).toHaveBeenCalledWith(INFO_LINE_NO_NL); // Logged on close
  });

  it('should log via logger.error when error line left in the buffer after the process closes', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });

    stderrDataCallback(ERROR_LINE);
    expect(mockLogger.error).toHaveBeenCalledWith(ERROR_LINE);

    stderrDataCallback(FATAL_LINE_NO_NL);
    expect(mockLogger.error).not.toHaveBeenCalledWith(FATAL_LINE_NO_NL);

    await promise; // Triggers close
    expect(mockLogger.error).toHaveBeenCalledWith(FATAL_LINE_NO_NL);
  });

  it('should log via logger.error when data does not start with "level="', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });
    const plainError = 'Failed to connect to the socket\n';

    stderrDataCallback(plainError);
    await promise;

    expect(mockLogger.error).toHaveBeenCalledWith(plainError);
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it('should log via logger.error when data starts with "level=error"', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });

    stderrDataCallback(ERROR_LINE);
    await promise;

    expect(mockLogger.error).toHaveBeenCalledWith(ERROR_LINE);
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it('should log via logger.error when data starts with "level=fatal"', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });
    const fatalCrashLine = 'level=fatal msg="Crashing now"\n';

    stderrDataCallback(fatalCrashLine);
    await promise;

    expect(mockLogger.error).toHaveBeenCalledWith(fatalCrashLine);
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it('should log via logger.log when data starts with "level=" but is not error or fatal (e.g. level=info)', async () => {
    const promise = execPromise(DUMMY_CMD, [], { logger: mockLogger, env: {} });
    const infoStartLine = 'level=info msg="Starting OpenShift Local"\n';
    const debugCheckLine = 'level=debug msg="Checking requirements"\n';

    stderrDataCallback(infoStartLine);
    stderrDataCallback(debugCheckLine);
    await promise;

    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(infoStartLine);
    expect(mockLogger.log).toHaveBeenCalledWith(debugCheckLine);
  });

  it('should not throw if logger is undefined', async () => {
    // Calling execPromise without a logger in options
    const promise = execPromise(DUMMY_CMD, [], { env: {} });

    // Triggering both branches to ensure options?.logger safe-navigation works
    expect(() => {
      stderrDataCallback('level=error msg="This should not throw"\n');
      stderrDataCallback('level=info msg="This should not throw"\n');
    }).not.toThrow();

    await promise;
  });
});
