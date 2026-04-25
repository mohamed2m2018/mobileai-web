export interface FeatureFlagPayload {
    key: string;
    variants: string[];
    rollout: number[];
}
export declare class FlagService {
    private hostUrl;
    private assignments;
    private fetched;
    constructor(hostUrl: string);
    /**
     * Fetch feature flags from the dashboard backend
     */
    fetch(analyticsKey: string, userId?: string): Promise<void>;
    /**
     * Deterministically assign a variant using murmurhash.
     */
    private assignVariant;
    private assignAll;
    /** Get a specific flag value */
    getFlag(key: string, defaultValue?: string): string;
    /** Get all active assignments for telemetry */
    getAllFlags(): Record<string, string>;
}
//# sourceMappingURL=FlagService.d.ts.map