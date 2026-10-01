#
# Copyright (C) 2023-2026 Red Hat, Inc.
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

# tag 10.1-1764649731
FROM registry.access.redhat.com/ubi10/nodejs-24@sha256:856e1f5d2269cae40a01a7b3489225f459562f6089cc71564116a2760149c3b0 AS builder

WORKDIR /opt/app-root/src

COPY --chown=1001:1001 . .

RUN npm i -g corepack@0.31.0 && corepack enable

RUN pnpm install \
  && pnpm build

FROM scratch

LABEL org.opencontainers.image.title="Red Hat OpenShift Local" \
  org.opencontainers.image.description="Integration for Red Hat OpenShift Local clusters" \
  org.opencontainers.image.vendor="redhat" \
  io.podman-desktop.api.version=">= 0.16.0"

COPY --from=builder /opt/app-root/src/package.json /extension/
COPY --from=builder /opt/app-root/src/LICENSE /extension/
COPY --from=builder /opt/app-root/src/icon.png /extension/
COPY --from=builder /opt/app-root/src/README.md /extension/
COPY --from=builder /opt/app-root/src/dist/ /extension/dist
