/**
 * @twomilia/react — thin React wrapper around @twomilia/web.
 *
 * The agent ships its own shadow-DOM chat widget overlay, so this wrapper
 * renders NO UI. It just calls `loadTwomilia(config)` once, in a client-only
 * effect. `loadTwomilia` is SSR-safe (no-op on the server) and idempotent
 * (it never double-mounts the widget), so the first config wins for the page.
 */
import { useEffect } from "react";
import { loadTwomilia, type TwomiliaConfig } from "@twomilia/web";

export type { TwomiliaConfig, TwomiliaTool } from "@twomilia/web";

/**
 * Load and mount the Twomilia agent once, on mount.
 *
 * Runs inside `useEffect` with empty deps, so it only fires on the client
 * (never during SSR/render) and exactly once per mount. Pass your final
 * config on first render — because the underlying loader is idempotent,
 * mutating `config` later will NOT re-initialize the widget.
 */
export function useTwomilia(config: TwomiliaConfig): void {
  useEffect(() => {
    void loadTwomilia(config);
    // Run once per mount. loadTwomilia is idempotent (first config wins),
    // so we intentionally do not depend on `config`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface TwomiliaProps {
  config: TwomiliaConfig;
}

/**
 * Drop-in component. Renders `null` — the agent mounts its own overlay.
 *
 * In Next.js App Router, place this inside a Client Component
 * (a file with `'use client'`), never in a server-rendered tree.
 */
export function Twomilia({ config }: TwomiliaProps): null {
  useTwomilia(config);
  return null;
}

export default Twomilia;
