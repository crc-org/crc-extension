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

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkFileSha } from './base-install.js';

describe('checkFileSha', () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns true when the SHA-256 matches', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'check-file-sha-'));

    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'hello world');

    // SHA-256 of "hello world"
    const sha256 = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

    await expect(checkFileSha(filePath, sha256)).resolves.toBe(true);
  });

  it('returns false when the SHA-256 does not match', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'check-file-sha-'));

    const filePath = join(tempDir, 'test.txt');
    await writeFile(filePath, 'hello world');

    const wrongSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

    await expect(checkFileSha(filePath, wrongSha256)).resolves.toBe(false);
  });

  it('works with an empty file', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'check-file-sha-'));

    const filePath = join(tempDir, 'empty.txt');
    await writeFile(filePath, '');

    // SHA-256 of an empty string
    const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    await expect(checkFileSha(filePath, sha256)).resolves.toBe(true);
  });

  it('rejects when the file does not exist', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'check-file-sha-'));

    const filePath = join(tempDir, 'does-not-exist.txt');

    await expect(checkFileSha(filePath, 'anything')).rejects.toThrow();
  });
});
