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
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as extensionApi from '@podman-desktop/api';
import { productName, runCliCommand } from './util';
import { getPodmanCli } from './podman-cli';
import { crcStatus } from './crc-status';

type ImageInfo = { engineId: string; name?: string; tag?: string };

export async function pushImageToCrcCluster(image: ImageInfo): Promise<void> {
  if (!image.name) {
    throw new Error('Image selection not supported yet');
  }
  let name = image.name;
  if (image.tag) {
    name = name + ':' + image.tag;
  }

  if (crcStatus.status.CrcStatus !== 'Running') {
    return;
  }

  return extensionApi.window.withProgress(
    { location: extensionApi.ProgressLocation.TASK_WIDGET, title: `Pushing ${name}...` },
    async progress => {
      progress.report({ increment: 0 });
      const filename = path.join(os.tmpdir(), image.name ? image.name.replaceAll('/', '') : image.engineId);
      try {
        await extensionApi.containerEngine.saveImage(image.engineId, name, filename);
        progress.report({ increment: 50 });
        const result = await runCliCommand(getPodmanCli(), [
          '--url=ssh://core@127.0.0.1:2222/run/podman/podman.sock',
          `--identity=${os.homedir()}/.crc/machines/crc/id_ecdsa`,
          'load',
          '-i',
          filename,
        ]);
        progress.report({ increment: 100 });
        if (result.exitCode !== 0) {
          throw new Error(result.stdErr);
        }
        extensionApi.window.showNotification({
          body: `Image ${image.name} pushed to ${productName} cluster`,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '' + error;
        progress.report({
          message: `Error while pushing image ${image.name} to  ${productName} cluster: ${errorMessage}`,
        });
      } finally {
        fs.promises.rm(filename);
      }
    },
  );
}
