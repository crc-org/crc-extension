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

import type { ContainerInteractiveParams, NavigationBar } from '@podman-desktop/tests-playwright';
import { expect as playExpect, ExtensionCardPage, RunnerOptions, test, ResourceConnectionCardPage, PreferencesPage, ContainerState, ContainerDetailsPage, deleteContainer, deleteImage, deletePod } from '@podman-desktop/tests-playwright';

import { OpenShiftLocalExtensionPage } from './model/pages/openshift-local-extension-page';

let extensionInstalled = false;
let extensionCard: ExtensionCardPage;
let resourcesPage: ResourceConnectionCardPage;
let preferencesPage: PreferencesPage;
const imageName = 'ghcr.io/crc-org/crc-extension:latest';
const extensionLabelCrc = 'redhat.openshift-local';
const extensionLabelNameCrc = 'openshift-local';
const extensionLabelAuthentication = 'redhat.redhat-authentication';
const extensionLabelNameAuthentication = 'redhat-authentication';
const activeExtensionStatus = 'ACTIVE';
const disabledExtensionStatus = 'DISABLED';
const notInstalledExtensionStatus = 'NOT-INSTALLED';
const skipInstallation = process.env.SKIP_INSTALLATION ? process.env.SKIP_INSTALLATION : false;

const kubernetesContext = 'microshift';
const imageName1 = 'quay.io/sclorg/httpd-24-micro-c9s';
const imageName2 = 'ghcr.io/linuxcontainers/alpine';
const containerName1 = 'container-to-deploy-1';
const containerName2 = 'container-to-deploy-2';
const deployedPodName1 = 'container-1-pod';
const deployedPodName2 = 'container-2-pod';
const containerStartParams: ContainerInteractiveParams = {
  attachTerminal: false,
};

test.use({ 
  runnerOptions: new RunnerOptions({ customFolder: 'crc-tests-pd', autoUpdate: false, autoCheckUpdates: false }),
});
test.beforeAll(async ({ runner, page, welcomePage }) => {
  runner.setVideoAndTraceName('crc-e2e');
  await welcomePage.handleWelcomePage(true);
  extensionCard = new ExtensionCardPage(page, extensionLabelNameCrc, extensionLabelCrc);
  resourcesPage = new ResourceConnectionCardPage(page, 'crc');
  preferencesPage = new PreferencesPage(page);
});

test.afterAll(async ({ runner, page }) => {
  try {
    await deletePod(page, deployedPodName1);
    await deletePod(page, deployedPodName2);
    await deleteContainer(page, containerName1);
    await deleteContainer(page, containerName2);
    await deleteImage(page, imageName1);
    await deleteImage(page, imageName2);
  } finally {
    await runner.close();
    console.log('Runner closed');
  }
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

    test.fail('Extension can be disabled -- Settings/Preferences navbar value should be removed after extension removal, but isn\'t, BUG #393', async () => {
      //checking settings/preferences assets
      const preferencesTab = await preferencesPage.getTab();
      await preferencesTab.click();
      await playExpect(preferencesPage.content.getByText('Extension: Red Hat OpenShift Local')).not.toBeVisible(); //this step will fail
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
      const settingsBar = await navigationBar.openSettings();
      await playExpect(resourcesPage.card).toBeVisible();
      //checking settings/preferences assets
      const preferencesTab = await preferencesPage.getTab();
      await preferencesTab.click();
      await playExpect(settingsBar.getSettingsNavBarTabLocator('Extension: Red Hat OpenShift Local')).toBeVisible();
      await playExpect(preferencesPage.getPage().getByRole('region', {name: 'Content'}).getByText('Extension: Red Hat OpenShift Local')).toBeVisible();
    }); 
  });

  test.describe.serial('Deploy a container to a CRC cluster by pushing the image from Podman Desktop', () => {
    test('Pull image 1 and start the container', async ({ navigationBar }) => {
      const imagesPage = await navigationBar.openImages();
      await playExpect(imagesPage.heading).toBeVisible();
      
      const pullImagePage = await imagesPage.openPullImage();
      const updatedImages = await pullImagePage.pullImage(imageName1);
      
      const exists = await updatedImages.waitForImageExists(imageName1);
      playExpect(exists, `${imageName1} image not present in the list of images`).toBeTruthy();
      playExpect(await updatedImages.getCurrentStatusOfImage(imageName1)).toBe('UNUSED');

      const containersPage = await imagesPage.startContainerWithImage(
        imageName1,
        containerName1,
        containerStartParams,
      );
      await playExpect.poll(async () => containersPage.containerExists(containerName1)).toBeTruthy();
      const containerDetails = await containersPage.openContainersDetails(containerName1);
      await playExpect(containerDetails.heading).toBeVisible();
      await playExpect.poll(async () => containerDetails.getState()).toBe(ContainerState.Running);
    });

    test.fail('Push the image to the cluster', async ({ navigationBar, statusBar, page }) => {
      const imagesPage = await navigationBar.openImages();
      const pulledImage = await imagesPage.getImageRowByName(imageName1);
      if (pulledImage === undefined) {
        throw Error(`Image: '${name}' does not exist`);
      }
      const kebabMenuButton = pulledImage.getByRole('button', { name: 'kebab menu' });
      await playExpect(kebabMenuButton).toBeVisible();
      kebabMenuButton.click();
      //This step will fail => [BUG] option to push the image to OpenShift not shown #372
      const pushToClusterButton = imagesPage.getPage().getByTitle('Drop Down Menu Items').getByTitle('Push image to OpenShift Local cluster');
      await playExpect(pushToClusterButton).toBeVisible();
      //This step will fail => [BUG] Can't push images to OpenShift Local clusters (ssh key name issue) #495
      await pushToClusterButton.click();
      statusBar.tasksButton.click();
      const tasksManager = page.getByTitle("Tasks manager")
      await playExpect(tasksManager.getByTitle("/^Image ${imageName1} was successfully pushed to the OpenShift Local cluster /")).toBeVisible(); //not the actual message; locally this appears only if the crc cluster is started
    });

    test.skip('Deploy the container to the crc cluster -- previous step expected to fail', async ({ page, navigationBar }) => {
      await navigationBar.openContainers();
      const containerDetailsPage = new ContainerDetailsPage(page, containerName1);
      await playExpect(containerDetailsPage.heading).toBeVisible();
      const deployToKubernetesPage = await containerDetailsPage.openDeployToKubernetesPage();
      await deployToKubernetesPage.deployPod(deployedPodName1, { useKubernetesServices: true, isOpenShiftCluster: true, useOpenShiftRoutes: true }, kubernetesContext);
    
      const podsPage = await navigationBar.openPods();
      await playExpect.poll(async () => podsPage.deployedPodExists(deployedPodName1, 'kubernetes')).toBeTruthy();
    });

  });

  test.describe.serial('Deploy a container to a CRC cluster by pulling the image directly from the cluster', () => {
    test('Pull image 2 and start a container', async ({ navigationBar }) => {
      const imagesPage = await navigationBar.openImages();
      await playExpect(imagesPage.heading).toBeVisible();
      
      const pullImagePage = await imagesPage.openPullImage();
      const updatedImages = await pullImagePage.pullImage(imageName2);
      
      const exists = await updatedImages.waitForImageExists(imageName2);
      playExpect(exists, `${imageName2} image not present in the list of images`).toBeTruthy();
      playExpect(await updatedImages.getCurrentStatusOfImage(imageName2)).toBe('UNUSED');

      const containersPage = await imagesPage.startContainerWithImage(
        imageName2,
        containerName2,
        containerStartParams,
      );
      await playExpect.poll(async () => containersPage.containerExists(containerName2)).toBeTruthy();
      const containerDetails = await containersPage.openContainersDetails(containerName2);
      await playExpect(containerDetails.heading).toBeVisible();
      await playExpect.poll(async () => containerDetails.getState()).toBe(ContainerState.Running);
    });

    test('Deploy the container to the crc cluster', async ({ page, navigationBar }) => {
      const containerDetailsPage = new ContainerDetailsPage(page, containerName2);
      await playExpect(containerDetailsPage.heading).toBeVisible();
      const deployToKubernetesPage = await containerDetailsPage.openDeployToKubernetesPage();
      await deployToKubernetesPage.deployPod(deployedPodName2, { useKubernetesServices: true, isOpenShiftCluster: true, useOpenShiftRoutes: true  }, kubernetesContext);
      
      const podsPage = await navigationBar.openPods();
      await playExpect.poll(async () => podsPage.deployedPodExists(deployedPodName2, 'kubernetes')).toBeTruthy();
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
