/**
 * @twomilia/web — thin loader for the Twomilia web agent.
 *
 * This package does NOT bundle the agent (the runtime stays on the CDN, like
 * Stripe.js). It injects `twomilia.js` once, then calls `Twomilia.init(config)`
 * with a typed config. Every framework wrapper (React/Vue/Angular/Svelte) builds
 * on `loadTwomilia` below. SSR-safe: on the server it's a no-op.
 */
const DEFAULT_SRC = "https://twomilia.com/twomilia.js";
const SCRIPT_MARKER = "data-twomilia-loader";
let scriptPromise = null;
let didInit = false;
function getGlobal() {
    return window.Twomilia;
}
/** Inject twomilia.js exactly once. Resolves with window.Twomilia. */
function loadScript(src) {
    if (scriptPromise)
        return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
        const existingGlobal = getGlobal();
        if (existingGlobal)
            return resolve(existingGlobal);
        const existing = document.querySelector(`script[${SCRIPT_MARKER}]`);
        if (existing) {
            existing.addEventListener("load", () => resolve(getGlobal()));
            existing.addEventListener("error", () => reject(new Error("twomilia.js failed to load")));
            return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.setAttribute(SCRIPT_MARKER, "");
        s.onload = () => resolve(getGlobal());
        s.onerror = () => reject(new Error("twomilia.js failed to load"));
        document.head.appendChild(s);
    });
    return scriptPromise;
}
/**
 * Load twomilia.js (once) and mount the agent with `config`.
 *
 * SSR-safe (no-op on the server). Idempotent: calling it again won't double-mount
 * the widget — the first config wins for the page's lifetime.
 *
 * @returns the global `Twomilia` object, or undefined on the server.
 */
export async function loadTwomilia(config, options = {}) {
    if (typeof window === "undefined" || typeof document === "undefined") {
        return undefined; // server — do nothing
    }
    const Twomilia = await loadScript(options.src ?? DEFAULT_SRC);
    if (Twomilia && !didInit) {
        didInit = true;
        Twomilia.init(config);
    }
    return Twomilia;
}
/** Has the agent already been initialized on this page? */
export function isTwomiliaLoaded() {
    return didInit;
}
