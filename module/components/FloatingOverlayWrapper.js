"use strict";

/**
 * FloatingOverlayWrapper — Cross-platform elevated overlay.
 *
 * Platform strategy (in priority order):
 *
 * iOS:
 *   1. `FullWindowOverlay` from react-native-screens (optional peer dep).
 *      Creates a separate UIWindow at UIWindow.Level.alert+1.
 *      Renders ABOVE all native Modals, system alerts, and navigation chrome.
 *   2. Falls back to plain View if react-native-screens is not installed.
 *
 * Android:
 *   1. Uses a native panel dialog window when explicit bounds are provided.
 *      This keeps the floating agent compact and above native modal surfaces.
 *   2. Falls back to a plain View otherwise.
 *
 * Usage:
 *   <FloatingOverlayWrapper fallbackStyle={styles.floatingLayer}>
 *     <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
 *       {chatBar}
 *       {consentDialog} ← must be INSIDE the wrapper, AFTER the chat bar in JSX
 *     </View>
 *   </FloatingOverlayWrapper>
 *
 * Note: FullWindowOverlay on iOS does NOT officially accept style props in its TS definition, 
 * but passing StyleSheet.absoluteFill is often necessary to prevent dimensions collapsing conditionally.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { DeviceEventEmitter, Platform, View, StyleSheet, findNodeHandle } from 'react-native';

// ─── iOS: FullWindowOverlay (react-native-screens optional peer dep) ──────────
import { jsx as _jsx } from "react/jsx-runtime";
let FullWindowOverlay = null;
if (Platform.OS === 'ios') {
  try {
    const screens = require('react-native-screens');
    FullWindowOverlay = screens.FullWindowOverlay ?? null;
  } catch {
    // react-native-screens not installed — falls back to View
  }
}

// ─── Export: whether a true elevated overlay is active ───────────────────────

let NativeFloatingOverlay = null;
if (Platform.OS === 'android') {
  try {
    NativeFloatingOverlay = require('../specs/FloatingOverlayNativeComponent.ts').default;
  } catch {
    // Falls back to a plain View when the native Android overlay isn't available.
  }
}

/**
 * True when a native elevated overlay is available on the current platform.
 * Used by AIConsentDialog to decide whether to render as View vs Modal.
 *
 * iOS + react-native-screens installed → true
 * Everything else (fallback)           → false
 */
export const isNativeOverlayActive = Platform.OS === 'ios' && !!FullWindowOverlay;
const ANDROID_WINDOW_DRAG_END_EVENT = 'mobileaiFloatingOverlayDragEnd';

// ─── Component ────────────────────────────────────────────────────────────────

export const FloatingOverlayWrapper = /*#__PURE__*/forwardRef(function FloatingOverlayWrapper({
  children,
  androidWindowMetrics,
  onAndroidWindowDragEnd,
  fallbackStyle
}, ref) {
  const nativeOverlayRef = useRef(null);
  useImperativeHandle(ref, () => ({
    setAndroidWindowMetrics: metrics => {
      nativeOverlayRef.current?.setNativeProps?.({
        windowX: metrics.x,
        windowY: metrics.y,
        windowWidth: metrics.width,
        windowHeight: metrics.height
      });
    }
  }), []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !onAndroidWindowDragEnd) return;
    const subscription = DeviceEventEmitter.addListener(ANDROID_WINDOW_DRAG_END_EVENT, event => {
      const nativeHandle = findNodeHandle(nativeOverlayRef.current);
      if (nativeHandle != null && event.viewId != null && event.viewId !== nativeHandle) {
        return;
      }
      if (typeof event.x !== 'number' || typeof event.y !== 'number' || typeof event.width !== 'number' || typeof event.height !== 'number') {
        return;
      }
      onAndroidWindowDragEnd({
        x: event.x,
        y: event.y,
        width: event.width,
        height: event.height
      });
    });
    return () => subscription.remove();
  }, [onAndroidWindowDragEnd]);

  // iOS: FullWindowOverlay — separate UIWindow above everything
  if (Platform.OS === 'ios' && FullWindowOverlay) {
    // @ts-ignore - Some versions of react-native-screens don't type 'style'
    return /*#__PURE__*/_jsx(FullWindowOverlay, {
      style: StyleSheet.absoluteFill,
      children: children
    });
  }
  if (Platform.OS === 'android' && NativeFloatingOverlay && androidWindowMetrics) {
    const NativeFloatingOverlayComponent = NativeFloatingOverlay;
    return /*#__PURE__*/_jsx(NativeFloatingOverlayComponent, {
      ref: nativeOverlayRef,
      style: styles.androidAnchor,
      windowX: androidWindowMetrics.x,
      windowY: androidWindowMetrics.y,
      windowWidth: androidWindowMetrics.width,
      windowHeight: androidWindowMetrics.height,
      children: children
    });
  }

  // Fallback: regular View — same behavior as before this overlay feature
  return /*#__PURE__*/_jsx(View, {
    style: fallbackStyle,
    pointerEvents: "box-none",
    children: children
  });
});
FloatingOverlayWrapper.displayName = 'FloatingOverlayWrapper';
const styles = StyleSheet.create({
  androidAnchor: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1
  }
});
//# sourceMappingURL=FloatingOverlayWrapper.js.map