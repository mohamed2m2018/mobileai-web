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
  execute: (
    args: Record<string, unknown>
  ) => Promise<{ success: boolean; message?: string } | unknown> | unknown;
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

  /**
   * How much the agent is allowed to do:
   *  - "companion"  — read-only. Sees the screen and guides the user, but never
   *                   taps/types/navigates. UI-control tools are withheld server-side.
   *  - "copilot"    — (default) acts, but asks for approval before each workflow and
   *                   always before an irreversible/commit action.
   *  - "autopilot"  — acts without per-step approval (the commit hard-floor still fires).
   */
  interactionMode?: "companion" | "copilot" | "autopilot";
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

const DEFAULT_SRC = "https://twomilia.com/twomilia.js";
const SCRIPT_MARKER = "data-twomilia-loader";

let scriptPromise: Promise<TwomiliaGlobal | undefined> | null = null;
let didInit = false;

function getGlobal(): TwomiliaGlobal | undefined {
  return (window as unknown as { Twomilia?: TwomiliaGlobal }).Twomilia;
}

/** Inject twomilia.js exactly once. Resolves with window.Twomilia. */
function loadScript(src: string): Promise<TwomiliaGlobal | undefined> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existingGlobal = getGlobal();
    if (existingGlobal) return resolve(existingGlobal);

    const existing = document.querySelector(`script[${SCRIPT_MARKER}]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(getGlobal()));
      existing.addEventListener("error", () =>
        reject(new Error("twomilia.js failed to load"))
      );
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
export async function loadTwomilia(
  config: TwomiliaConfig,
  options: LoadOptions = {}
): Promise<TwomiliaGlobal | undefined> {
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
export function isTwomiliaLoaded(): boolean {
  return didInit;
}
