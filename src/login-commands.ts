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

import { commandManager } from './command.js';
import { commander } from './daemon-commander.js';
import { isWindows } from './util.js';

let occommand = 'oc';
if (isWindows()) {
  occommand = 'oc.exe';
}

export function registerLogInCommands(): void {
  commandManager.addTrayCommand({
    id: 'crc.copy.login.admin',
    label: 'Copy OC login command (admin)',
    isEnabled: status => status.CrcStatus === 'Running',
    isVisible: status => status.Preset === 'openshift',
    callback: copyAdmin,
  });

  commandManager.addTrayCommand({
    id: 'crc.copy.login.developer',
    label: 'Copy OC login command (developer)',
    isEnabled: status => status.CrcStatus === 'Running',
    isVisible: status => status.Preset === 'openshift',
    callback: copyDeveloper,
  });
}

async function copyAdmin(): Promise<void> {
  const result = await commander.consoleUrl();
  const command =
    `${occommand} login -u kubeadmin -p ` + result.ClusterConfig.KubeAdminPass + ' ' + result.ClusterConfig.ClusterAPI;
  await extensionApi.env.clipboard.writeText(command);
}

async function copyDeveloper(): Promise<void> {
  const result = await commander.consoleUrl();
  const command = `${occommand} login -u developer -p developer ` + result.ClusterConfig.ClusterAPI;
  await extensionApi.env.clipboard.writeText(command);
}
