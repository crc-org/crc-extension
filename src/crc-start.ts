/**********************************************************************
 * Copyright (C) 2023-2024 Red Hat, Inc.
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

import * as extensionApi from '@podman-desktop/api';
import { needSetup, setUpCrc } from './crc-setup.js';
import { crcStatus } from './crc-status.js';
import { commander } from './daemon-commander.js';
import { crcLogProvider } from './log-provider.js';
import { productName } from './util.js';
import { AccountManagementClient } from '@redhat-developer/rhaccm-client';

interface ImagePullSecret {
  auths: Auths;
}

interface Auths {
  [key: string]: { auth: string; credsStore: string };
  [Symbol.iterator]();
}

const missingPullSecret = 'Failed to ask for pull secret';

export async function startCrc(
  provider: extensionApi.Provider,
  loggerCallback: (data: string) => void,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<boolean> {
  telemetryLogger.logUsage('crc.start', {
    preset: crcStatus.status.Preset,
  });
  try {
    // call crc setup to prepare bundle, before start
    const isNeedSetup = await needSetup();
    if (isNeedSetup) {
      try {
        crcStatus.setSetupRunning(true);
        await setUpCrc();
      } catch (error) {
        provider.updateStatus('stopped');
        throw error;
      } finally {
        crcStatus.setSetupRunning(false);
      }
    }
    crcLogProvider.startSendingLogs(loggerCallback);
    const result = await commander.start();
    if (result.Status === 'Running') {
      provider.updateStatus('started');
      return true;
    } else {
      provider.updateStatus('error');
      await extensionApi.window.showErrorMessage(`Error during starting ${productName}: ${result.Status}`);
    }
  } catch (err) {
    if (typeof err.message === 'string') {
      // check that crc missing pull secret
      if (err.message.startsWith(missingPullSecret)) {
        // ask user to provide pull secret
        if (await askAndStorePullSecret()) {
          // if pull secret provided try to start again
          return startCrc(provider, loggerCallback, telemetryLogger);
        } else {
          throw new Error(`${productName} start error: VM cannot be started without the pullsecret`);
        }
      } else if (err.name === 'RequestError' && err.code === 'ECONNRESET') {
        // look like crc start normally, but we receive empty response from socket, so 'got' generate an error
        provider.updateStatus('started');
        return true;
      }
    }
    console.error(err);
    provider.updateStatus('stopped');
    throw new Error(`${productName} start error: ${err}`);
  }
  return false;
}

async function askAndStorePullSecret(): Promise<boolean> {
  let pullSecret: string;
  const authSession: extensionApi.AuthenticationSession | undefined = await extensionApi.authentication.getSession(
    'redhat.authentication-provider',
    [
      'api.iam.registry_service_accounts', //scope that gives access to hydra service accounts API
      'api.console', // scope that gives access to console.redhat.com APIs
      'id.username',
    ], // adds claim to accessToken that used to render account label
    { createIfNone: true }, // will request to login in browser if session does not exists
  );
  if (authSession) {
    const client = new AccountManagementClient({
      BASE: 'https://api.openshift.com',
      TOKEN: authSession.accessToken,
    });
    const accessTokenCfg = await client.default.postApiAccountsMgmtV1AccessToken();
    pullSecret = JSON.stringify(accessTokenCfg);
  }
  if (!pullSecret) {
    // ask for text in field
    pullSecret = await extensionApi.window.showInputBox({
      prompt: 'Provide a pull secret',
      markdownDescription:
        'To pull container images from the registry, a *pull secret* is necessary. You can get a pull secret from the [Red Hat OpenShift Local download page](https://console.redhat.com/openshift/create/local?sc_cid=7013a000003SUmqAAG). Use the *"Copy pull secret"* option and paste the content into the field above',
      ignoreFocusOut: true,
    });
  }

  if (!pullSecret) {
    return false;
  }
  try {
    const s: ImagePullSecret = JSON.parse(pullSecret);
    if (s.auths && Object.keys(s.auths).length > 0) {
      for (const a in s.auths) {
        const aut = s.auths[a];
        if (!aut.auth && !aut.credsStore) {
          throw `${JSON.stringify(s)} JSON-object requires either 'auth' or 'credsStore' field`;
        }
      }
    } else {
      throw 'missing "auths" JSON-object field';
    }
  } catch (err) {
    // not valid json
    await extensionApi.window.showErrorMessage(
      `Start failed, pull secret is not valid. Please start again:\n '${err}'`,
    );
    return false;
  }
  try {
    await commander.pullSecretStore(pullSecret);
    return true;
  } catch (error) {
    console.error(error);
  }
  return false;
}
