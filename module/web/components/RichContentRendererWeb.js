"use strict";

import React from 'react';
import { normalizeRichContent } from "../../core/richContent.js";
import { useBlockRegistry, useRichUITheme } from "../../components/rich-content/RichUIContext.js";
import { jsx as _jsx } from "react/jsx-runtime";
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
        return /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 15,
            lineHeight: 1.55,
            color: isUser || surface === 'chat' || surface === 'support' ? theme.colors.inverseText : theme.colors.primaryText,
            ...textStyle
          },
          children: node.content
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