/**********************************************************************
 * Copyright (C) 2023 Red Hat, Inc.
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

export type CrcStatus =
  | 'Running'
  | 'Starting'
  | 'Stopping'
  | 'Stopped'
  | 'No Cluster'
  | 'Error'
  | 'Unknown'
  | 'Need Setup';

export interface Status {
  readonly CrcStatus: CrcStatus;
  readonly Preset?: string;
  readonly OpenshiftStatus?: string;
  readonly OpenshiftVersion?: string;
  readonly PodmanVersion?: string;
  readonly DiskUse?: number;
  readonly DiskSize?: number;
}

export type Preset = 'openshift' | 'microshift' | 'podman';

export interface Configuration {
  preset: Preset;
  cpus: number;
  memory: number;
  'disk-size'?: number;
  'consent-telemetry'?: string;
  'http-proxy'?: string;
  'https-proxy'?: string;
  'no-proxy'?: string;
  'proxy-ca-file'?: string;
  'pull-secret-file'?: string;
  [key: string]: string | number;
}

export type ConfigKeys =
  | 'cpus'
  | 'memory'
  | 'disk-size'
  | 'consent-telemetry'
  | 'http-proxy'
  | 'https-proxy'
  | 'no-proxy'
  | 'proxy-ca-file'
  | 'pull-secret-file';

export interface ClusterConfig {
  ClusterType: string;
  ClusterCACert: string;
  KubeConfig: string;
  KubeAdminPass: string;
  ClusterAPI: string;
  WebConsoleURL: string;
  ProxyConfig: unknown;
}

export interface StartInfo {
  Status: CrcStatus;
  ClusterConfig: ClusterConfig;
  KubeletStarted: boolean;
}

export interface CrcReleaseInfo {
  version: {
    crcVersion: string;
    gitSha: string;
    openshiftVersion: string;
    podmanVersion: string;
  };

  links: {
    linux: string;
    darwin: string;
    windows: string;
  };
}

export interface CrcUpdateInfo {
  newVersion?: CrcReleaseInfo;
  currentVersion: string;
  hasUpdate: boolean;
}
