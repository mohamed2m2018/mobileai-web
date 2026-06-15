// Builds the framework-agnostic CDN bundle: dist/twomilia.js
// Single self-contained IIFE exposing window.Twomilia.init — no host framework needed.
//
// Renderer is Preact: react/react-dom/jsx-runtime are aliased to preact/compat,
// and react-dom/client to a tiny createRoot adapter over preact's render.
// The web modules no longer import react-native, so there is no RN dependency.

import * as esbuild from 'esbuild';
import path from 'node:path';

const preactClient = path.resolve('scripts/preact-client.js');

const result = await esbuild.build({
  entryPoints: ['module/web/cdn-entry.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2019'],
  outfile: 'dist/twomilia.js',
  minify: true,
  sourcemap: true,
  legalComments: 'none',
  metafile: true,
  // @google/genai (~266 KB) is loaded on demand from a CDN only when voice is used.
  external: ['@google/genai', '@google/genai/web'],
  // Node globals some deps reference at runtime in the browser, plus the lazy
  // genai CDN URL (overridable by the host via globalThis.MOBILEAI_GENAI_URL).
  banner: { js: 'globalThis.process=globalThis.process||{env:{}};globalThis.global=globalThis.global||globalThis;globalThis.MOBILEAI_GENAI_URL=globalThis.MOBILEAI_GENAI_URL||"https://esm.sh/@google/genai@1.50.1/web";' },
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: {
    react: 'preact/compat',
    'react-dom': 'preact/compat',
    'react-dom/client': preactClient,
    'react/jsx-runtime': 'preact/jsx-runtime',
  },
});

const out = result.metafile.outputs['dist/twomilia.js'];
console.log(`built dist/twomilia.js — ${(out.bytes / 1024).toFixed(1)} KB minified`);
