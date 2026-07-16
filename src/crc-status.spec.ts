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

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CrcStatus } from './crc-status.js';
import * as daemon from './daemon-commander.js';
import * as preferences from './preferences.js';
import * as crcSetup from './crc-setup.js';
import type { Configuration, Preset, Status } from './types.js';

vi.mock('@podman-desktop/api', async () => {
  const EventEmitter = vi.fn();
  EventEmitter.prototype.fire = vi.fn();
  EventEmitter.prototype.event = vi.fn();
  return {
    EventEmitter,
  };
});

vi.mock('./preferences.js', async () => {
  return {
    isPreset: vi.fn((data: string) => ['openshift', 'microshift', 'podman'].includes(data)),
    presetChanged: vi.fn(),
  };
});

vi.mock('./crc-setup.js', async () => {
  return {
    needSetup: vi.fn(),
  };
});

vi.mock('./daemon-commander.js', async () => {
  return {
    commander: {
      status: vi.fn(),
      configGet: vi.fn(),
    },
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// returns a config read that stays pending until resolved
function pendingConfigRead(): (preset: Preset) => void {
  let resolveConfig: (value: Configuration) => void = () => {};
  vi.mocked(daemon.commander.configGet).mockReturnValueOnce(
    new Promise<Configuration>(resolve => (resolveConfig = resolve)),
  );
  return preset => resolveConfig({ preset } as Configuration);
}

test('initialize reads the config preset', async () => {
  const status = new CrcStatus();
  vi.mocked(crcSetup.needSetup).mockResolvedValue(false);
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'Stopped', Preset: 'openshift' });
  vi.mocked(daemon.commander.configGet).mockResolvedValue({ preset: 'microshift' } as Configuration);

  await status.initialize();

  expect(status.configPreset).toBe('microshift');
  expect(preferences.presetChanged).not.toHaveBeenCalled();
});

test('startStatusUpdate fires presetChanged only when the config preset changes', async () => {
  const status = new CrcStatus();
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'Running', Preset: 'openshift' });
  const configGetMock = vi.mocked(daemon.commander.configGet);
  configGetMock.mockResolvedValueOnce({ preset: 'openshift' } as Configuration);
  configGetMock.mockResolvedValueOnce({ preset: 'openshift' } as Configuration);
  configGetMock.mockResolvedValue({ preset: 'microshift' } as Configuration);

  status.startStatusUpdate();

  // first read only records the preset, then an unchanged preset does not fire
  await vi.advanceTimersByTimeAsync(4000);
  expect(status.configPreset).toBe('openshift');
  expect(preferences.presetChanged).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(2000);
  expect(status.configPreset).toBe('microshift');
  expect(preferences.presetChanged).toHaveBeenCalledOnce();
  expect(preferences.presetChanged).toHaveBeenCalledWith('microshift');
  // preset of the current instance is not affected by the config preset
  expect(status.status.Preset).toBe('openshift');

  // no cluster status (no instance preset) keeps the config preset and does not fire again
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'No Cluster' } as Status);
  await vi.advanceTimersByTimeAsync(4000);
  expect(status.status.CrcStatus).toBe('No Cluster');
  expect(status.configPreset).toBe('microshift');
  expect(preferences.presetChanged).toHaveBeenCalledOnce();

  status.stopStatusUpdate();
});

test.each<{ name: string; setPresets: Preset[]; readResult: Preset }>([
  { name: 'read returns the new preset', setPresets: ['microshift'], readResult: 'microshift' },
  { name: 'read returns the old preset', setPresets: ['microshift'], readResult: 'openshift' },
  { name: 'preset changed and back', setPresets: ['microshift', 'openshift'], readResult: 'microshift' },
])('config read pending during setConfigPreset is discarded: $name', async ({ setPresets, readResult }) => {
  const status = new CrcStatus();
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'Stopped', Preset: 'openshift' });
  const configGetMock = vi.mocked(daemon.commander.configGet);
  configGetMock.mockResolvedValueOnce({ preset: 'openshift' } as Configuration);

  status.startStatusUpdate();
  await vi.advanceTimersByTimeAsync(2000);

  const resolveRead = pendingConfigRead();
  const latestPreset = setPresets[setPresets.length - 1];
  configGetMock.mockResolvedValue({ preset: latestPreset } as Configuration);
  await vi.advanceTimersByTimeAsync(2000);

  // preset changed from the preferences form, which already fired presetChangedEvent
  setPresets.forEach(preset => status.setConfigPreset(preset));
  resolveRead(readResult);

  // later polls read the preset that was set and do not report it again
  await vi.advanceTimersByTimeAsync(4000);
  expect(status.configPreset).toBe(latestPreset);
  expect(preferences.presetChanged).not.toHaveBeenCalled();

  status.stopStatusUpdate();
});

test('config read is skipped while the previous one is pending', async () => {
  const status = new CrcStatus();
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'Running', Preset: 'openshift' });
  const configGetMock = vi.mocked(daemon.commander.configGet);
  configGetMock.mockResolvedValueOnce({ preset: 'openshift' } as Configuration);

  status.startStatusUpdate();
  await vi.advanceTimersByTimeAsync(2000);

  // this read stays pending across the next ticks
  const resolveRead = pendingConfigRead();
  configGetMock.mockResolvedValue({ preset: 'microshift' } as Configuration);

  await vi.advanceTimersByTimeAsync(4000);
  expect(configGetMock).toHaveBeenCalledTimes(2);
  expect(status.configPreset).toBe('openshift');

  resolveRead('openshift');
  await vi.advanceTimersByTimeAsync(2000);

  expect(configGetMock).toHaveBeenCalledTimes(3);
  expect(status.configPreset).toBe('microshift');
  expect(preferences.presetChanged).toHaveBeenCalledOnce();
  expect(preferences.presetChanged).toHaveBeenCalledWith('microshift');

  status.stopStatusUpdate();
});

test('missing or unknown config preset is ignored', async () => {
  const status = new CrcStatus();
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'Running', Preset: 'openshift' });
  const configGetMock = vi.mocked(daemon.commander.configGet);
  configGetMock.mockResolvedValueOnce({ preset: 'openshift' } as Configuration);
  configGetMock.mockResolvedValueOnce({} as Configuration);
  configGetMock.mockResolvedValueOnce({ preset: 'invalid' } as unknown as Configuration);

  status.startStatusUpdate();
  await vi.advanceTimersByTimeAsync(6000);

  expect(status.configPreset).toBe('openshift');
  expect(preferences.presetChanged).not.toHaveBeenCalled();

  status.stopStatusUpdate();
});

test('config preset check failure does not reset the cluster status', async () => {
  const status = new CrcStatus();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(daemon.commander.status).mockResolvedValue({ CrcStatus: 'No Cluster' });
  vi.mocked(daemon.commander.configGet).mockRejectedValue(new Error('daemon not reachable'));

  status.startStatusUpdate();
  await vi.advanceTimersByTimeAsync(4000);

  expect(status.status.CrcStatus).toBe('No Cluster');
  expect(preferences.presetChanged).not.toHaveBeenCalled();

  status.stopStatusUpdate();
});

test('stalled status request does not delay the config preset check', async () => {
  const status = new CrcStatus();
  vi.mocked(daemon.commander.status).mockReturnValue(new Promise<Status>(() => {}));
  const configGetMock = vi.mocked(daemon.commander.configGet);
  configGetMock.mockResolvedValueOnce({ preset: 'openshift' } as Configuration);
  configGetMock.mockResolvedValue({ preset: 'microshift' } as Configuration);

  status.startStatusUpdate();
  await vi.advanceTimersByTimeAsync(4000);

  expect(status.configPreset).toBe('microshift');
  expect(preferences.presetChanged).toHaveBeenCalledWith('microshift');

  status.stopStatusUpdate();
});
