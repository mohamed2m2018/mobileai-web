"use strict";

import { Platform, StyleSheet, Text, View } from 'react-native';
import { normalizeRichContent } from "../../core/richContent.js";
import { useBlockRegistry, useRichUITheme } from "./RichUIContext.js";
import { jsx as _jsx } from "react/jsx-runtime";
function renderInlineMarkdown(text, keyPrefix = 'md') {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${parts.length}`;
    if (token.startsWith('`')) {
      parts.push(/*#__PURE__*/_jsx(Text, {
        style: styles.inlineCode,
        children: token.slice(1, -1)
      }, key));
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(/*#__PURE__*/_jsx(Text, {
        style: styles.bold,
        children: token.slice(2, -2)
      }, key));
    } else {
      parts.push(/*#__PURE__*/_jsx(Text, {
        style: styles.italic,
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
function renderMarkdownText(text) {
  const output = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (index > 0) output.push('\n');
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    output.push(...renderInlineMarkdown(bulletMatch ? `• ${bulletMatch[1]}` : line, `line-${index}`));
  });
  return output;
}
export function RichContentRenderer({
  content,
  surface,
  isUser = false,
  textStyle
}) {
  const theme = useRichUITheme(surface === 'support' ? 'support' : surface);
  const registry = useBlockRegistry();
  const nodes = normalizeRichContent(content);
  return /*#__PURE__*/_jsx(View, {
    style: styles.container,
    children: nodes.map((node, index) => {
      if (node.type === 'text') {
        return /*#__PURE__*/_jsx(Text, {
          style: [styles.text, {
            color: isUser || surface === 'chat' || surface === 'support' ? theme.colors.inverseText : theme.colors.primaryText
          }, textStyle],
          children: renderMarkdownText(node.content)
        }, node.id || `text-${index}`);
      }
      const definition = registry.get(node.blockType);
      if (!definition) {
        return null;
      }
      const BlockComponent = definition.component;
      return /*#__PURE__*/_jsx(View, {
        style: [styles.blockWrapper, surface === 'chat' || surface === 'support' ? {
          backgroundColor: theme.colors.richMessageContainer,
          borderColor: theme.colors.subtleBorder
        } : null],
        children: /*#__PURE__*/_jsx(BlockComponent, {
          ...node.props
        })
      }, node.id || `block-${index}`);
    })
  });
}
const styles = StyleSheet.create({
  container: {
    gap: 12,
    minWidth: 0,
    maxWidth: '100%'
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? {
      overflowWrap: 'anywhere',
      wordBreak: 'break-word'
    } : null)
  },
  bold: {
    fontWeight: '800'
  },
  italic: {
    fontStyle: 'italic'
  },
  inlineCode: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace'
    }),
    fontSize: 14,
    maxWidth: '100%',
    flexShrink: 1,
    ...(Platform.OS === 'web' ? {
      overflowWrap: 'anywhere',
      wordBreak: 'break-word'
    } : null)
  },
  blockWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    minWidth: 0
  }
});
//# sourceMappingURL=RichContentRenderer.js.map
