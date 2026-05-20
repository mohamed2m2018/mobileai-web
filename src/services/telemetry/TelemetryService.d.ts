/**
 * TelemetryService — Batches and sends analytics events to MobileAI Cloud.
 *
 * Features:
 * - Event batching (flush every N seconds or N events)
 * - Offline queue with retry on reconnect
 * - Lightweight — no native dependencies
 * - Opt-in only (requires analyticsKey or analyticsProxyUrl)
 */
import type { TelemetryConfig } from './types';
import { FlagService } from '../flags/FlagService';
export declare class TelemetryService {
    private queue;
    config: TelemetryConfig;
    private sessionId;
    private currentScreen;
    private screenFlow;
    private flushTimer;
    private isFlushing;
    private appStateSubscription;
    private wireframesSent;
    get screen(): string;
    getScreenFlow(): string[];
    /**
     * True while the AI agent is executing a tool (tap, type, navigate, etc.).
     * The touch interceptor checks this flag to avoid double-counting AI actions
     * as human interactions. Agent steps are already tracked as agent_step events.
     */
    isAgentActing: boolean;
    flags: FlagService;
    /** Set by AgentRuntime before/after each tool execution. */
    setAgentActing(active: boolean): void;
    constructor(config: TelemetryConfig);
    /** Start the telemetry service (call on mount) */
    start(): Promise<void>;
    /** Stop the telemetry service (call on unmount) */
    stop(): Promise<void>;
    /** Track an event (auto or custom) */
    track(type: string, data?: Record<string, unknown>): void;
    /** Update current screen (called by AIAgent on navigation) */
    setScreen(rawScreenName: string): void;
    /**
     * Track a wireframe snapshot.
     * Deduped per session (only one wireframe per screen over a session).
     */
    trackWireframe(snapshot: import('../../core/types').WireframeSnapshot): void;
    /** Send queued events to the cloud API */
    flush(): Promise<void>;
    /** Save queued events to AsyncStorage for crash/restart recovery */
    private persistQueue;
    /** Restore queued events from previous session */
    private restoreQueue;
    /** Check if telemetry is configured */
    private isEnabled;
}
//# sourceMappingURL=TelemetryService.d.ts.map