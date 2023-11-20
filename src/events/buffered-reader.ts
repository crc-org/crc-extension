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

export interface LineConsumer {
  (buf: Buffer, pos: number, fieldLength: number, lineLength: number): void;
}

const maxBufferAheadAllocation = 1024 * 256;
const bom = [239, 187, 191];
const colon = 58;
const lineFeed = 10;
const carriageReturn = 13;

export class BufferedReader {
  private buffer: Buffer;
  private bytesUsed = 0;
  private discardTrailingNewline = false;
  private startingFieldLength = -1;
  private startingPos = 0;

  constructor(private readonly lineConsumer: LineConsumer) {}

  onData(chunk: Buffer): void {
    let newBuffer: Buffer;
    let newBufferSize = 0;

    if (!this.buffer) {
      this.buffer = chunk;
      if (hasBom(this.buffer)) {
        this.buffer = this.buffer.subarray(bom.length);
      }
      this.bytesUsed = this.buffer.length;
    } else {
      if (chunk.length > this.buffer.length - this.bytesUsed) {
        newBufferSize = this.buffer.length * 2 + chunk.length;
        if (newBufferSize > maxBufferAheadAllocation) {
          newBufferSize = this.buffer.length + chunk.length + maxBufferAheadAllocation;
        }
        newBuffer = Buffer.alloc(newBufferSize);
        this.buffer.copy(newBuffer, 0, 0, this.bytesUsed);
        this.buffer = newBuffer;
      }
      chunk.copy(this.buffer, this.bytesUsed);
      this.bytesUsed += chunk.length;
    }

    let pos = 0;
    const length = this.bytesUsed;

    while (pos < length) {
      if (this.discardTrailingNewline) {
        if (this.buffer[pos] === lineFeed) {
          ++pos;
        }
        this.discardTrailingNewline = false;
      }

      let lineLength = -1;
      let fieldLength = this.startingFieldLength;
      let c: number;

      for (let i = this.startingPos; lineLength < 0 && i < length; ++i) {
        c = this.buffer[i];
        if (c === colon) {
          if (fieldLength < 0) {
            fieldLength = i - pos;
          }
        } else if (c === carriageReturn) {
          this.discardTrailingNewline = true;
          lineLength = i - pos;
        } else if (c === lineFeed) {
          lineLength = i - pos;
        }
      }

      if (lineLength < 0) {
        this.startingPos = length - pos;
        this.startingFieldLength = fieldLength;
        break;
      } else {
        this.startingPos = 0;
        this.startingFieldLength = -1;
      }

      this.lineConsumer(this.buffer, pos, fieldLength, lineLength);

      pos += lineLength + 1;
    }

    if (pos === length) {
      this.buffer = void 0;
      this.bytesUsed = 0;
    } else if (pos > 0) {
      this.buffer = this.buffer.subarray(pos, this.bytesUsed);
      this.bytesUsed = this.buffer.length;
    }
  }
}

function hasBom(buffer: Buffer): boolean {
  return bom.every((charCode, index) => {
    return buffer[index] === charCode;
  });
}
