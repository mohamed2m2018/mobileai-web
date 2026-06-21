<script lang="ts">
  import { onMount } from 'svelte';
  import { loadTwomilia, type TwomiliaConfig } from '@twomilia/web';

  /**
   * Twomilia agent config. `analyticsKey` is the only required field;
   * everything else (proxy/server, model, voice, knowledge base, custom
   * tools, widget chrome) defaults to Twomilia Cloud.
   */
  export let config: TwomiliaConfig;

  /** Optional: override the script source (e.g. a self-hosted twomilia.js). */
  export let src: string | undefined = undefined;

  // onMount only runs in the browser, so this is SSR-safe under SvelteKit.
  // loadTwomilia is itself a no-op on the server and idempotent on the
  // client (it never double-mounts the shadow-DOM widget).
  onMount(() => {
    loadTwomilia(config, src ? { src } : undefined);
  });
</script>

<!--
  This component renders no markup. The Twomilia runtime injects its own
  shadow-DOM chat widget overlay onto the page; the wrapper's only job is to
  call loadTwomilia(config) at the right (client-only) lifecycle moment.
-->
