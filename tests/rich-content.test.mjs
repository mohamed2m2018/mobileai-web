import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeExecutionResult,
  normalizeRichContent,
  richContentToPlainText,
} from '../module/core/richContent.js';

test('normalizes JSON string rich text arrays', () => {
  const nodes = normalizeRichContent('[{"type":"text","content":"Pricing is available."}]');

  assert.deepEqual(nodes, [
    {
      type: 'text',
      content: 'Pricing is available.',
      id: 'text-0',
    },
  ]);
});

test('normalizes loose single-quoted rich text arrays', () => {
  const nodes = normalizeRichContent("[{'type':'text','content':'Of course! Here are the pricing plans.'}]");

  assert.deepEqual(nodes, [
    {
      type: 'text',
      content: 'Of course! Here are the pricing plans.',
      id: 'text-0',
    },
  ]);
});

test('execution results do not expose raw rich content strings as chat text', () => {
  const result = normalizeExecutionResult({
    success: true,
    message: "[{'type':'text','content':'Of course! Here are the pricing plans.'}]",
  });

  assert.equal(result.reply[0].content, 'Of course! Here are the pricing plans.');
  assert.equal(result.previewText, 'Of course! Here are the pricing plans.');
  assert.equal(result.message, 'Of course! Here are the pricing plans.');
});

test('plain text extraction handles parsed rich content strings', () => {
  const text = richContentToPlainText('[{"type":"text","content":"No raw array here."}]');

  assert.equal(text, 'No raw array here.');
});
