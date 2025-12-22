#
# Copyright (C) 2024-2025 Red Hat, Inc.
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
FROM registry.access.redhat.com/ubi10/nodejs-22@sha256:5f2f6edd23f8e0a8e1f624a96244c27baef45b8f6117d160acab72b6a6828508

COPY package.json .
COPY pnpm-lock.yaml . 

RUN npm install -g pnpm

RUN pnpm install --frozen-lockfile
