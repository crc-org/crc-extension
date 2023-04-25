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
import type { Status } from './daemon-commander';
import type { Disposable } from '@podman-desktop/api';
import { providerId } from './util';

export interface ProviderCommand extends extensionApi.MenuItem {
  callback: (...args: unknown[]) => unknown;
  isEnabled: (status: Status) => boolean;
  isVisible?: (status: Status) => boolean;
}

export class CommandManager {
  private extensionContext: extensionApi.ExtensionContext;
  private telemetryLogger: extensionApi.TelemetryLogger;
  private commands: ProviderCommand[] = [];
  private disposables = new Map<string, Disposable>();
  constructor() {
    crcStatus.onStatusChange(e => {
      this.handleStatusChange(e);
    });
  }

  private handleStatusChange(status: Status): void {
    for (const command of this.commands) {
      command.enabled = command.isEnabled(status);
      if (command.isVisible) {
        command.visible = command.isVisible(status);
      }
    }

    this.refresh();
  }

  private refresh(): void {
    this.dispose();
    for (const command of this.commands) {
      const disposable = extensionApi.tray.registerProviderMenuItem(providerId, command);
      this.disposables.set(command.id, disposable);
    }
  }

  addCommand(command: ProviderCommand): void {
    // initial enabled state
    command.enabled = command.isEnabled(crcStatus.status);

    // initial visible
    if (command.isVisible) {
      command.visible = command.isEnabled(crcStatus.status);
    }

    const disposable = extensionApi.tray.registerProviderMenuItem(providerId, command);
    this.disposables.set(command.id, disposable);
    this.commands.push(command);

    this.extensionContext.subscriptions.push(
      extensionApi.commands.registerCommand(command.id, () => {
        this.telemetryLogger.logUsage(command.id);
        command.callback();
      }),
    );
  }

  setExtContext(extensionContext: extensionApi.ExtensionContext): void {
    this.extensionContext = extensionContext;
    extensionContext.subscriptions.push(extensionApi.Disposable.from(this));
  }

  setTelemetryLogger(telemetryLogger: extensionApi.TelemetryLogger): void {
    this.telemetryLogger = telemetryLogger;
  }

  dispose(): void {
    // dispose all commands registered
    for (const disposable of this.disposables.values()) {
      disposable.dispose();
    }
  }
}

export const commandManager = new CommandManager();
