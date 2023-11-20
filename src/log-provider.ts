/**********************************************************************
 * Copyright (C) 2022 Red Hat, Inc.
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

import type { Logger } from '@podman-desktop/api';
import type { DaemonCommander } from './daemon-commander';
import { commander, getCrcApiUrl } from './daemon-commander';
import type { MessageEvent } from './events/eventsource';
import { EventSource } from './events/eventsource';
import { compare } from 'compare-versions';
import { PRE_SSE_VERSION } from './constants';
import { getCrcVersion } from './crc-cli';

interface LogMessage {
  level: 'info' | 'error' | 'warning' | 'debug';
  msg: string;
  time: string;
}

export class LogProvider {
  private timeout: NodeJS.Timeout;
  private logEvents: EventSource;

  constructor(private readonly commander: DaemonCommander) {}

  async startSendingLogs(logger: Logger): Promise<void> {
    const crcVersion = await getCrcVersion();
    if (!crcVersion) {
      console.warn("Can't get CRC CLI version, ignore getting daemons logs...");
      return;
    }
    if (compare(crcVersion.version, PRE_SSE_VERSION, '<=')) {
      let lastLogLine = 0;
      this.timeout = setInterval(async () => {
        try {
          const logs = await this.commander.logs();
          const logsDiff: string[] = logs.Messages.slice(lastLogLine, logs.Messages.length - 1);
          lastLogLine = logs.Messages.length;
          logger.log(logsDiff.join('\n'));
        } catch (e) {
          console.log('Logs tick: ' + e);
        }
      }, 3000);
    } else {
      this.logEvents = new EventSource(getCrcApiUrl() + '/events?stream=logs');
      this.logEvents.on('logs', (e: MessageEvent) => {
        const logMessage = JSON.parse(e.data) as LogMessage;
        switch (logMessage.level) {
          case 'debug':
            logger.warn(logMessage.msg + '\n');
            break;
          case 'info':
            logger.log(logMessage.msg + '\n');
            break;
          case 'error':
            logger.error(logMessage.msg + '\n');
            break;
          case 'warning':
            logger.warn(logMessage.msg + '\n');
            break;
          default:
            console.error(`Unknown log level: ${logMessage.level}`);
            logger.warn(logMessage.msg + '\n');
            break;
        }
      });
      this.logEvents.on('error', err => {
        console.error(err);
      });
    }
  }

  stopSendingLogs(): void {
    if (this.timeout) {
      clearInterval(this.timeout);
    }
    if (this.logEvents) {
      this.logEvents.close();
    }
  }
}

export const crcLogProvider = new LogProvider(commander);
