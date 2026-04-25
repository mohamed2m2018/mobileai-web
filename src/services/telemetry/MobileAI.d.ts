/**
 * MobileAI — Public static API for consumer event tracking.
 *
 * Usage:
 *   import { MobileAI } from '@mobileai/web';
 *   MobileAI.track('purchase_complete', { total: 29.99 });
 *
 * The TelemetryService instance is injected by the <AIAgent> component.
 * If no analyticsKey is configured, all calls are no-ops.
 */
import type { TelemetryService } from './TelemetryService';
export declare const MobileAI: {
    /**
     * Track a custom business event.
     * @param eventName - Name of the event (e.g., 'purchase_complete')
     * @param data - Event-specific key-value data
     */
    track(eventName: string, data?: Record<string, unknown>): void;
    /**
     * Identify the current user (optional, for user-level analytics).
     * @param userId - Unique user identifier (hashed by consumer)
     * @param traits - Optional user traits (plan, role, etc.)
     */
    identify(userId: string, traits?: Record<string, unknown>): void;
    /**
     * Get an assigned feature flag variation for the current device.
     * Deterministic via murmurhash. Call after MobileAI has initialized.
     * @param key Flag key
     * @param defaultValue Fallback if not assigned
     */
    getFlag(key: string, defaultValue?: string): string;
    /**
     * Helper function to securely consume a global WOW action limit (like a discount)
     * natively on the MobileAI Server to prevent prompt injection bypasses.
     * @param actionName - The exact registered name of the WOW action
     * @returns true if allowed, false if rejected or error
     */
    consumeWowAction(actionName: string): Promise<boolean>;
};
/**
 * Internal: Bind the TelemetryService instance (called by AIAgent on mount).
 * Not exported to consumers.
 */
export declare function bindTelemetryService(instance: TelemetryService | null): void;
//# sourceMappingURL=MobileAI.d.ts.map
