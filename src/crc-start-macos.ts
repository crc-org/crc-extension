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
// The pull secret is persisted via the extension SecretStorage API.
//
// On every `crc start` the pull secret is read from storage, written to
// a temp file (mode 0600), passed via `crc start --pull-secret-file`, and
// the temp file is deleted in a finally block.

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type * as extensionApi from '@podman-desktop/api';

import { execPromise, getCrcCli } from './crc-cli.js';
import { commander } from './daemon-commander.js';
import type { StartInfo } from './types.js';
import { productName } from './util.js';

export const SECRET_KEY = 'pull-secret';
const MISSING_PULL_SECRET = 'Failed to ask for pull secret';

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

async function writeToTempFile(pullSecret: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crc-ps-'));
  const tmpFile = path.join(tmpDir, 'pull-secret.json');
  try {
    await fs.writeFile(tmpFile, pullSecret, { mode: 0o600 });
  } catch (error) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
  return tmpFile;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await fs.rm(path.dirname(filePath), { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start CRC using the pull secret from extension secret storage.
 * Reads the secret, writes it to a temp file, invokes
 * `crc start --pull-secret-file`, then deletes the temp file.
 * Throws with a `missingPullSecret`-prefixed message if no pull secret exists.
 */
export async function start(secrets: extensionApi.SecretStorage, logger: extensionApi.Logger): Promise<StartInfo> {
  const pullSecret = await secrets.get(SECRET_KEY);
  if (!pullSecret) {
    throw new Error(`${MISSING_PULL_SECRET}: no pull secret found in secrets storage`);
  }

  let tempFile: string | undefined;
  try {
    tempFile = await writeToTempFile(pullSecret);
    logger.log(`Starting ${productName} with pull secret from secrets storage...`);

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
