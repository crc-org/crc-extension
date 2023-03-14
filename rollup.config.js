// rollup.config.js
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: {
    'extension': 'src/extension.ts',
    'thread': 'node_modules/hasha/thread.js',
  } ,
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true,
  },
  external: [
    '@podman-desktop/api',
    'node:stream',
    'node:http',
    'node:url',
    'node:process',
    'node:tls',
    'node:util',
    'node:buffer',
    'node:https',
    'node:events',
    'node:net',
    'node:process',
    'node:path',
    'node:os',
    'node:fs',
    'node:child_process',
    'node:crypto',
    'node:worker_threads',
  ],
  plugins: [
    typescript(),
    commonjs({ extensions: ['.js', '.ts'] }), // the ".ts" extension is required],
    json(),
    nodeResolve({preferBuiltins: true}),
  ],
};
