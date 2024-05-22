/**********************************************************************
 * Copyright (C) 2023-2024 Red Hat, Inc.
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
import type { Status, CrcStatus as CrcStatusApi } from './types';
import { commander } from './daemon-commander';
import { needSetup } from './crc-setup';

const defaultStatus: Status = { CrcStatus: 'Unknown', Preset: 'openshift' };
const setupStatus: Status = { CrcStatus: 'Need Setup', Preset: 'Unknown' };
const errorStatus: Status = { CrcStatus: 'Error', Preset: 'Unknown' };

export class CrcStatus {
  private updateTimer: NodeJS.Timer;
  private _status: Status;
  private isSetupGoing: boolean;
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
      try {
        // we don't need to update status while setup is going
        if (this.isSetupGoing) {
          this._status = createStatus('Starting', this._status.Preset);
          return;
        }
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
    }, 2000);
  }

  stopStatusUpdate(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }

  get status(): Status {
    return this._status;
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
      this._status = await commander.status();
    } catch (err) {
      console.error('error in CRC extension', err);
      this._status = defaultStatus;
    }
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

function createStatus(crcStatus: CrcStatusApi, preset: string): Status {
  return {
    CrcStatus: crcStatus,
    Preset: preset,
  };
}

export const crcStatus = new CrcStatus();
