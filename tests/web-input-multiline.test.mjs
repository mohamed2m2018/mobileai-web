import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const webAgentSource = fs.readFileSync(
  new URL('../module/web/components/AIAgent.js', import.meta.url),
  'utf8'
);

test('web chat composers use textarea so Shift+Enter can insert new lines', () => {
  // The web UI is authored as .jsx and compiled to ESM by esbuild, so jsx-runtime
  // calls render as `jsx("textarea", …)` (no `_` alias) and may be split across
  // lines for long calls — match either spelling/layout. String literals likewise
  // print with double quotes. These assertions check behavior intent, not the
  // exact compiled spelling.
  const textareaCount = (webAgentSource.match(/jsx\(\s*["']textarea["']/g) || []).length;

  assert.equal(textareaCount >= 2, true);
  assert.match(webAgentSource, /if \(event\.key !== ["']Enter["'] \|\| event\.shiftKey\) return;/);
  assert.match(webAgentSource, /resize:\s*["']none["']/);
  assert.match(webAgentSource, /overflowY:\s*["']auto["']/);
});
