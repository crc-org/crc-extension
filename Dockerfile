#
# Copyright (C) 2023 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

FROM registry.access.redhat.com/ubi9/nodejs-18:latest AS builder

COPY . .

RUN npm install -g yarn \
    && npx yarn install \
    && npx yarn build

RUN mkdir /tmp/extension \
    && cp /opt/app-root/src/package.json \
          /opt/app-root/src/LICENSE      \
          /opt/app-root/src/README.md    \
          /opt/app-root/src/icon.png   /tmp/extension \
    && cp -r /opt/app-root/src/dist    /tmp/extension/dist


FROM scratch

LABEL org.opencontainers.image.title="Red Hat OpenShift Local" \
      org.opencontainers.image.description="Integration for Red Hat OpenShift Local clusters" \
      org.opencontainers.image.vendor="redhat" \
      io.podman-desktop.api.version=">= 0.16.0"

COPY --from=builder /tmp/extension/ /extension
