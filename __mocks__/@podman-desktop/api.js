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
import { vi } from 'vitest';

/**
 * Mock the extension API for vitest.
 * This file is referenced from vitest.config.js file.
 */
const plugin = {
  process: {
    exec: vi.fn(),
  },
  env: {
    isLinux: false,
    isWindows: false,
    isMac: false,
    createTelemetryLogger: vi.fn(),
  },
  provider: {
    createProvider: vi.fn(),
  },
  cli: {
    createCliTool: vi.fn(),
  },
  context: {
    setValue: vi.fn(),
  },
  authentication: {
    getSession: vi.fn(),
  },
  EventEmitter: vi.fn(function () {
    return { event: vi.fn(), fire: vi.fn(), dispose: vi.fn() };
  }),
};
module.exports = plugin;
