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

import { afterEach, expect, test, vi } from 'vitest';
import { AccountManagementV1, BASE_URL } from './rhaccm-client.js';

const pullSecretCfg = {
  auths: {
    'registry.redhat.io': { auth: 'dXNlcjpwYXNz' },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

test('getPullSecret returns parsed AccessTokenCfg', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(pullSecretCfg), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const client = new AccountManagementV1('sso-access-token');

  await expect(client.getPullSecret()).resolves.toEqual(pullSecretCfg);

  expect(fetchMock).toHaveBeenCalledOnce();
  const request = fetchMock.mock.calls[0][0] as Request;
  expect(request.method).toBe('POST');
  expect(request.url).toBe(`${BASE_URL}/api/accounts_mgmt/v1/access_token`);
  expect(request.headers.get('Authorization')).toBe('Bearer sso-access-token');
});

test('getPullSecret throws API error reason', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ reason: 'Auth token is invalid' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const client = new AccountManagementV1('bad-token');

  await expect(client.getPullSecret()).rejects.toThrow('Auth token is invalid');
});

test('getPullSecret throws fallback message when error has no reason', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({}), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const client = new AccountManagementV1('bad-token');

  await expect(client.getPullSecret()).rejects.toThrow('Failed to obtain pull secret');
});

test('getPullSecret throws when response has no body', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const client = new AccountManagementV1('sso-access-token');

  await expect(client.getPullSecret()).rejects.toThrow('Failed to obtain pull secret');
});
