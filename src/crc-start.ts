/**********************************************************************
 * Copyright (C) 2023 Red Hat, Inc.
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
import { isNeedSetup, needSetup, setUpCrc } from './crc-setup';
import { crcStatus } from './crc-status';
import { commander } from './daemon-commander';
import { crcLogProvider } from './log-provider';

interface ImagePullSecret {
  auths: Auths;
}

interface Auths {
  [key: string]: { auth: string; credsStore: string };
  [Symbol.iterator]();
}

const missingPullSecret = 'Failed to ask for pull secret';

export async function startCrc(
  logger: extensionApi.Logger,
  telemetryLogger: extensionApi.TelemetryLogger,
): Promise<void> {
  telemetryLogger.logUsage('crc.start');
  try {
    // call crc setup to prepare bundle, before start
    if (isNeedSetup) {
      try {
        crcStatus.setSetupRunning(true);
        await setUpCrc(logger);
        await needSetup();
      } catch (error) {
        logger.error(error);
        return;
      } finally {
        crcStatus.setSetupRunning(false);
      }
    }
    crcLogProvider.startSendingLogs(logger);
    const result = await commander.start();
    console.error('StartResult:' + JSON.stringify(result));
  } catch (err) {
    if (typeof err.message === 'string') {
      // check that crc missing pull secret
      if (err.message.startsWith(missingPullSecret)) {
        // ask user to provide pull secret
        if (await askAndStorePullSecret(logger)) {
          // if pull secret provided try to start again
          return startCrc(logger, telemetryLogger);
        }
        return;
      } else if (err.name === 'RequestError' && err.code === 'ECONNRESET') {
        // look like crc start normally, but we receive empty response from socket, so 'got' generate an error
        return;
      }
    }

    console.error(err);
  }
}

async function askAndStorePullSecret(logger: extensionApi.Logger): Promise<boolean> {
  const pullSecret = await extensionApi.window.showInputBox({
    prompt: 'Provide a pull secret',
    // prompt: 'To pull container images from the registry, a pull secret is necessary.',
    ignoreFocusOut: true,
  });

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
    extensionApi.window.showErrorMessage(`Start failed, pull secret is not valid. Please start again:\n '${err}'`);
    return false;
  }
  try {
    await commander.pullSecretStore(pullSecret);
    return true;
  } catch (error) {
    console.error(error);
    logger.error(error);
  }
  return false;
}
