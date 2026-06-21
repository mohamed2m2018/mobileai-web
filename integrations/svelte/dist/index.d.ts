/**
 * @twomilia/svelte — thin Svelte wrapper for the Twomilia web agent.
 *
 * Drop `<Twomilia config={...} />` anywhere in your app (ideally near the root,
 * e.g. your root +layout.svelte) and the agent's shadow-DOM chat widget mounts
 * itself. The wrapper renders no UI — it just calls `loadTwomilia(config)` in
 * `onMount`, which only runs client-side (SSR-safe).
 */
export { default as Twomilia } from './Twomilia.svelte';
export { loadTwomilia, isTwomiliaLoaded } from '@twomilia/web';
export type { TwomiliaConfig, TwomiliaTool, TwomiliaToolParam, } from '@twomilia/web';
