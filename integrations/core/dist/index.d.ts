/**
 * @twomilia/web — thin loader for the Twomilia web agent.
 *
 * This package does NOT bundle the agent (the runtime stays on the CDN, like
 * Stripe.js). It injects `twomilia.js` once, then calls `Twomilia.init(config)`
 * with a typed config. Every framework wrapper (React/Vue/Angular/Svelte) builds
 * on `loadTwomilia` below. SSR-safe: on the server it's a no-op.
 */
export interface TwomiliaToolParam {
    type: "string" | "number" | "boolean";
    description?: string;
    enum?: string[];
    /** Defaults to true. Set false for optional params. */
    required?: boolean;
}
export interface TwomiliaTool {
    name: string;
    /** The agent reads this to decide when to call the tool. Be specific. */
    description: string;
    /** Param name → schema (or a string shorthand = required string). */
    parameters?: Record<string, TwomiliaToolParam | string>;
    /** Your app code. Read live state inside here. Return {success, message}. */
    execute: (args: Record<string, unknown>) => Promise<{
        success: boolean;
        message?: string;
    } | unknown> | unknown;
}
export interface TwomiliaConfig {
    /** Publishable key (twomilia_pub_…) from Dashboard → Setup & API Keys. Required. */
    analyticsKey: string;
    /** Ground answers in your dashboard knowledge (Settings → AI Knowledge). */
    knowledgeBase?: boolean;
    knowledgeMaxTokens?: number;
    /** Named actions the agent can call. See TwomiliaTool. */
    customTools?: Record<string, TwomiliaTool>;
    /** CSS selectors hidden from the agent (and their children). */
    ignoreSelectors?: string[];
    /** CSS selectors that force an approval prompt before the agent acts. */
    confirmSelectors?: string[];
    /** Logged-in user details for personalized support. */
    userContext?: {
        userId?: string;
        name?: string;
        email?: string;
        [key: string]: unknown;
    };
    /** Customer-support widget config (greeting, quick replies, escalation, CSAT). */
    supportMode?: Record<string, unknown>;
    interactionMode?: "copilot" | "autopilot";
    enableVoice?: boolean;
    enableWebSearch?: boolean;
    /** Widget chrome. */
    accentColor?: string;
    headerTitle?: string;
    inputPlaceholder?: string;
    defaultOpen?: boolean;
    model?: string;
    maxSteps?: number;
    debug?: boolean;
    /** Advanced / self-host — default to Twomilia Cloud when omitted. */
    proxyUrl?: string;
    serverUrl?: string;
    useServerRuntime?: boolean;
    voiceProxyUrl?: string;
    /** Forward-compat: any other AIAgent prop. */
    [key: string]: unknown;
}
export interface TwomiliaGlobal {
    init: (config: TwomiliaConfig) => unknown;
}
export interface LoadOptions {
    /** Override the script source (e.g. a self-hosted twomilia.js). */
    src?: string;
}
/**
 * Load twomilia.js (once) and mount the agent with `config`.
 *
 * SSR-safe (no-op on the server). Idempotent: calling it again won't double-mount
 * the widget — the first config wins for the page's lifetime.
 *
 * @returns the global `Twomilia` object, or undefined on the server.
 */
export declare function loadTwomilia(config: TwomiliaConfig, options?: LoadOptions): Promise<TwomiliaGlobal | undefined>;
/** Has the agent already been initialized on this page? */
export declare function isTwomiliaLoaded(): boolean;
