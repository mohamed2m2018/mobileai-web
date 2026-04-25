"use strict";

import React from 'react';
import { normalizeRichContent } from "../../core/richContent.js";
import { useBlockRegistry, useRichUITheme } from "../../components/rich-content/RichUIContext.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function renderInlineMarkdown(text, keyPrefix = 'md') {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${parts.length}`;
    if (token.startsWith('`')) {
      parts.push(/*#__PURE__*/_jsx("code", {
        style: {
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '0.92em'
        },
        children: token.slice(1, -1)
      }, key));
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(/*#__PURE__*/_jsx("strong", {
        style: {
          fontWeight: 800
        },
        children: token.slice(2, -2)
      }, key));
    } else {
      parts.push(/*#__PURE__*/_jsx("em", {
        style: {
          fontStyle: 'italic'
        },
        children: token.slice(1, -1)
      }, key));
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
function MarkdownText({
  text,
  style
}) {
  const lines = text.split(/\r?\n/);
  return /*#__PURE__*/_jsx("div", {
    style,
    children: lines.map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return /*#__PURE__*/_jsx("div", {
          style: {
            height: 10
          }
        }, `blank-${index}`);
      }
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        return /*#__PURE__*/_jsxs("div", {
          style: {
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start'
          },
          children: [/*#__PURE__*/_jsx("span", {
            "aria-hidden": "true",
            style: {
              flex: '0 0 auto',
              lineHeight: 'inherit'
            },
            children: "\u2022"
          }), /*#__PURE__*/_jsx("span", {
            children: renderInlineMarkdown(bulletMatch[1], `line-${index}`)
          })]
        }, `line-${index}`);
      }
      return /*#__PURE__*/_jsx("div", {
        children: renderInlineMarkdown(line, `line-${index}`)
      }, `line-${index}`);
    })
  });
}
export function RichContentRendererWeb({
  content,
  surface,
  isUser = false,
  textStyle
}) {
  const theme = useRichUITheme(surface === 'support' ? 'support' : surface);
  const registry = useBlockRegistry();
  const nodes = normalizeRichContent(content);
  return /*#__PURE__*/_jsx("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.sm
    },
    children: nodes.map((node, index) => {
      if (node.type === 'text') {
        return /*#__PURE__*/_jsx(MarkdownText, {
          style: {
            fontSize: 15,
            lineHeight: 1.55,
            color: isUser || surface === 'chat' || surface === 'support' ? theme.colors.inverseText : theme.colors.primaryText,
            whiteSpace: 'normal',
            ...textStyle
          },
          text: node.content
        }, node.id || `text-${index}`);
      }
      const definition = registry.get(node.blockType);
      if (!definition) return null;
      const BlockComponent = definition.component;
      return /*#__PURE__*/_jsx("div", {
        style: {
          borderRadius: theme.shape.cardRadius,
          overflow: 'hidden',
          border: surface === 'chat' || surface === 'support' ? `1px solid ${theme.colors.subtleBorder}` : undefined,
          background: surface === 'chat' || surface === 'support' ? theme.colors.richMessageContainer : undefined
        },
        children: /*#__PURE__*/_jsx(BlockComponent, {
          ...node.props
        })
      }, node.id || `block-${index}`);
    })
  });
}
//# sourceMappingURL=RichContentRendererWeb.js.map
