# CRC extension

This repo copied from [podman-desktop crc extension](https://github.com/containers/podman-desktop/tree/main/extensions/crc)

# Run and build

To build this extension use:

```shell
  yarn desk:build
```

>Note: all command will check that parent directory contains [podman-desktop](https://github.com/containers/podman-desktop) repo, and if its doesn't, it will clone it.

If you want to prepare dev environment, use:

```shell
yarn desk:prepare
```
This command check/clone podman-desktop and replace existing crc extension with this one.

To launch podman-desktop with this crc extension use:

```shell
yarn desk:run
```

>Note: If you do any modification of code inside this repo, you need to rerun any command described above to copy your changes in to podman-desktop repo. Automatic update not implemented yet.
