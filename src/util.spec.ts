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

import type * as extensionApi from '@podman-desktop/api';
import { expect, test, vi } from 'vitest';
import { getLoggerCallback } from './util';

test('check logger passed to getLoggerCallback is actually called with data', async () => {
    const logMock = vi.fn();
    const logger = {
        log: logMock,
    } as unknown as extensionApi.Logger;
    const callback = getLoggerCallback(undefined, logger);
    callback('data');
    expect(logMock).toBeCalledWith('data');
});

test('check logger passed to getLoggerCallback is actually called with data', async () => {
    const logMock = vi.fn();
    const context = {
        log: {
            log: logMock,
        },
    } as unknown as extensionApi.LifecycleContext;
    const callback = getLoggerCallback(context);
    callback('data2');
    expect(logMock).toBeCalledWith('data2');
});