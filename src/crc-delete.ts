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
import { crcStatus } from './crc-status';
import { commander } from './daemon-commander';
import { productName, providerId } from './util';

export function registerDeleteCommand(extensionContext: extensionApi.ExtensionContext): void {
  extensionContext.subscriptions.push(
    extensionApi.tray.registerProviderMenuItem(providerId, {
      id: 'crc.delete',
      visible: true,
      enabled: true,
      label: 'Delete',
    }),
  );

  extensionContext.subscriptions.push(
    extensionApi.commands.registerCommand('crc.delete', async () => {
      if (crcStatus.status.CrcStatus === 'No Cluster') {
        await extensionApi.window.showNotification({
          silent: false,
          title: productName,
          body: 'Machine does not exist. Use "start" to create it',
        });
        return;
      }
      const confirmation = await extensionApi.window.showInformationMessage(
        'Do you want to delete the instance?',
        'Yes',
        'No',
      );
      if (confirmation === 'Yes') {
        try {
          await commander.delete();
          await extensionApi.window.showNotification({
            silent: false,
            title: productName,
            body: 'Deleted the instance.',
          });
        } catch (err) {
          console.error(err);
        }
      }
    }),
  );
}
