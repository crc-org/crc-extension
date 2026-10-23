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

// macOS workaround: the CRC daemon runs as a launchd agent and cannot access
// the user's login keychain on macOS 26+.
//
// The pull secret is stored directly in the login keychain via the `security`
// CLI. Writing uses `security -i` (stdin) to avoid exposing the pull secret
// in process arguments visible to `ps`. Reading uses `-w` whose output is
// captured by Node.js and never shown in the process list.
//
// On every `crc start` the pull secret is read from the keychain, written to
// a temp file (mode 0600), passed via `crc start --pull-secret-file`, and
// the temp file is deleted in a finally block.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

import type * as extensionApi from '@podman-desktop/api';

import { execPromise, getCrcCli } from './crc-cli.js';
import { commander } from './daemon-commander.js';
import type { StartInfo } from './types.js';
import { productName } from './util.js';

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = 'com.redhat.crc-extension.pull-secret';
const KEYCHAIN_ACCOUNT = 'crc-extension';
const MISSING_PULL_SECRET = 'Failed to ask for pull secret';

// ---------------------------------------------------------------------------
// Keychain helpers
// ---------------------------------------------------------------------------

async function keychainStore(pullSecret: string): Promise<void> {
  const escaped = pullSecret.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  await new Promise<void>((resolve, reject) => {
    const child = execFile('/usr/bin/security', ['-i'], error => {
      if (error) reject(error);
      else resolve();
    });
    child.stdin?.write(`add-generic-password -a ${KEYCHAIN_ACCOUNT} -s ${KEYCHAIN_SERVICE} -U -w "${escaped}"\n`);
    child.stdin?.end();
  });
}

async function keychainLoad(): Promise<string> {
  const { stdout } = await execFileAsync('/usr/bin/security', [
    'find-generic-password',
    '-a',
    KEYCHAIN_ACCOUNT,
    '-s',
    KEYCHAIN_SERVICE,
    '-w',
  ]);
  return stdout.trim();
}

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

async function writeToTempFile(pullSecret: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crc-ps-'));
  const tmpFile = path.join(tmpDir, 'pull-secret.json');
  await fs.writeFile(tmpFile, pullSecret, { mode: 0o600 });
  return tmpFile;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
    await fs.rmdir(path.dirname(filePath));
  } catch {
    // best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start CRC using the pull secret stored in the macOS keychain.
 * Reads the secret, writes it to a temp file, invokes
 * `crc start --pull-secret-file`, then deletes the temp file.
 * Throws with a `missingPullSecret`-prefixed message if no pull secret exists.
 */
export async function start(logger: extensionApi.Logger): Promise<StartInfo> {
  if (!(await hasPullSecret())) {
    throw new Error(`${MISSING_PULL_SECRET}: no pull secret found in keychain`);
  }

  let tempFile: string | undefined;
  try {
    const pullSecret = await keychainLoad();
    tempFile = await writeToTempFile(pullSecret);
    logger.log(`Starting ${productName} with pull secret from keychain...`);

    await execPromise(getCrcCli(), ['start', '--pull-secret-file', tempFile], {
      logger,
      env: undefined,
    });

    const status = await commander.status();
    return {
      Status: status.CrcStatus,
    } as StartInfo;
  } catch (error) {
    // crc start CLI failed — try to get status from daemon anyway
    try {
      const status = await commander.status();
      if (status.CrcStatus === 'Running') {
        return { Status: 'Running' } as StartInfo;
      }
    } catch {
      // daemon not reachable
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    if (tempFile) {
      await cleanupTempFile(tempFile);
    }
  }
}

/**
 * Store a pull secret in the macOS login keychain.
 */
export async function storePullSecret(pullSecret: string): Promise<void> {
  await keychainStore(pullSecret);
}

// Exit code returned by `security find-generic-password` when the item does not exist.
const KEYCHAIN_ITEM_NOT_FOUND_EXIT = 44;

function isItemNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: unknown }).code === KEYCHAIN_ITEM_NOT_FOUND_EXIT
  );
}

/**
 * Check whether a pull secret exists in the keychain.
 * Returns false only when the item is absent (exit code 44).
 * Re-throws any other error (e.g. keychain locked, permission denied).
 */
export async function hasPullSecret(): Promise<boolean> {
  try {
    await keychainLoad();
    return true;
  } catch (error) {
    if (isItemNotFoundError(error)) {
      return false;
    }
    throw error;
  }
}
