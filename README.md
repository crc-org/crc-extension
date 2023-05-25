![](icon.png)

# Red Hat OpenShift Local extension

## About

Integration for [Red Hat OpenShift Local][product page] clusters. It will help you install and set up the environment. and allows you to control the lifecycle and configuration from [Podman Desktop][podman-desktop].

## Requirements

You are required to have a working [Podman Desktop][podman-desktop] installation.
Each preset of OpenShift Local has their own requirements, please check the [documentation][documentation page] for more information.


### Preset types
  * Microshift (experimental)  
    provides a lightweight and optimized environment with a limited set of services.
  * OpenShift  
    provides a single node OpenShift cluster with a fuller set of services, including a web console (requires more resources).


### Pull-secret
To pull container images from the registry, a pull secret is necessary. You can get a pull secret by navigating to the dashboard and clicking the "Obtain pull-secret" or opening the [Red Hat OpenShift Local download page][download page] in your browser.


## Installation

#### Prerequisites

* The extension is not already installed.

#### Procedure

1. Open Podman Desktop dashboard.
1. Go to the **Settings > Extensions > Install a new extension from OCI Image**.
1. **Name of the image**: Enter

   ```
   quay.io/redhat-developer/openshift-local-extension:latest
   ```

1. Click on the **Install extension from the OCI image** button.


## Features

  * Start/Stop/Delete OpenShift Local presets
  * Change the OpenShift Local preset
  * Change basic configuration


## Extension Settings

  * Memory, in MiB
  * CPUs, number of cores
  * Preset, Microshift or OpenShift
  * Disksize, in GiB
  * Pull secret file, pull secret for OpenShift


## Known limitation
Currently, we do not support the Podman preset of OpenShift Local. Please use preferences to change this:

Settings > Preferences > Red Hat OpenShift Local > Preset


[product page]: https://developers.redhat.com/products/openshift/local
[download page]: https://cloud.redhat.com/openshift/create/local
[documentation page]: https://cloud.redhat.com/openshift/local/documentation
[podman-desktop]: https://podman-desktop.io/
