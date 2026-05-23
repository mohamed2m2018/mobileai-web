import test from 'node:test';
import assert from 'node:assert/strict';

test('@mobileai/web root exports stay browser-safe', async () => {
  const mod = await import('../index.mjs');

  assert.equal(typeof mod.AIAgent, 'function');
  assert.equal(typeof mod.AIAgentWeb, 'function');
  assert.equal(mod.AIAgent, mod.AIAgentWeb);
  assert.equal(typeof mod.VoiceService, 'function');
  assert.equal(typeof mod.CSATSurvey, 'function');
  assert.equal(typeof mod.buildSupportPrompt, 'function');
  assert.equal(typeof mod.createEscalateTool, 'function');
  assert.equal(typeof mod.createReportIssueTool, 'function');
  assert.equal(typeof mod.EscalationSocket, 'function');
  assert.equal('ReactNativePlatformAdapter' in mod, false);
  assert.equal('AIZone' in mod, false);
});
