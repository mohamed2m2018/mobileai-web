import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('chat bubbles force long unbroken tokens to wrap inside the box', () => {
  const nativeChat = read('../module/components/AgentChatBar.js');
  const nativeRichText = read('../module/components/rich-content/RichContentRenderer.js');
  const webChat = read('../module/web/components/AIAgent.js');
  const webRichText = read('../module/web/components/RichContentRendererWeb.js');

  assert.match(nativeChat, /messageBubble:\s*\{[\s\S]*?overflow:\s*'hidden'/);
  assert.match(nativeChat, /messageText:\s*\{[\s\S]*?overflowWrap:\s*'anywhere'/);
  assert.match(nativeRichText, /text:\s*\{[\s\S]*?overflowWrap:\s*'anywhere'/);
  assert.match(webChat, /mobileai-web-chat-bubble \*[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(webRichText, /overflowWrap:\s*'anywhere'/);
  assert.match(webRichText, /wordBreak:\s*'break-word'/);
});

test('inline markdown does not eat underscores inside API keys', () => {
  const nativeRichText = read('../module/components/rich-content/RichContentRenderer.js');
  const webRichText = read('../module/web/components/RichContentRendererWeb.js');

  assert.doesNotMatch(nativeRichText, /\|_\[\^_\\n\]\+_\)/);
  assert.doesNotMatch(webRichText, /\|_\[\^_\\n\]\+_\)/);
});
