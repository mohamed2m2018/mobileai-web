"use strict";

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ProactiveOutreachBanner({
  message,
  actionLabel,
  onAction,
  onDismiss,
  style
}) {
  return /*#__PURE__*/_jsxs(View, {
    style: [styles.container, style],
    children: [/*#__PURE__*/_jsx(Text, {
      style: styles.message,
      children: message
    }), /*#__PURE__*/_jsxs(View, {
      style: styles.actions,
      children: [actionLabel && onAction && /*#__PURE__*/_jsx(TouchableOpacity, {
        onPress: onAction,
        style: styles.actionButton,
        children: /*#__PURE__*/_jsx(Text, {
          style: styles.actionText,
          children: actionLabel
        })
      }), onDismiss && /*#__PURE__*/_jsx(TouchableOpacity, {
        onPress: onDismiss,
        style: styles.dismissButton,
        children: /*#__PURE__*/_jsx(Text, {
          style: styles.dismissText,
          children: "Dismiss"
        })
      })]
    })]
  });
}
const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    margin: 8
  },
  message: {
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 8
  },
  actions: {
    flexDirection: 'row',
    gap: 8
  },
  actionButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600'
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 8
  },
  dismissText: {
    color: '#64748B',
    fontSize: 14
  }
});
//# sourceMappingURL=ProactiveOutreachBanner.js.map