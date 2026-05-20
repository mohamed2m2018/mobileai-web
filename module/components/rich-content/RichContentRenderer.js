"use strict";

import { StyleSheet, Text, View } from 'react-native';
import { normalizeRichContent } from "../../core/richContent.js";
import { useBlockRegistry, useRichUITheme } from "./RichUIContext.js";
import { jsx as _jsx } from "react/jsx-runtime";
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
          children: node.content
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
    gap: 12
  },
  text: {
    fontSize: 15,
    lineHeight: 22
  },
  blockWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth
  }
});
//# sourceMappingURL=RichContentRenderer.js.map