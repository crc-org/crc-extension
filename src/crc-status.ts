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

import * as extensionApi from '@podman-desktop/api';
import type { Status, CrcStatus as CrcStatusApi, Preset } from './types.js';
import { commander } from './daemon-commander.js';
import { needSetup } from './crc-setup.js';
import { isPreset, presetChanged } from './preferences.js';

const defaultStatus: Status = { CrcStatus: 'Unknown', Preset: 'openshift' };
const setupStatus: Status = { CrcStatus: 'Need Setup', Preset: 'Unknown' };
const errorStatus: Status = { CrcStatus: 'Error', Preset: 'Unknown' };

export class CrcStatus {
  private updateTimer: NodeJS.Timeout | undefined;
  private _status: Status;
  private isSetupGoing: boolean = false;
  private _configPreset: Preset | undefined;
  private isReadingConfigPreset = false;
  private configPresetRevision = 0;
  private statusChangeEventEmitter = new extensionApi.EventEmitter<Status>();
  public readonly onStatusChange = this.statusChangeEventEmitter.event;

  constructor() {
    this._status = defaultStatus;
  }

  startStatusUpdate(): void {
    if (this.updateTimer) {
      return; // we already set timer
    }
    this.updateTimer = setInterval(async () => {
      // we don't need to update status while setup is going
      if (this.isSetupGoing) {
        this._status = createStatus('Starting', this._status.Preset);
        return;
      }
      // run in parallel, so a stalled status request can't delay the preset check
      await Promise.all([this.updateStatus(), this.updateConfigPreset()]);
    }, 2000);
  }

  private async updateStatus(): Promise<void> {
    try {
      const oldStatus = this._status;
      this._status = await commander.status();
      // notify listeners when status changed
      if (oldStatus.CrcStatus !== this._status.CrcStatus) {
        this.statusChangeEventEmitter.fire(this._status);
      }
    } catch (e) {
      console.error('CRC Status tick: ' + e);
      this._status = defaultStatus;
    }
  }

  stopStatusUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }

  get status(): Status {
    return this._status;
  }

  get configPreset(): Preset | undefined {
    return this._configPreset;
  }

  // keep the stored preset in sync with changes already published changes
  setConfigPreset(preset: Preset): void {
    this._configPreset = preset;
    // incremented on every setConfigPreset call, to discard reads that started before it
    this.configPresetRevision++;
  }

  // detect preset changes made outside the extension
  private async updateConfigPreset(): Promise<void> {
    if (this.isReadingConfigPreset) {
      return;
    }
    this.isReadingConfigPreset = true;
    try {
      const revision = this.configPresetRevision;
      const newPreset = (await commander.configGet()).preset;
      // setConfigPreset was called while reading, the result may be outdated
      if (this.configPresetRevision !== revision) {
        return;
      }
      const oldPreset = this._configPreset;
      if (!isPreset(newPreset)) {
        return;
      }
      this._configPreset = newPreset;
      if (oldPreset !== undefined && oldPreset !== newPreset) {
        presetChanged(newPreset);
      }
    } catch (e) {
      // ignore error, wait for next poll
    } finally {
      this.isReadingConfigPreset = false;
    }
  }

  setErrorStatus(): void {
    this._status = errorStatus;
  }

  async initialize(): Promise<void> {
    const isNeedSetup = await needSetup();
    if (isNeedSetup) {
      this._status = setupStatus;
      return;
    }

    try {
      // initial status
      const oldStatus = this._status;
      this._status = await commander.status();
      // notify listeners when status changed
      if (oldStatus.CrcStatus !== this._status.CrcStatus) {
        this.statusChangeEventEmitter.fire(this._status);
      }
    } catch (err) {
      console.error('error in CRC extension', err);
      this._status = defaultStatus;
    }

    await this.updateConfigPreset();
  }

  setSetupRunning(setup: boolean): void {
    if (setup) {
      this.isSetupGoing = true;
      this._status = createStatus('Starting', this._status.Preset);
    } else {
      this.isSetupGoing = false;
    }
  }

  getConnectionStatus(): extensionApi.ProviderConnectionStatus {
    switch (this._status.CrcStatus) {
      case 'Running':
        return 'started';
      case 'Starting':
        return 'starting';
      case 'Stopping':
        return 'stopping';
      case 'Stopped':
      case 'No Cluster':
        return 'stopped';
      default:
        return 'unknown';
    }
  }

  getProviderStatus(): extensionApi.ProviderStatus {
    switch (this._status.CrcStatus) {
      case 'Running':
        return 'started';
      case 'Starting':
        return 'starting';
      case 'Stopping':
        return 'stopping';
      case 'Stopped':
        return 'configured';
      case 'No Cluster':
        return 'installed';
      case 'Error':
        return 'error';
      case 'Need Setup':
        return 'installed';
      default:
        return 'not-installed';
    }
  }
}

function createStatus(crcStatus: CrcStatusApi, preset?: string): Status {
  return {
    CrcStatus: crcStatus,
    Preset: preset,
  };
}

export const crcStatus = new CrcStatus();
