/**
 * TouchAutoCapture — Extracts a human-readable label from a React Native
 * touch event target by walking up the native view hierarchy.
 *
 * Used by AIAgent to auto-track every tap in the app without
 * any developer code changes (zero-config analytics).
 *
 * Strategy:
 * 1. Read the touched element's accessibilityLabel (best signal).
 * 2. If none, use React Native's internal _children to find nested text.
 * 3. Fallback to the component's testID.
 * 4. Last resort: "Unknown Element".
 */
import type { TelemetryService } from './TelemetryService';
import type { AnalyticsTargetMetadata } from './analyticsLabeling';
/**
 * Checks if the user is rage-tapping an element.
 *
 * Industry best-practice criteria:
 * 1. Same label tapped 3+ times within 1 second
 * 2. Taps must be on the SAME screen (screen change = not rage, it's navigation)
 * 3. Navigation labels ("Next", "Skip", etc.) are excluded
 */
export declare function checkRageClick(target: AnalyticsTargetMetadata & {
    x: number;
    y: number;
}, telemetry: TelemetryService): void;
/**
 * Extract a label from a GestureResponderEvent.
 *
 * @param event - The GestureResponderEvent from onStartShouldSetResponderCapture
 * @returns A descriptive label string for the tapped element
 */
export declare function extractTouchTargetMetadata(event: any): AnalyticsTargetMetadata;
export declare function extractTouchLabel(event: any): string;
//# sourceMappingURL=TouchAutoCapture.d.ts.map