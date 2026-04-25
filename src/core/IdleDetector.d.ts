export interface IdleDetectorConfig {
    /** Time in ms before the agent pulses subtly (e.g. 120_000 for 2m) */
    pulseAfterMs: number;
    /** Time in ms before the agent shows a badge (e.g. 240_000 for 4m) */
    badgeAfterMs: number;
    /** Callback fired when the user is idle enough for a subtle pulse */
    onPulse: () => void;
    /** Callback fired when the user is idle enough for a proactive badge. Receives the context suggestion. */
    onBadge: (suggestion: string) => void;
    /** Callback fired when the user interacts, cancelling idle states */
    onReset: () => void;
    /** Dynamic context suggestion generator based on current screen */
    generateSuggestion?: () => string;
    /** Configured behavior triggers */
    behaviorTriggers?: Array<{
        screen: string;
        type: string;
        message?: string;
        delayMs?: number;
    }>;
}
export declare class IdleDetector {
    private pulseTimer;
    private badgeTimer;
    private dismissed;
    private config;
    start(config: IdleDetectorConfig): void;
    reset(): void;
    dismiss(): void;
    destroy(): void;
    /**
     * Instantly trigger proactive help if the behavior matches a configured trigger.
     */
    triggerBehavior(type: string, currentScreen: string): void;
    private resetTimers;
    private clearTimers;
}
//# sourceMappingURL=IdleDetector.d.ts.map