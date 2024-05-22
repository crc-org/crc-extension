/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
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

import { expect, test, vi } from 'vitest';
import * as crcCli from './crc-cli';
import { needSetup } from './crc-setup';

test('needSetup should return true if setup --check-only command fails', async () => {
  vi.spyOn(crcCli, 'execPromise').mockRejectedValue('daemon not running');
  const isNeeded = await needSetup();
  expect(isNeeded).toBeTruthy();
});

test('needSetup should return false if setup --check-only command succeed', async () => {
  vi.spyOn(crcCli, 'execPromise').mockResolvedValue('');
  const isNeeded = await needSetup();
  expect(isNeeded).toBeFalsy();
});
