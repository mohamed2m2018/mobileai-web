"use strict";

import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, DeviceEventEmitter } from 'react-native';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function HighlightOverlay() {
  const [highlight, setHighlight] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef(null);
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('MOBILE_AI_HIGHLIGHT', data => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setHighlight(data);
      if (data) {
        // Start pulsing ring
        pulseAnim.setValue(1);
        Animated.loop(Animated.sequence([Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: true
        }), Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true
        })])).start();

        // Auto-dismiss
        const ms = data.autoRemoveAfterMs || 5000;
        timerRef.current = setTimeout(() => {
          setHighlight(null);
        }, ms);
      }
    });
    return () => sub.remove();
  }, [pulseAnim]);
  if (!highlight) return null;
  const {
    pageX,
    pageY,
    width,
    height,
    message
  } = highlight;

  // Calculate tooltip position (prefer top, fallback to bottom if too close to top edge)
  const isTooHigh = pageY < 60;
  const tooltipTop = isTooHigh ? pageY + height + 12 : pageY - 45;
  return /*#__PURE__*/_jsxs(View, {
    style: StyleSheet.absoluteFill,
    pointerEvents: "box-none",
    children: [/*#__PURE__*/_jsx(Pressable, {
      testID: "highlight-close-zone",
      style: StyleSheet.absoluteFill,
      onPress: () => setHighlight(null)
    }), /*#__PURE__*/_jsx(Animated.View, {
      style: [styles.ring, {
        left: pageX - 4,
        top: pageY - 4,
        width: width + 8,
        height: height + 8,
        transform: [{
          scale: pulseAnim
        }]
      }],
      pointerEvents: "none"
    }), /*#__PURE__*/_jsxs(View, {
      style: [styles.tooltip, {
        top: tooltipTop
      }],
      pointerEvents: "none",
      children: [/*#__PURE__*/_jsx(Text, {
        style: styles.message,
        children: message
      }), /*#__PURE__*/_jsx(View, {
        style: isTooHigh ? styles.arrowUp : styles.arrowDown
      })]
    })]
  });
}
const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#007AFF',
    // iOS blue
    borderRadius: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.15)' // Very subtle fill
  },
  tooltip: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowRadius: 4,
    elevation: 4
  },
  message: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center'
  },
  arrowDown: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#007AFF'
  },
  arrowUp: {
    position: 'absolute',
    top: -6,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#007AFF'
  }
});
//# sourceMappingURL=HighlightOverlay.js.map