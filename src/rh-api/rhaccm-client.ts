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
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import type { Client } from 'openapi-fetch';
import createClient from 'openapi-fetch';
import type { paths } from '/@rhaccm';

export const REGISTRY_REDHAT_IO = 'registry.redhat.io';
export const BASE_URL = 'https://api.openshift.com';
export const API_ACCOUNTS_MGMT_V1 = '/api/accounts_mgmt/v1';


export class AccountManagementV1 {
  private client: Client<paths>;
  constructor(readonly token: string) {
    this.client = createClient<paths>({ baseUrl: BASE_URL });
    this.client.use({
      onRequest({ request }) {
        request.headers.set('Authorization', `Bearer ${token}`);
        return request;
      },
    });
  }
  async getPullSecret() {
    const { data, error } = await this.client.POST(`${API_ACCOUNTS_MGMT_V1}/access_token`);
    if (error) {
      throw new Error(error.reason ?? 'Failed to obtain pull secret');
    }
    if (!data) {
      throw new Error('Failed to obtain pull secret');
    }
    return data;
  }
}
