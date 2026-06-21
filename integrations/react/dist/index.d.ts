import { type TwomiliaConfig } from "@twomilia/web";
export type { TwomiliaConfig, TwomiliaTool } from "@twomilia/web";
/**
 * Load and mount the Twomilia agent once, on mount.
 *
 * Runs inside `useEffect` with empty deps, so it only fires on the client
 * (never during SSR/render) and exactly once per mount. Pass your final
 * config on first render — because the underlying loader is idempotent,
 * mutating `config` later will NOT re-initialize the widget.
 */
export declare function useTwomilia(config: TwomiliaConfig): void;
export interface TwomiliaProps {
    config: TwomiliaConfig;
}
/**
 * Drop-in component. Renders `null` — the agent mounts its own overlay.
 *
 * In Next.js App Router, place this inside a Client Component
 * (a file with `'use client'`), never in a server-rendered tree.
 */
export declare function Twomilia({ config }: TwomiliaProps): null;
export default Twomilia;
