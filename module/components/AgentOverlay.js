"use strict";

/**
 * AgentOverlay — Subtle thinking indicator shown while the AI agent is processing.
 * Includes a cancel button to stop the agent mid-execution.
 */

import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { CloseIcon } from "./Icons.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function AgentOverlay({
  visible,
  statusText,
  onCancel
}) {
  if (!visible) return null;
  return /*#__PURE__*/_jsx(View, {
    style: styles.overlay,
    pointerEvents: "box-none",
    children: /*#__PURE__*/_jsxs(View, {
      style: styles.pill,
      children: [/*#__PURE__*/_jsx(ActivityIndicator, {
        size: "small",
        color: "#fff"
      }), /*#__PURE__*/_jsx(Text, {
        style: styles.text,
        children: statusText || 'Thinking...'
      }), onCancel && /*#__PURE__*/_jsx(TouchableOpacity, {
        onPress: onCancel,
        style: styles.cancelButton,
        hitSlop: {
          top: 8,
          bottom: 8,
          left: 8,
          right: 8
        },
        children: /*#__PURE__*/_jsx(CloseIcon, {
          size: 12,
          color: "#fff"
        })
      })]
    })
  });
}
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100001,
    elevation: 1000
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(26, 26, 46, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: '85%'
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1
  },
  cancelButton: {
    marginLeft: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }
});
//# sourceMappingURL=AgentOverlay.js.map