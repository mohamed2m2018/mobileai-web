import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const webAgentSource = fs.readFileSync(
  new URL('../module/web/components/AIAgent.js', import.meta.url),
  'utf8'
);

test('web chat composers use textarea so Shift+Enter can insert new lines', () => {
  const textareaCount = (webAgentSource.match(/_jsx\("textarea"/g) || []).length;

  assert.equal(textareaCount >= 2, true);
  assert.match(webAgentSource, /if \(event\.key !== 'Enter' \|\| event\.shiftKey\) return;/);
  assert.match(webAgentSource, /resize:\s*'none'/);
  assert.match(webAgentSource, /overflowY:\s*'auto'/);
});
