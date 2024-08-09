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

import { commandManager } from './command';
import { commander } from './daemon-commander';

export function registerOpenConsoleCommand(): void {
  commandManager.addTrayCommand({
    id: 'crc.open.console',
    label: 'Open Console',
    isEnabled: status => status.CrcStatus === 'Running' && status.Preset === 'openshift',
    isVisible: status => status.Preset === 'openshift',
    callback: openConsole,
  });
}

async function openConsole(): Promise<void> {
  const result = await commander.consoleUrl();
  const url = result.ClusterConfig.WebConsoleURL;
  if (url) {
    await extensionApi.env.openExternal(extensionApi.Uri.parse(url));
  }
}
