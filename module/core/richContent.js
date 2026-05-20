"use strict";

function makeTextNode(content, id) {
  return {
    type: 'text',
    content,
    id
  };
}
function tryParseRichContentString(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidate = trimmed.startsWith('```') ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '') : trimmed;
  if (!candidate.startsWith('[') && !candidate.startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.content)) return parsed.content;
      if (Array.isArray(parsed.reply)) return parsed.reply;
    }
  } catch {
    return null;
  }
  return null;
}
export function createTextContent(content, id) {
  return [makeTextNode(content, id)];
}
export function normalizeRichContent(input, fallbackText = '') {
  if (Array.isArray(input)) {
    const normalizedNodes = input.map((node, index) => {
      if (!node) return null;
      if (node.type === 'text') {
        return makeTextNode(typeof node.content === 'string' ? node.content : '', node.id || `text-${index}`);
      }
      if (node.type === 'block' && typeof node.blockType === 'string') {
        return {
          type: 'block',
          blockType: node.blockType,
          props: node.props && typeof node.props === 'object' ? node.props : {},
          id: node.id || `block-${index}`,
          placement: node.placement,
          lifecycle: node.lifecycle
        };
      }
      return null;
    });
    return normalizedNodes.filter(node => node !== null);
  }
  if (typeof input === 'string') {
    const parsed = tryParseRichContentString(input);
    if (parsed) {
      const normalized = normalizeRichContent(parsed, fallbackText);
      if (normalized.length > 0) {
        return normalized;
      }
    }
    return createTextContent(input);
  }
  return createTextContent(fallbackText);
}
export function richContentToPlainText(input, fallbackText = '') {
  const content = normalizeRichContent(input, fallbackText);
  const parts = content.flatMap(node => {
    if (node.type === 'text') {
      return node.content.trim() ? [node.content.trim()] : [];
    }
    const props = node.props || {};
    const textBits = [typeof props.title === 'string' ? props.title : '', typeof props.subtitle === 'string' ? props.subtitle : '', typeof props.description === 'string' ? props.description : '', typeof props.body === 'string' ? props.body : '', typeof props.headline === 'string' ? props.headline : ''].filter(Boolean);
    return textBits;
  });
  return parts.join('\n').trim() || fallbackText;
}
export function createAIMessage(params) {
  const content = normalizeRichContent(params.content);
  return {
    id: params.id,
    role: params.role,
    content,
    previewText: params.previewText || richContentToPlainText(content),
    timestamp: params.timestamp,
    result: params.result,
    promptKind: params.promptKind
  };
}
export function normalizeExecutionResult(result) {
  const reply = normalizeRichContent(result.reply || result.message, result.message);
  const previewText = result.previewText || richContentToPlainText(reply, result.message);
  return {
    ...result,
    reply,
    previewText,
    message: result.message || previewText
  };
}
//# sourceMappingURL=richContent.js.map
