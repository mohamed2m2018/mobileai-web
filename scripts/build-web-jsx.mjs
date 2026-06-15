// build-web-jsx.mjs
//
// Transforms the authored web UI source (`module/web/**/*.jsx`) into the shipped
// ESM (`module/web/**/*.js`, same path with the extension swapped). JSX is lowered
// to the automatic `react/jsx-runtime` runtime, so the emitted `.js` matches the
// original hand-written compiled form.
//
// This is the npm-consumer artifact (the `module/` ESM). The CDN/<script> bundle
// is produced afterwards by build-cdn.mjs, which bundles module/web/cdn-entry.js.

import * as esbuild from 'esbuild';
import { glob } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('module/web');

// Collect every .jsx under module/web (recursively).
const entryPoints = [];
for await (const file of glob('module/web/**/*.jsx')) {
  entryPoints.push(file);
}
entryPoints.sort();

if (entryPoints.length === 0) {
  console.warn('build:web — no .jsx files found under module/web');
  process.exit(0);
}

await esbuild.build({
  entryPoints,
  outdir: 'module/web',
  outbase: 'module/web',
  bundle: false,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: false,
  logLevel: 'info',
});

console.log(`build:web — transformed ${entryPoints.length} .jsx file(s) -> .js`);
