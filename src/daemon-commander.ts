/**********************************************************************
 * Copyright (C) 2022 Red Hat, Inc.
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

import type { Response } from 'got';
import got from 'got';
import { isWindows } from './util.js';
import type { ConfigKeys, Configuration, StartInfo, Status } from './types.js';

export class DaemonCommander {
  private apiPath: string;

  constructor() {
    this.apiPath = `http://unix:${process.env.HOME}/.crc/crc-http.sock:/api`;

    if (isWindows()) {
      this.apiPath = 'http://unix://?/pipe/crc-http:/api';
    }
  }

  async status(): Promise<Status> {
    const url = this.apiPath + '/status';

    try {
      const { body } = await this.get(url);
      return JSON.parse(body);
    } catch (error) {
      // ignore status error, as it may happen when no cluster created
      return {
        CrcStatus: 'No Cluster',
      };
    }
  }

  async logs() {
    const url = this.apiPath + '/logs';
    const { body } = await this.get(url);
    return JSON.parse(body);
  }

  async version() {
    const url = this.apiPath + '/version';

    const { body } = await this.get(url);
    return JSON.parse(body);
  }

  async start(): Promise<StartInfo> {
    const url = this.apiPath + '/start';
    const response = await this.get(url);

    if (response.statusCode !== 200) {
      throw new Error(response.body);
    }
    return JSON.parse(response.body);
  }

  async stop() {
    const url = this.apiPath + '/stop';

    const { body } = await this.get(url);
    return body;
  }

  async delete() {
    const url = this.apiPath + '/delete';

    const { body } = await this.get(url);
    return body;
  }

  async configGet(): Promise<Configuration> {
    const url = this.apiPath + '/config';

    const { body } = await this.get(url);
    return JSON.parse(body).Configs;
  }

  async configSet(values: Configuration | { [key: string]: string | number }): Promise<void> {
    const url = this.apiPath + '/config';

    const result = await got.post(url, {
      json: { properties: values },
      throwHttpErrors: false,
      // body: values,
    });
    if (result.statusCode !== 200) {
      throw new Error(result.body);
    }
  }

  async configUnset(values: ConfigKeys[]): Promise<void> {
    const url = this.apiPath + '/config';

    const result = await got.delete(url, {
      json: { properties: values },
      throwHttpErrors: false,
      // body: values,
    });
    if (result.statusCode !== 200) {
      throw new Error(result.body);
    }
  }

  async consoleUrl() {
    const url = this.apiPath + '/webconsoleurl';

    const { body } = await this.get(url);
    return JSON.parse(body);
  }

  async pullSecretStore(value: unknown): Promise<string> {
    const url = this.apiPath + '/pull-secret';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (got as any).post(url, {
      body: value,
      throwHttpErrors: false,
      retry: {
        limit: 0,
      },
    });
    return response.body;
  }

  async pullSecretAvailable() {
    const url = this.apiPath + '/pull-secret';

    const { body } = await this.get(url);
    return body;
  }

  private get(url: string): Promise<Response<string>> {
    return got.get(url, {
      enableUnixSockets: true,
      throwHttpErrors: false,
      retry: {
        limit: 0,
      },
    });
  }
}

export const commander = new DaemonCommander();

export async function isPullSecretMissing(): Promise<boolean> {
  let result = true;

  await commander
    .pullSecretAvailable()
    .then(() => {
      result = true;
    })
    .catch(() => {
      result = false;
    });

  return result;
}

export async function isDaemonRunning(): Promise<boolean> {
  try {
    const ver = await commander.version();
    if (ver) {
      return true;
    }
    return false;
  } catch (err) {
    return false;
  }
}
