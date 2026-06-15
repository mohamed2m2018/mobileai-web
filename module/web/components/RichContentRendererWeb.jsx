'use strict';

import React from 'react';
import { normalizeRichContent } from '../../core/richContent.js';
import { useBlockRegistry, useRichUITheme } from '../../components/rich-content/RichUIContext.js';
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
      parts.push(
        <code
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: '0.92em',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
          key={key}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') || token.startsWith('__')) {
      parts.push(
        <strong
          style={{
            fontWeight: 800,
          }}
          key={key}
        >
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      parts.push(
        <em
          style={{
            fontStyle: 'italic',
          }}
          key={key}
        >
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
function MarkdownText({ text, style }) {
  const lines = text.split(/\r?\n/);
  return (
    <div style={style}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return (
            <div
              style={{
                height: 10,
              }}
              key={`blank-${index}`}
            />
          );
        }
        const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                minWidth: 0,
                maxWidth: '100%',
              }}
              key={`line-${index}`}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  lineHeight: 'inherit',
                }}
              >
                {'\u2022'}
              </span>
              <span
                style={{
                  minWidth: 0,
                  maxWidth: '100%',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {renderInlineMarkdown(bulletMatch[1], `line-${index}`)}
              </span>
            </div>
          );
        }
        return (
          <div
            style={{
              minWidth: 0,
              maxWidth: '100%',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
            key={`line-${index}`}
          >
            {renderInlineMarkdown(line, `line-${index}`)}
          </div>
        );
      })}
    </div>
  );
}
export function RichContentRendererWeb({ content, surface, isUser = false, textStyle }) {
  const theme = useRichUITheme(surface === 'support' ? 'support' : surface);
  const registry = useBlockRegistry();
  const nodes = normalizeRichContent(content);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm,
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      {nodes.map((node, index) => {
        if (node.type === 'image' && node.uri) {
          return (
            <img
              src={node.uri}
              alt="user attachment"
              style={{
                maxWidth: '100%',
                borderRadius: 12,
                aspectRatio: '4 / 3',
                objectFit: 'cover',
              }}
              key={node.id || `image-${index}`}
            />
          );
        }
        if (node.type === 'text') {
          return (
            <MarkdownText
              style={{
                fontSize: 15,
                lineHeight: 1.55,
                color:
                  isUser || surface === 'chat' || surface === 'support'
                    ? theme.colors.inverseText
                    : theme.colors.primaryText,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
                minWidth: 0,
                maxWidth: '100%',
                ...textStyle,
              }}
              text={node.content}
              key={node.id || `text-${index}`}
            />
          );
        }
        const definition = registry.get(node.blockType);
        if (!definition) return null;
        const BlockComponent = definition.component;
        return (
          <div
            style={{
              borderRadius: theme.shape.cardRadius,
              overflow: 'hidden',
              border:
                surface === 'chat' || surface === 'support' ? `1px solid ${theme.colors.subtleBorder}` : undefined,
              background: surface === 'chat' || surface === 'support' ? theme.colors.richMessageContainer : undefined,
              minWidth: 0,
              maxWidth: '100%',
            }}
            key={node.id || `block-${index}`}
          >
            <BlockComponent {...node.props} />
          </div>
        );
      })}
    </div>
  );
}
//# sourceMappingURL=RichContentRendererWeb.js.map
