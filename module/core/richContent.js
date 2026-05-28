"use strict";

function makeTextNode(content, id) {
  return {
    type: 'text',
    content,
    id
  };
}
function decodeLooseStringValue(value) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16))).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\(["'\\])/g, '$1');
}
function pushLooseTextNodes(input, nodes, seen) {
  const valuePattern = `(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')`;
  const patterns = [new RegExp(`\\{[\\s\\S]*?["']type["']\\s*:\\s*["']text["'][\\s\\S]*?["']content["']\\s*:\\s*${valuePattern}[\\s\\S]*?\\}`, 'g'), new RegExp(`\\{[\\s\\S]*?["']content["']\\s*:\\s*${valuePattern}[\\s\\S]*?["']type["']\\s*:\\s*["']text["'][\\s\\S]*?\\}`, 'g')];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const content = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
      const decoded = decodeLooseStringValue(content);
      if (!seen.has(decoded)) {
        seen.add(decoded);
        nodes.push(makeTextNode(decoded, `text-${nodes.length}`));
      }
    }
  });
}
function tryParseLooseRichContentString(candidate) {
  if (!/["'](?:type|content|reply)["']\s*:/.test(candidate)) {
    return null;
  }
  const nodes = [];
  const seen = new Set();
  pushLooseTextNodes(candidate, nodes, seen);
  return nodes.length > 0 ? nodes : null;
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
      if (typeof parsed.type === 'string') return [parsed];
      if (Array.isArray(parsed.content)) return parsed.content;
      if (Array.isArray(parsed.reply)) return parsed.reply;
    }
  } catch {
    return tryParseLooseRichContentString(candidate);
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
  if (input && typeof input === 'object') {
    const normalized = normalizeRichContent([input], fallbackText);
    if (normalized.length > 0) {
      return normalized;
    }
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
    message: previewText || result.message
  };
}
//# sourceMappingURL=richContent.js.map
