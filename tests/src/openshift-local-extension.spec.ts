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

import type { NavigationBar } from '@podman-desktop/tests-playwright';
import { expect as playExpect, ExtensionCardPage, RunnerOptions, test, ResourceConnectionCardPage } from '@podman-desktop/tests-playwright';

import { OpenShiftLocalExtensionPage } from './model/pages/openshift-local-extension-page';

let extensionInstalled = false;
let extensionCard: ExtensionCardPage;
let resourcesPage: ResourceConnectionCardPage;
const imageName = 'ghcr.io/crc-org/crc-extension:latest';
const extensionLabelCrc = 'redhat.openshift-local';
const extensionLabelNameCrc = 'openshift-local';
const extensionLabelAuthentication = 'redhat.redhat-authentication';
const extensionLabelNameAuthentication = 'redhat-authentication';
const activeExtensionStatus = 'ACTIVE';
const disabledExtensionStatus = 'DISABLED';
const notInstalledExtensionStatus = 'NOT-INSTALLED';
const skipInstallation = process.env.SKIP_INSTALLATION ? process.env.SKIP_INSTALLATION : false;

test.use({ 
  runnerOptions: new RunnerOptions({ customFolder: 'crc-tests-pd', autoUpdate: false, autoCheckUpdates: false }),
});
test.beforeAll(async ({ runner, page, welcomePage }) => {
  runner.setVideoAndTraceName('crc-e2e');
  await welcomePage.handleWelcomePage(true);
  extensionCard = new ExtensionCardPage(page, extensionLabelNameCrc, extensionLabelCrc);
  resourcesPage = new ResourceConnectionCardPage(page, 'crc');
});

test.afterAll(async ({ runner }) => {
  await runner.close();
  console.log('Runner closed');
});

test.describe.serial('Red Hat OpenShift Local extension verification', () => {
  test.describe.serial('Red Hat OpenShift Local extension installation', () => {
    // PR check builds extension locally and so it is available already
    test('Go to extensions and check if extension is already installed', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      if (await extensions.extensionIsInstalled(extensionLabelCrc)) {
        extensionInstalled = true;
      }
    });

    // we want to skip removing of the extension when we are running tests from PR check
    test('Uninstall previous version of crc extension', async ({ navigationBar }) => {
      test.skip(!extensionInstalled || !!skipInstallation);
      test.setTimeout(60000);
      await removeExtension(navigationBar);
    });

    // we want to install extension from OCI image (usually using latest tag) after new code was added to the codebase
    // and extension was published already
    test('Extension can be installed using OCI image', async ({ navigationBar }) => {
      test.skip(!!skipInstallation);
      test.setTimeout(200000);
      const extensions = await navigationBar.openExtensions();
      await extensions.installExtensionFromOCIImage(imageName);
      await playExpect(extensionCard.card).toBeVisible();
    });

    test('Extension (card) is installed, present and active', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      await playExpect.poll(async () => 
        await extensions.extensionIsInstalled(extensionLabelCrc), { timeout: 30000 },
      ).toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelNameCrc, extensionLabelCrc);
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);
    });

    test('Extension\'s dependency, Red Hat Authentication, (card) is installed, present and active', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      await playExpect.poll(async () => 
        await extensions.extensionIsInstalled(extensionLabelAuthentication), { timeout: 30000 },
      ).toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelNameAuthentication, extensionLabelAuthentication);
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);
    });

    test('Extension\'s details show correct status, no error', async ({ page,navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelNameCrc, extensionLabelCrc);
      await extensionCard.openExtensionDetails('Red Hat OpenShift Local');
      const details = new OpenShiftLocalExtensionPage(page);
      await playExpect(details.heading).toBeVisible();
      await playExpect(details.status).toHaveText(activeExtensionStatus);
      const errorTab = details.tabs.getByRole('button', { name: 'Error' });
      // we would like to propagate the error's stack trace into test failure message
      let stackTrace = '';
      if ((await errorTab.count()) > 0) {
        await details.activateTab('Error');
        stackTrace = await details.errorStackTrace.innerText();
      }
      await playExpect(errorTab, `Error Tab was present with stackTrace: ${stackTrace}`).not.toBeVisible();
    });
  });

  test.describe.serial('Red Hat OpenShift Local extension handling', () => {
    test('Extension can be disabled', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      await playExpect.poll(async() => await extensions.extensionIsInstalled(extensionLabelCrc), { timeout: 30000 }).toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelNameCrc, extensionLabelCrc);
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);
      await extensionCard.disableExtension();
      await playExpect(extensionCard.status).toHaveText(disabledExtensionStatus);
      //checking dashboard assets
      const dashboard = await navigationBar.openDashboard();
      await playExpect(dashboard.openshiftLocalProvider).toHaveCount(0, {timeout: 3_000});
      //checking settings/resources assets
      await navigationBar.openSettings();
      await playExpect(resourcesPage.card).toHaveCount(0, {timeout: 3_000});
    });

    test('Extension can be re-enabled correctly', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      await playExpect.poll(async() => await extensions.extensionIsInstalled(extensionLabelCrc), { timeout: 30000 }).toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelNameCrc, extensionLabelCrc);
      await playExpect(extensionCard.status).toHaveText(disabledExtensionStatus);
      await extensionCard.enableExtension();
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);
      //checking dashboard assets
      const dashboard = await navigationBar.openDashboard();
      await playExpect(dashboard.openshiftLocalProvider).toBeVisible();
      await playExpect(dashboard.openshiftLocalStatusLabel).toHaveText(notInstalledExtensionStatus); // if locally, delete binary or comment this
      //checking settings/resources assets
      await navigationBar.openSettings();
      await playExpect(resourcesPage.card).toBeVisible();
    }); 
  });

  test('OpenShift Local extension can be removed', async ({ navigationBar }) => {
    await removeExtension(navigationBar);
  });
});

async function removeExtension(navBar: NavigationBar): Promise<void> {
  const extensions = await navBar.openExtensions();
  const extensionCard = await extensions.getInstalledExtension(extensionLabelNameCrc, extensionLabelCrc);
  await extensionCard.disableExtension();
  await extensionCard.removeExtension();
  await playExpect.poll(async () => await extensions.extensionIsInstalled(extensionLabelCrc), { timeout: 15000 }).toBeFalsy();
}
