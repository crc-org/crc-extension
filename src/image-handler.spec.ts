/**********************************************************************
 * Copyright (C) 2025 Red Hat, Inc.
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
import { beforeEach, expect, test, vi } from 'vitest';
import * as extensionApi from '@podman-desktop/api';
import { pushImageToCrcCluster } from './image-handler.js';
import * as os from 'node:os';
import { getCrcVersion } from './crc-cli.js';
import * as utils from './util.js';

type ImageInfo = { engineId: string; name?: string; tag?: string };

vi.mock('@podman-desktop/api', async () => {
  return {
    window: {
      withProgress: vi.fn(),
      showInformationMessage: vi.fn(),
    },
    containerEngine: {
      saveImage: vi.fn(),
    },
    ProgressLocation: {
      TASK_WIDGET: 2,
    },
    configuration: {
      getConfiguration: vi.fn(),
    },
    EventEmitter: vi.fn(),
  };
});

vi.mock('./crc-cli.ts', () => {
  return {
    getCrcVersion: vi.fn(),
  };
});

vi.mock('./util.ts', async () => {
  return {
    runCliCommand: vi.fn(),
    isWindows: vi.fn().mockReturnValue(false),
    isMac: vi.fn().mockReturnValue(false),
    productName: 'OpenShift Local',
  };
});

vi.mock('node:os', () => {
  return {
    tmpdir: vi.fn(),
    platform: vi.fn().mockReturnValue('linux'),
    homedir: vi.fn(),
  };
});

vi.mock('node:fs', () => {
  return {
    promises: {
      rm: vi.fn(),
    },
  };
});

vi.mock('./crc-status.ts', () => {
  return {
    crcStatus: {
      status: {
        CrcStatus: 'Running',
      },
    },
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(utils.isWindows).mockReturnValue(false);
  vi.mocked(utils.isMac).mockReturnValue(false);
  vi.mocked(utils.runCliCommand).mockResolvedValue({ exitCode: 0, stdErr: '', stdOut: 'ok' } as utils.SpawnResult);
  vi.mocked(extensionApi.configuration.getConfiguration).mockReturnValue({
    get: vi.fn(),
  } as unknown as extensionApi.Configuration);
});

test.each([
  { version: '1.51.0', keyName: 'id_ecdsa' },
  { version: '2.40.0', keyName: 'id_ecdsa' },
  { version: '2.41.0', keyName: 'id_ed25519' },
  { version: '3.34.0', keyName: 'id_ed25519' },
])('use correct ssh key name for version $version', async ({ version, keyName }) => {
  let progressFunction;

  const progress: extensionApi.Progress<{ message?: string; increment?: number }> = { report: vi.fn() };

  vi.mocked(extensionApi.window.withProgress).mockImplementation(
    (
      options: extensionApi.ProgressOptions,
      task: (
        progress: extensionApi.Progress<{ message?: string; increment?: number }>,
        token: extensionApi.CancellationToken,
      ) => Promise<void>,
    ): Promise<void> => {
      progressFunction = task;
      return;
    },
  );

  vi.mocked(os.tmpdir).mockReturnValue('/tmp/path');
  vi.mocked(os.homedir).mockReturnValue('/home/path');
  vi.mocked(getCrcVersion).mockResolvedValue({ version: version, podmanVersion: '1.0.0', openshiftVersion: '1.0.0' });

  const imageInfoMock: ImageInfo = {
    engineId: 'imageEngine',
    name: 'image1',
    tag: 'tag1',
  };
  await pushImageToCrcCluster(imageInfoMock);

  await progressFunction(progress);

  expect(utils.runCliCommand).toHaveBeenCalledWith(
    'podman',
    expect.arrayContaining([`--identity=/home/path/.crc/machines/crc/${keyName}`]),
    expect.any(Object),
  );
});
