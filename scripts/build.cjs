#!/usr/bin/env node
/**********************************************************************
 * Copyright (C) 2022 - 2024 Red Hat, Inc.
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

const AdmZip = require('adm-zip');
const path = require('path');
const packageJson = require('../package.json');
const { mkdirp } = require('mkdirp');
const fs = require('fs');
const byline = require('byline');
const cp = require('copyfiles');
const cproc = require('node:child_process');

const destFile = path.resolve(__dirname, `../${packageJson.name}.cdix`);
const builtinDirectory = path.resolve(__dirname, '../builtin');
const zipDirectory = path.resolve(builtinDirectory, `${packageJson.name}.cdix`);
const extFiles = path.resolve(__dirname, '../.extfiles');
const fileStream = fs.createReadStream(extFiles, { encoding: 'utf8' });

const includedFiles = [];
const excludedFiles = [];

// remove the .cdix file before zipping
if (fs.existsSync(destFile)) {
  fs.rmSync(destFile);
}
// remove the builtin folder before zipping
if (fs.existsSync(builtinDirectory)) {
  fs.rmSync(builtinDirectory, { recursive: true, force: true });
}

// pnpm uses symlinks in node_modules by default, which break when the dist
// folder is packaged into a .cdix zip or OCI image (especially on Windows).
// Force a flat, hoisted layout so the hasha package is a real directory.
const distDirectory = path.resolve(__dirname, '../dist');
mkdirp.sync(distDirectory);
fs.writeFileSync(path.join(distDirectory, '.npmrc'), 'node-linker=hoisted\n');
fs.writeFileSync(path.join(distDirectory, 'package.json'), '{}');

// Install external modules into dist folder.
// --store-dir reuses the root project's store so pnpm doesn't fail with
// ERR_PNPM_UNEXPECTED_STORE when running inside a subdirectory.
const storeDir = cproc.execSync('pnpm store path', { encoding: 'utf8' }).trim();
cproc.exec(`pnpm add hasha@^7.0.0 --store-dir="${storeDir}"`, { cwd: distDirectory }, (error, stdout, stderr) => {
  if (error) {
    console.log(stdout);
    console.log(stderr);
    throw error;
  }

  byline(fileStream)
    .on('data', line => {
      line.startsWith('!') ? excludedFiles.push(line.substring(1)) : includedFiles.push(line);
    })
    .on('error', () => {
      throw new Error('Error reading .extfiles');
    })
    .on('end', () => {
      includedFiles.push(zipDirectory); // add destination dir
      mkdirp.sync(zipDirectory);
      console.log(`Copying files to ${zipDirectory}`);
      cp(includedFiles, { exclude: excludedFiles }, error => {
        if (error) {
          throw new Error('Error copying files', error);
        }
        console.log(`Zipping files to ${destFile}`);
        const zip = new AdmZip();
        zip.addLocalFolder(zipDirectory);
        zip.writeZip(destFile);
      });
    });
});
