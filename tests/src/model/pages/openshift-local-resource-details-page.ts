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

import type { Locator, Page } from '@playwright/test';

import { ResourceElementState, DetailsPage } from '@podman-desktop/tests-playwright';

export class OpenShiftLocalResourceDetailsPage extends DetailsPage {
  readonly startButton: Locator;
  readonly restartButton: Locator;
  readonly stopButton: Locator;
  readonly deleteButton: Locator;

  static readonly SUMMARY_TAB = 'Summary';
  static readonly LOGS_TAB = 'Logs';

  constructor(page: Page, title: string) {
    super(page, title);
    this.startButton = this.controlActions.getByRole('button', { name: 'Start', exact: false });
    this.restartButton = this.controlActions.getByRole('button', { name: 'Restart', exact: false });
    this.stopButton = this.controlActions.getByRole('button', { name: 'Stop', exact: false });
    this.deleteButton = this.controlActions.getByRole('button', { name: 'Delete', exact: false });
  }

  async getState(): Promise<string> {
    const currentState = await this.header.getByLabel('Connection Status Label').innerText();
    for (const state of Object.values(ResourceElementState)) {
      if (currentState === state) return state;
    }

    return 'UNKNOWN'; //append to ResourceElementState?
  }
}
