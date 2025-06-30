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

import type { ContainerInteractiveParams } from '@podman-desktop/tests-playwright';
import { expect as playExpect, RunnerOptions, test, ContainerState, ContainerDetailsPage, deleteContainer, deleteImage, isWindows, waitForPodmanMachineStartup, KubernetesResources, deleteKubernetesResource } from '@podman-desktop/tests-playwright';

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
test.beforeAll(async ({ runner, welcomePage, page }) => {
  test.setTimeout(360_000);
  runner.setVideoAndTraceName('crc-cluster-deployment-e2e');
  await welcomePage.handleWelcomePage(true);
  await waitForPodmanMachineStartup(page);
});

test.afterAll(async ({ navigationBar, runner, page }) => {
  test.setTimeout(180_000);
  try {
    
    const kubernetesPage = await navigationBar.openKubernetes();
    await kubernetesPage.openTabPage(KubernetesResources.Pods);
    // pod 1 should be deleted too once the first test case is not skipped
    await deleteKubernetesResource(page, KubernetesResources.Pods, deployedPodName2, 60_000);

    await navigationBar.openContainers();
    await deleteContainer(page, containerName1);
    await deleteContainer(page, containerName2);
    
    await navigationBar.openImages();
    await deleteImage(page, imageName1);
    await deleteImage(page, imageName2);
  } finally {
    await runner.close();
    console.log('Runner closed');
  }
});

test.describe.serial('Deployment to OpenShift Local cluster', () => {
  
  test.describe.serial('Deploy a container to a CRC cluster by pushing the image from Podman Desktop', () => {
    test.skip(!!process.env.AZURE_RUNNER === false || !isWindows, 'This test should only run on a Windows Azure machine');
    
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
      await kebabMenuButton.click();
      //This step will fail => [BUG] option to push the image to OpenShift not shown #372
      const pushToClusterButton = imagesPage.getPage().getByTitle('Drop Down Menu Items').getByTitle('Push image to OpenShift Local cluster');
      await playExpect(pushToClusterButton).toBeVisible();
      await pushToClusterButton.click();
      await statusBar.tasksButton.click();
      const tasksManager = page.getByTitle('Tasks manager');
      await playExpect(tasksManager.getByTitle('/^Image ${imageName1} was successfully pushed to the OpenShift Local cluster /')).toBeVisible(); //not the actual message; locally this appears only if the crc cluster is started
    });

    test.skip('Deploy the container to the crc cluster -- previous step expected to fail', async ({ page, navigationBar }) => {
      await navigationBar.openContainers();
      const containerDetailsPage = new ContainerDetailsPage(page, containerName1);
      await playExpect(containerDetailsPage.heading).toBeVisible();
      const deployToKubernetesPage = await containerDetailsPage.openDeployToKubernetesPage();
      await deployToKubernetesPage.deployPod(deployedPodName1, { useKubernetesServices: true, isOpenShiftCluster: true, useOpenShiftRoutes: true }, kubernetesContext);
    
      const kubernetesPage = await navigationBar.openKubernetes();
      const kubernetesPodsPage = await kubernetesPage.openTabPage(KubernetesResources.Pods);
      const deployedPod = await kubernetesPodsPage.fetchKubernetesResource(deployedPodName2, 20_000);
      await playExpect.poll(async () => deployedPod.isVisible()).toBeTruthy();
    });

  });

  test.describe.serial('Deploy a container to a CRC cluster by pulling the image directly from the cluster', () => {
    test.skip(!!process.env.AZURE_RUNNER === false || !isWindows, 'This test should only run on a Windows Azure machine');
    
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
      test.setTimeout(180_000);
      const containerDetailsPage = new ContainerDetailsPage(page, containerName2);
      await playExpect(containerDetailsPage.heading).toBeVisible();
      const deployToKubernetesPage = await containerDetailsPage.openDeployToKubernetesPage();
      await deployToKubernetesPage.deployPod(deployedPodName2, { useKubernetesServices: true, isOpenShiftCluster: true, useOpenShiftRoutes: true  }, kubernetesContext);
      
      const kubernetesPage = await navigationBar.openKubernetes();
      const kubernetesPodsPage = await kubernetesPage.openTabPage(KubernetesResources.Pods);
      const deployedPod = await kubernetesPodsPage.fetchKubernetesResource(deployedPodName2, 20_000);
      await playExpect.poll(async () => deployedPod.isVisible()).toBeTruthy();
    });
  });

});