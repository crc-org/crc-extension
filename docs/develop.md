# Development instructions

## Run and build

To prepare dev environment, use:

```shell
pnpm desk:prepare
```
This command check/clone podman-desktop, delete existing crc extension, make links, build podman-desktop without builtin OpenShift local extension. 


To launch podman-desktop with this OpenShift Local extension use:

```shell
pnpm desk:run
```

Note: this copies the unpackaged content of the extension in `.local/share/containers/podman-desktop/plugins/openshift-local.cdix/`.


To rebuild podman-desktop and OpenShift Local extension run:

```shell
  pnpm desk:build
```
