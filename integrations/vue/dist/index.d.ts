/**
 * @twomilia/vue — thin Vue 3 wrapper around `@twomilia/web`.
 *
 * Renders NO UI. The Twomilia agent mounts its own shadow-DOM chat overlay
 * once `twomilia.js` loads. This wrapper just calls `loadTwomilia(config)` at
 * the idiomatic, client-only moment:
 *
 *   • `useTwomilia(config)` — a composable that loads the agent in `onMounted`.
 *   • `TwomiliaPlugin`     — a Vue plugin so `app.use(TwomiliaPlugin, config)` works.
 *
 * SSR-safe: `loadTwomilia` is a no-op on the server, and both entry points only
 * call it from client-only paths (`onMounted` / a `typeof window` guard).
 */
import type { Plugin } from "vue";
import type { TwomiliaConfig } from "@twomilia/web";
export type { TwomiliaConfig, TwomiliaTool } from "@twomilia/web";
export { loadTwomilia, isTwomiliaLoaded } from "@twomilia/web";
/**
 * Load the Twomilia agent from inside a Vue component.
 *
 * Call this in `setup()` / `<script setup>`. It registers an `onMounted` hook,
 * so the agent only loads in the browser — never during SSR. Idempotent: the
 * underlying loader injects `twomilia.js` once and mounts the widget once per
 * page, so calling this from multiple components is safe.
 *
 * @param config Your Twomilia config. Only `analyticsKey` is required.
 */
export declare function useTwomilia(config: TwomiliaConfig): void;
/**
 * Vue plugin form: `app.use(TwomiliaPlugin, config)`.
 *
 * The agent loads as soon as the app is installed in the browser. The call is
 * guarded by `typeof window` so installing the plugin during SSR is inert; the
 * real mount happens on the client (e.g. via Nuxt's `*.client.ts` plugins).
 */
export declare const TwomiliaPlugin: Plugin<[TwomiliaConfig]>;
export default TwomiliaPlugin;
