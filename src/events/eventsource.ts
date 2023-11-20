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

import EventEmitter from 'node:events';
import type { Request, Response } from 'got';
import got from 'got';
import { BufferedReader } from './buffered-reader';

const space = 32;

export interface EvenSourceOptions {
  /**
   * A boolean value, defaulting to `false`, indicating if CORS should be set to include credentials.
   */
  withCredentials?: boolean;
}

enum ReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSED = 2,
}

export interface Event {
  readonly type: string;
}

export interface ErrorEvent extends Event {
  readonly message: string;
  readonly status?: number;
}

export interface MessageEvent extends Event {
  data: string;
  lastEventId?: string;
  origin?: string;
}

export class EventSource extends EventEmitter {
  readonly CONNECTING: ReadyState.CONNECTING;
  readonly OPEN: ReadyState.OPEN;
  readonly CLOSED: ReadyState.CLOSED;

  readyState: ReadyState;

  private req: Request | undefined;
  private data = '';
  private eventName = '';
  private lastEventId = '';

  constructor(public readonly url: string, private options?: EvenSourceOptions) {
    super();
    this.readyState = ReadyState.CONNECTING;
    const req = got.stream(this.url, { isStream: true });
    this.req = req;
    req.on('response', (res: Response) => {
      if (res.statusCode === 500 || res.statusCode === 502 || res.statusCode === 503 || res.statusCode === 504) {
        this.emit('error', newErrorEvent(res.statusMessage, res.statusCode));
        this.onConnectionClosed();
        return;
      }

      // TODO: should we handle redirects?

      if (res.statusCode !== 200) {
        this.emit('error', newErrorEvent(res.statusMessage, res.statusCode));
        this.close();
        return;
      }

      this.readyState = ReadyState.OPEN;

      req.on('end', () => {
        req.removeAllListeners('close');
        req.removeAllListeners('end');
        this.onConnectionClosed('Stream ended');
      });

      req.on('close', () => {
        req.removeAllListeners('close');
        req.removeAllListeners('end');
        this.onConnectionClosed('Stream closed');
      });

      this.emit('open', { type: 'open' });
    });

    const bufferedReader = new BufferedReader(this.parseEventStreamLine.bind(this));
    req.on('data', bufferedReader.onData.bind(bufferedReader));

    req.on('error', err => {
      this.onConnectionClosed(err.message);
    });
  }

  close() {
    if (this.readyState === ReadyState.CLOSED) {
      return;
    }

    this.readyState = ReadyState.CLOSED;
    this.req?.destroy();
  }

  private onConnectionClosed(message?: string): void {
    if (this.readyState === ReadyState.CLOSED) {
      return;
    }

    this.emit('error', newErrorEvent(message));
  }

  private parseEventStreamLine(buf: Buffer, pos: number, fieldLength: number, lineLength: number): void {
    if (lineLength === 0) {
      if (this.data.length > 0) {
        const type = this.eventName || 'message';
        this.emit(type, newMessageEvent(type, this.data, this.lastEventId, new URL(this.url).origin));
        this.data = '';
      }
      this.eventName = void 0;
    } else if (fieldLength > 0) {
      const noValue = fieldLength < 0;
      let step = 0;
      const field = buf.subarray(pos, pos + (noValue ? lineLength : fieldLength)).toString();

      if (noValue) {
        step = lineLength;
      } else if (buf[pos + fieldLength + 1] !== space) {
        step = fieldLength + 1;
      } else {
        step = fieldLength + 2;
      }
      pos += step;

      const valueLength = lineLength - step;
      const value = buf.subarray(pos, pos + valueLength).toString();

      if (field === 'data') {
        this.data += value + '\n';
      } else if (field === 'event') {
        this.eventName = value;
      } else if (field === 'id') {
        this.lastEventId = value;
      }
    }
  }
}

function newErrorEvent(message: string, status?: number): ErrorEvent {
  return {
    type: 'error',
    message,
    status,
  };
}

function newMessageEvent(type: string, data: string, lastEventId, origin: string): MessageEvent {
  return {
    type,
    data,
    lastEventId,
    origin,
  };
}
