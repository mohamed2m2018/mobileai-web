/**
 * SDK Endpoint Configuration
 *
 * All MobileAI backend URLs live here.
 * Change these to point to a self-hosted or staging server.
 *
 * Enterprise customers: use the `analyticsProxyUrl` prop on <AIAgent>
 * to route telemetry through your own backend without touching this file.
 */
export declare const ENDPOINTS: {
    /** Hosted MobileAI text proxy — used by default when analyticsKey is set */
    readonly hostedTextProxy: `${string}/api/v1/hosted-proxy/text`;
    /** Hosted MobileAI voice proxy — used by default when analyticsKey is set */
    readonly hostedVoiceProxy: `${string}/ws/hosted-proxy/voice`;
    /** Telemetry event ingest — receives batched SDK events */
    readonly telemetryIngest: `${string}/api/v1/events`;
    /** Feature flag sync — fetches remote flags for this analyticsKey */
    readonly featureFlags: `${string}/api/v1/flags`;
    /** Live agent escalation (support handoff) */
    readonly escalation: string;
    /** AI conversation history — save and retrieve per-user AI chat sessions */
    readonly conversations: `${string}/api/v1/conversations`;
};
//# sourceMappingURL=endpoints.d.ts.map