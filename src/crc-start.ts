/**********************************************************************
 * Copyright (C) 2023-2026 Red Hat, Inc.
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

import * as fs from 'node:fs/promises';

import * as extensionApi from '@podman-desktop/api';
import { needSetup, setUpCrc } from './crc-setup.js';
import { crcStatus } from './crc-status.js';
import { commander } from './daemon-commander.js';
import { crcLogProvider } from './log-provider.js';
import { isMac, productName } from './util.js';
import { AccountManagementClient } from '@redhat-developer/rhaccm-client';
import * as macStart from './crc-start-macos.js';
import { getPullSecretFilePath, isPullSecretFileConfigSet } from './crc-cli.js';

interface ImagePullSecret {
  auths: Auths;
}

interface Auths {
  [key: string]: { auth: string; credsStore: string };
  [Symbol.iterator]();
}

export const missingPullSecret = 'Failed to ask for pull secret';
export const safeStorageErrorMessage =
  'The extension\'s secret storage is not available to store the pull secret. Please provide a pull secret manually using the "crc config set pull-secret" or "crc config set pull-secret-file" command.';
export const AuthenticationScopes = [
  'api.iam.registry_service_accounts', // scope that gives access to hydra service accounts API
  'api.console', // scope that gives access to console.redhat.com APIs
];

export async function startCrc(
  provider: extensionApi.Provider,
  logger: extensionApi.Logger,
  telemetryLogger: extensionApi.TelemetryLogger,
  secrets?: extensionApi.SecretStorage,
): Promise<void> {
  telemetryLogger.logUsage('crc.start', {
    preset: crcStatus.status.Preset,
  });
  try {
    // call crc setup to prepare bundle, before start
    const isNeedSetup = await needSetup();
    if (isNeedSetup) {
      try {
        crcStatus.setSetupRunning(true);
        await setUpCrc(logger);
      } catch (error) {
        logger.error(error);
        provider.updateStatus('stopped');
        throw error instanceof Error ? error : new Error(String(error));
      } finally {
        crcStatus.setSetupRunning(false);
      }
    }
    await crcLogProvider.startSendingLogs(logger);

    // On macOS, the CRC daemon (launchd agent) cannot access the login keychain.
    // Use the encrypted pull secret via CLI instead of the daemon API.
    let result;
    if (isMac() && !(await isPullSecretFileConfigSet())) {
      if (!secrets) {
        throw new Error(safeStorageErrorMessage);
      }
      result = await macStart.start(secrets, logger);
    } else {
      result = await commander.start();
    }

    if (result.Status === 'Running') {
      provider.updateStatus('started');
      return;
    } else {
      provider.updateStatus('error');
      const errorMsg = `Error during starting ${productName}: ${result.Status}`;
      await extensionApi.window.showErrorMessage(errorMsg);
      throw new Error(errorMsg);
    }
  } catch (err) {
    if (typeof err.message === 'string') {
      // check that crc missing pull secret
      if (err.message.startsWith(missingPullSecret)) {
        // If a pull-secret-file is configured but start still failed,
        // the file itself is the problem — surface the real issue.
        let pullSecretFilePath: string | undefined;
        try {
          pullSecretFilePath = await getPullSecretFilePath();
        } catch {
          // config query failed — fall through to prompt flow
        }
        if (pullSecretFilePath) {
          let fileExists = false;
          try {
            await fs.access(pullSecretFilePath);
            fileExists = true;
          } catch {
            // file missing or inaccessible
          }
          if (fileExists) {
            const invalidContentMessage =
              `The pull-secret-file '${pullSecretFilePath}' configured in OpenShift Local appears to contain invalid content. ` +
              'Verify the file or unset the configuration with "crc config unset pull-secret-file".';
            await extensionApi.window.showErrorMessage(invalidContentMessage);
            throw new Error(invalidContentMessage, { cause: err });
          } else {
            const fileDoesNotExistMessage =
              `The pull-secret-file '${pullSecretFilePath}' configured in OpenShift Local does not exist. ` +
              'Set correct file with "crc config set pull-secret-file" or unset the configuration with "crc config unset pull-secret-file".';
            await extensionApi.window.showErrorMessage(fileDoesNotExistMessage);
            throw new Error(fileDoesNotExistMessage, { cause: err });
          }
        }

        // No pull-secret-file configured — ask user to provide a pull secret
        if (await askAndStorePullSecret(logger, secrets)) {
          // if pull secret provided try to start again
          return startCrc(provider, logger, telemetryLogger, secrets);
        } else {
          const couldNotStartWithoutPullSecretMessage = 'Could not start without pullsecret!';
          await extensionApi.window.showErrorMessage(couldNotStartWithoutPullSecretMessage);
          throw new Error(couldNotStartWithoutPullSecretMessage, { cause: err });
        }
      } else if (err.name === 'RequestError' && err.code === 'ECONNRESET') {
        // look like crc start normally, but we receive empty response from socket, so 'got' generate an error
        provider.updateStatus('started');
        return;
      }
    }
    await extensionApi.window.showErrorMessage(`${productName} start error: ${err}`);
    console.error(err);
    provider.updateStatus('stopped');
    throw err instanceof Error ? err : new Error(String(err));
  }
}

async function askAndStorePullSecret(
  logger: extensionApi.Logger,
  secrets?: extensionApi.SecretStorage,
): Promise<boolean> {
  if (isMac() && !secrets) {
    await extensionApi.window.showErrorMessage(safeStorageErrorMessage);
    return false;
  }

  let pullSecret: string | undefined;
  const authSession: extensionApi.AuthenticationSession | undefined = await extensionApi.authentication.getSession(
    'redhat.authentication-provider',
    AuthenticationScopes, // adds claim to accessToken that used to render account label
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
    if (isMac()) {
      // On macOS, store via extension secret storage (daemon can't access keychain)
      // Secrets storage is defined here, because exception is thrown in the beginning of the function
      await secrets?.store(macStart.SECRET_KEY, pullSecret);
    } else {
      await commander.pullSecretStore(pullSecret);
    }
    return true;
  } catch (error) {
    console.error(error);
    logger.error(error);
  }
  return false;
}
