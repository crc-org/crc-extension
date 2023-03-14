# CRC extension

This repo copied from [podman-desktop crc extension](https://github.com/containers/podman-desktop/tree/main/extensions/crc)


# Run and build

To prepare dev environment, use:

```shell
yarn desk:prepare
```
This command check/clone podman-desktop, delete existing crc extension, make links, build podman-desktop without builtin crc extension. 


To launch podman-desktop with this crc extension use:

```shell
yarn desk:run
```

Note: this copies the unpackaged content of the extension in `.local/share/containers/podman-desktop/plugins/crc.cdix/`.


To rebuild podman-desktop and crc extension run:

```shell
  yarn desk:build
```
