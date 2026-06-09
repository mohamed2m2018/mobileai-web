import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('loading state uses a separate stop button instead of replacing send', () => {
  const nativeChat = read('../module/components/AgentChatBar.js');
  const webChat = read('../module/web/components/AIAgent.js');

  assert.match(nativeChat, /accessibilityLabel:\s*"Stop AI Agent request"/);
  assert.match(nativeChat, /accessibilityLabel:\s*"Send request to AI Agent"/);
  assert.doesNotMatch(nativeChat, /children:\s*isThinking\s*\?\s*\/\*#__PURE__\*\/_jsx\(StopIcon/);

  assert.match(webChat, /"aria-label":\s*"Stop AI request"/);
  assert.match(webChat, /"aria-label":\s*"Send message"/);
  assert.doesNotMatch(webChat, /children:\s*isLoading\s*\?\s*\/\*#__PURE__\*\/_jsx\(WebStopIcon/);
});

test('composer stop keeps loading state until the active runtime settles', () => {
  const webChat = read('../module/web/components/AIAgent.js');
  const cancelBody = webChat.slice(webChat.indexOf('const cancel = useCallback'), webChat.indexOf('const enterVoiceMode'));

  assert.match(cancelBody, /runtime\.cancel\(\);/);
  assert.match(cancelBody, /setStatusText\('Stopping\.\.\.'\);/);
  assert.doesNotMatch(cancelBody, /setIsLoading\(false\);/);
});
