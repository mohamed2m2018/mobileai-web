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
import React from 'react';
/**
 * True when a native elevated overlay is available on the current platform.
 * Used by AIConsentDialog to decide whether to render as View vs Modal.
 *
 * iOS + react-native-screens installed → true
 * Everything else (fallback)           → false
 */
export declare const isNativeOverlayActive: boolean;
interface FloatingOverlayWrapperProps {
    children: React.ReactNode;
    androidWindowMetrics?: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    onAndroidWindowDragEnd?: (metrics: {
        x: number;
        y: number;
        width: number;
        height: number;
    }) => void;
    /**
     * Style applied to the View wrapper when no native overlay is available.
     * Ignored on iOS (FullWindowOverlay creates its own UIWindow) and
     * Android (native module creates its own panel dialog window).
     */
    fallbackStyle?: any;
}
export interface FloatingOverlayWrapperHandle {
    setAndroidWindowMetrics: (metrics: NonNullable<FloatingOverlayWrapperProps['androidWindowMetrics']>) => void;
}
export declare const FloatingOverlayWrapper: React.ForwardRefExoticComponent<FloatingOverlayWrapperProps & React.RefAttributes<FloatingOverlayWrapperHandle>>;
export {};
//# sourceMappingURL=FloatingOverlayWrapper.d.ts.map