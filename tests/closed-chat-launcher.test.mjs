import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const webAgentSource = fs.readFileSync(
  new URL('../module/web/components/AIAgent.js', import.meta.url),
  'utf8'
);
const agentChatBarSource = fs.readFileSync(
  new URL('../module/components/AgentChatBar.js', import.meta.url),
  'utf8'
);

test('DOM web closed launcher tracks local AI unread and clears it when opened', () => {
  assert.match(webAgentSource, /const \[localUnread, setLocalUnread\] = useState\(0\)/);
  assert.match(webAgentSource, /messages\.slice\(seenCount\)\.filter\(message => message\.role !== 'user'\)/);
  assert.match(webAgentSource, /const displayUnread = totalUnread \+ localUnread/);
  assert.match(webAgentSource, /if \(isOpen && localUnread > 0\)/);
  assert.match(webAgentSource, /setLocalUnread\(0\);\n\s+setIsOpen\(true\)/);
});

test('DOM web closed launcher renders edge-aware preview and badge on the circle', () => {
  assert.match(webAgentSource, /const latestClosedPreview = useMemo/);
  assert.match(webAgentSource, /const closedPreviewPlacement = useMemo/);
  assert.match(webAgentSource, /localUnread > 0 && messages\.length > 0/);
  assert.match(webAgentSource, /bottom: WEB_LAUNCHER_SIZE \+ 10/);
  assert.match(webAgentSource, /children: latestClosedPreview/);
  assert.match(webAgentSource, /displayUnread > 0 \? \/\*#__PURE__\*\/_jsx\("div"/);
  assert.match(webAgentSource, /border: '2px solid #fff'/);
});

test('React Native style web AgentChatBar keeps badge on FAB and avoids fixed popup offsets', () => {
  assert.doesNotMatch(agentChatBarSource, /left:\s*-70/);
  assert.doesNotMatch(agentChatBarSource, /popupBadgeOverride/);
  assert.match(agentChatBarSource, /const popupSideStyle = tooltipSide === 'right' \? styles\.popupFromLeft : styles\.popupFromRight/);
  assert.match(agentChatBarSource, /displayUnread > 0 && \/\*#__PURE__\*\/_jsx\(View/);
  assert.match(agentChatBarSource, /fabUnreadBadge: \{[\s\S]*borderColor: '#fff'/);
  assert.match(agentChatBarSource, /setLocalUnread\(0\);\n\s+setIsExpanded\(true\)/);
});
