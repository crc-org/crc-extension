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

import type { Preset } from './types';

export const PRE_SSE_VERSION = '2.30.0';

// copied from https://github.com/crc-org/crc/blob/632676d7c9ba0c030736c3d914984c4e140c1bf5/pkg/crc/constants/constants.go#L198

export function getDefaultCPUs(preset: Preset): number {
  switch (preset) {
    case 'openshift':
      return 4;
    case 'microshift':
    case 'podman':
      return 2;
    default:
      // should not be reached
      return 4;
  }
}

export function getDefaultMemory(preset: Preset): number {
  switch (preset) {
    case 'openshift':
      return 9216;
    case 'microshift':
      return 4096;
    case 'podman':
      return 2048;
    default:
      // should not be reached
      return 9216;
  }
}
