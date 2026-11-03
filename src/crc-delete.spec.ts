/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
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
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { deleteCrc, registerDeleteCommand } from './crc-delete.js';
import { commander } from './daemon-commander.js';
import { commandManager } from './command.js';
import type { ProviderTrayCommand } from './command.js';

vi.mock('@podman-desktop/api', async () => {
  const EventEmitter = vi.fn();
  EventEmitter.prototype.fire = vi.fn();
  return {
    EventEmitter,
    window: {
      showNotification: vi.fn(),
      showInformationMessage: vi.fn(),
    },
  };
});

vi.mock('./crc-status.js', () => ({
  crcStatus: {
    status: { CrcStatus: 'Running' },
  },
}));

vi.mock('./daemon-commander.js', () => ({
  commander: {
    delete: vi.fn(),
  },
}));

vi.mock('./command.js', () => ({
  commandManager: {
    addTrayCommand: vi.fn(),
  },
}));

const fireMock = extensionApi.EventEmitter.prototype.fire;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('deleteCrc', () => {
  test('fires the deleted event when user confirms', async () => {
    vi.mocked(extensionApi.window.showInformationMessage).mockResolvedValue('Yes');

    await deleteCrc();

    expect(commander.delete).toHaveBeenCalled();
    expect(fireMock).toHaveBeenCalled();
  });

  test('does not fire the deleted event when user declines', async () => {
    vi.mocked(extensionApi.window.showInformationMessage).mockResolvedValue('No');

    await deleteCrc();

    expect(commander.delete).not.toHaveBeenCalled();
    expect(fireMock).not.toHaveBeenCalled();
  });

  test('deletes the cluster without asking when confirmation is disabled', async () => {
    await deleteCrc(false, false);

    expect(extensionApi.window.showInformationMessage).not.toHaveBeenCalled();
    expect(commander.delete).toHaveBeenCalled();
    expect(fireMock).toHaveBeenCalled();
  });

  test('does not fire the deleted event when delete fails', async () => {
    vi.mocked(commander.delete).mockRejectedValue(new Error('delete failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await deleteCrc(false, false);

    expect(fireMock).not.toHaveBeenCalled();
  });
});

describe('registerDeleteCommand', () => {
  test('tray command deletes the cluster without asking and fires the deleted event', async () => {
    registerDeleteCommand();
    const command: ProviderTrayCommand = vi.mocked(commandManager.addTrayCommand).mock.calls[0][0];

    await command.callback();

    expect(extensionApi.window.showInformationMessage).not.toHaveBeenCalled();
    expect(commander.delete).toHaveBeenCalled();
    expect(fireMock).toHaveBeenCalled();
  });
});
