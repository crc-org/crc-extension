# Red Hat OpenShift Local extension

Integration for [Red Hat OpenShift Local][product page] clusters. It will help you install and set up the environment, and allows you to control the lifecycle and configuration from [Podman Desktop][podman-desktop]. Some of the features available in the extension include:
  * Start/Stop/Restart/Delete OpenShift Local clusters
  * Change the OpenShift Local cluster preset
  * Update the OpenShift Local version

## Index
- [Installation](#installation)
  - [Requirements](#requirements)
  - [Extension installation](#extension-installation)
  - [OpenShift Local installation](#openshift-local-installation)
- [Usage](#usage)
- [Deployment to OpenShift Local](#deployment-to-openshift-local)
- [Limitations](#limitations)
  - [Usage with HyperV/Elevated mode](#usage-with-hypervelevated-mode)

## Installation

### Requirements

You need to have a working [Podman Desktop][podman-desktop] installation.
Each preset of OpenShift Local has their own requirements, please check the [documentation][documentation page] for more information.


#### Preset types
  * **Microshift (experimental)**  
    Provides a lightweight and optimized environment with a limited set of services.
  * **OpenShift**  
    Provides a single node OpenShift cluster with a fuller set of services, including a web console (requires more resources).


#### Pull-secret
To pull container images from the registry, a pull secret is necessary. You can get a pull secret by navigating to the dashboard and clicking the **Obtain pull-secret** or opening the [Red Hat OpenShift Local download page][download page] in your browser.

### Extension installation

1. Open Podman Desktop.
2. Go to the **Extensions** page:
   ![Extension's navbar button](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/16-crc-ext-extensions.png)
3. Now you have two options:
    1. Switch to the **Catalog** tab and click on the `Install` icon in the `Red Hat OpenShift Local` extension item:
   ![Install extension from catalog](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/17-crc-ext-install.png)
    2. Or click on the `Install custom...` button on the upper right corner, enter `ghcr.io/crc-org/crc-extension` in the `OCI Image` field, and click on `Install`:

        ![Install extension from OCI image](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/1-install-custom-image.png)

        This second approach is useful to get older versions or development releases.

### OpenShift Local installation
If you don't have OpenShift Local installed in your system already, Podman Desktop can handle it for you. 

Go to the `Dashboard` page, and in the `OpenShift Local` section you will find the `NOT-INSTALLED` label. Click on the `Install` button:

![Install OpenShift Local button](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/6-crc-not-installed.png)

A dialog will appear, click on the `Yes` button:

![Install OpenShift Local dialog](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/7-crc-install-dialog-pd.png)

Follow the OpenShift Local installation wizard, picking the options that suit your needs:

![Install OpenShift Local wizard dialog](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/8-crc-install-dialog-installer.png)

You can check the progress on the download of the binaries on the bottom of the interface:

![OpenShift Local download progress bar](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/9-crc-getting-downloaded-on-pd.png)

## Usage

Once installed, you can configure the default `Preset` parameter used to create the OpenShift Local Cluster in the extension's **Settings** page:

![Preset option on Settings/Preferences page](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/2-preferences-preset.png)

To create a new OpenShift Local cluster, you have three options:
1.  Switch to the **Resources** tab on the **Settings** page and press the `Create new ...` button:

    !['Create new...' option on Settings/Resources](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/2-crc-ext-create-new-resource.png)

    Then, in the newly opened dialog, configure the cluster to your needs and click on the `Create` button:
    ![Cluster configuration dialog](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/3-create-new-cluster-dialog.png)

2. From the **Dashboard**, in the `OpenShift Local` section, click on the `Initialize and start` button:

    !['Initialize and Start' option on the Dashboard page](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/4-initialize-and-start.png)

3. From the **Dashboard**, in the `OpenShift Local` section, click on the dropdown button next to `Initialize and start` and select `Initialize OpenShift Local`:

    !['Initialize' option on the Dashboard page part 1](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/5-initialize-without-start-1.png)

    And then click on the `Initialize` button:
    !['Initialize' option on the Dashboard page part 2](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local-davillan/readme-images/5-initialize-without-start-2.png)

When a new cluster has been created there should be a new connection visible in the **Resources** page, under the **OpenShift Local** section:

![New connection in Settings/Resources](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/3-crc-ext-connection.png)

## Deployment to OpenShift Local

To deploy your first application to OpenShift Local, pull the `httpd-24` image from the public Red Hat image registry using the **Pull an Image** page. To do so, open the **Images** page using the activity bar and press `Pull` button in upper right corner:

![Opening the Images page](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/5-crc-ext-open-pull-page.png)

Paste `registry.access.redhat.com/ubi8/httpd-24` into the `Image to pull` field and press the `Pull Image` button:

![Pulling an image dialog](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/6-crc-ext-pull-image-form.png)

After the image was sucessfully pulled from the registry press the `Done` button to navigate back to the **Images** page:

![Image successfully pulled](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/7-crc-ext-pull-image-result.png)

Request the context menu for the `httpd-24` image you just pulled by clicking on the right most button in the row. Then select the `Push image to OpenShift Local cluster`* menu item:

![Pushing an image to the OpenShift Local cluster option](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/8-crc-ext-push-image-to-cluster.png)

*Note: if the option does not appear on the context menu, try to restart Podman Desktop with `Exit On Close` preference enabled (this is a known issue).

The progress for the `Push` command is available in the Podman Desktop **Tasks** View:

![Image pushing progress on Tasks view](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/9-crc-ext-push-image-progress.png)

When the `Push` command is done, the image is ready to be deployed to the OpenShift Local cluster. First start a local container from the image using the `Run` button:

![Button to deploy an image to the OpenShift Local cluster](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/10-crc-ext-run-container-button.png)

On the **Run Image** form leave the default values and press `Start Container` button:

![Start Container button](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/11-crc-ext-run-container-form.png)

After the local container is up and running, it can be deployed to OpenShift Local cluster using the `Deploy to Kubernetes` button in the upper right corner
of **Container Details** page:

![Button to open Deploy to Kubernetes dialog](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/12-crc-ext-open-deploy-to-kube-form.png)

On the **Deploy to Kubernetes** form make sure the `Kubernetes Context` field is `crc-admin` and press the `Deploy` button:

![Deploy to Kubernetes button](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/13-crc-ext-deploy-to-kube-form.png)

The bottom part of the page shows the status of deployment. When **Container statuses** contains `Ready (Running)` it means the `httpd` server is running in the
OpenShift Local cluster. There is also a link to open the OpenShift Developer Console where you can manage your local cluster:

![Result of successful deployment](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/14-crc-ext-deploy-to-kube-form-result.png)

Clicking on the link below **Container statuses** opens the `httpd` server index page:

![HTTPD server index page](https://raw.githubusercontent.com/containers/podman-desktop-media/openshift-local/readme/15-crc-ext-browser-view.png)

You have deployed your application to OpenShift!

## Limitations

### Usage with HyperV/Elevated mode
Currently it's not possible to use the extension if you are running Podman Desktop in elevated mode, as OpenShift Local forbids that.

So if you happen to run Podman Desktop in elevated mode in order to have a HyperV Podman machine (or for any other reason), you won't be able to create OpenShift Local clusters through the extension.

Follow updates on this topic in [this GitHub issue](https://github.com/crc-org/crc-extension/issues/569).

[product page]: https://developers.redhat.com/products/openshift-local/overview
[download page]: https://cloud.redhat.com/openshift/create/local
[documentation page]: https://cloud.redhat.com/openshift/local/documentation
[podman-desktop]: https://podman-desktop.io/
