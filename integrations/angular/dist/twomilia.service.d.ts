import { type TwomiliaConfig } from '@twomilia/web';
/**
 * Injectable wrapper around the Twomilia web agent loader.
 *
 * The agent renders its own shadow-DOM chat widget overlay — this service does
 * NOT render any UI. It just injects `twomilia.js` (once, from the CDN) and
 * mounts the agent with your config at the right moment.
 *
 * SSR-safe: on the server (Angular Universal) `init` is a no-op, because the
 * underlying `loadTwomilia` already no-ops without `window`, and we additionally
 * guard with `isPlatformBrowser`.
 *
 * Idempotent: calling `init` more than once will not double-mount the widget —
 * the first config wins for the page's lifetime.
 */
export declare class TwomiliaService {
    private readonly platformId;
    constructor(platformId: object);
    /**
     * Load and mount the Twomilia agent with `config`.
     * Returns a promise that resolves once the agent is initialized (or
     * immediately with `undefined` on the server).
     */
    init(config: TwomiliaConfig): Promise<import("@twomilia/web").TwomiliaGlobal | undefined>;
}
