# @twomilia/svelte

Thin [Svelte](https://svelte.dev) / [SvelteKit](https://kit.svelte.dev) wrapper for the [Twomilia](https://twomilia.com) web agent.

Drop one component into your app and the agent's chat widget mounts itself as a shadow-DOM overlay. The wrapper renders **no UI** of its own — it just loads `twomilia.js` (once, from the CDN, like Stripe.js) and initializes the agent with your config at the right client-only lifecycle moment.

## Install

```bash
npm install @twomilia/svelte
# @twomilia/web is pulled in automatically as a dependency
```

## Usage

Mount `<Twomilia />` once, near the root of your app. In SvelteKit, the root `src/routes/+layout.svelte` is the natural place so the agent is available on every page.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { Twomilia, type TwomiliaConfig } from '@twomilia/svelte';

  const config: TwomiliaConfig = {
    // Publishable key from Dashboard → Setup & API Keys (required).
    analyticsKey: 'twomilia_pub_xxx',

    // Ground answers in your dashboard knowledge (Settings → AI Knowledge).
    knowledgeBase: true,

    // Named actions the agent can call in your app.
    customTools: {
      addToCart: {
        name: 'addToCart',
        description: 'Add a product to the shopping cart by its SKU.',
        parameters: {
          sku: { type: 'string', description: 'Product SKU', required: true },
          quantity: { type: 'number', description: 'How many to add' },
        },
        async execute({ sku, quantity }) {
          // Read live app state and do the work here.
          await fetch('/api/cart', {
            method: 'POST',
            body: JSON.stringify({ sku, quantity: quantity ?? 1 }),
          });
          return { success: true, message: `Added ${sku} to the cart.` };
        },
      },
    },
  };
</script>

<Twomilia {config} />

<slot />
```

That's it. The agent's shadow-DOM widget appears on the page; the rest of your layout renders normally through the `<slot />`.

### Props

| Prop     | Type             | Description                                                        |
| -------- | ---------------- | ------------------------------------------------------------------ |
| `config` | `TwomiliaConfig` | Agent config. Only `analyticsKey` is required.                     |
| `src`    | `string?`        | Override the script source (e.g. a self-hosted `twomilia.js`).     |

## SvelteKit & SSR

This is **SSR-safe out of the box**. The component calls `loadTwomilia` inside `onMount`, and `onMount` callbacks only run in the browser — never during server-side rendering. `loadTwomilia` is also a no-op on the server and idempotent on the client (it never double-mounts the widget), so re-renders and navigations are safe.

If you call `loadTwomilia` **imperatively** instead of using the component (see below), guard it with the `browser` flag so it doesn't run during SSR:

```ts
import { browser } from '$app/environment';
import { loadTwomilia } from '@twomilia/svelte';

if (browser) {
  loadTwomilia({ analyticsKey: 'twomilia_pub_xxx' });
}
```

## Imperative loading

If you'd rather load the agent yourself (e.g. only after a user logs in, with a config you compute at runtime), import `loadTwomilia` directly and call it from a client-only context:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { loadTwomilia } from '@twomilia/svelte';

  export let user: { id: string; name: string; email: string };

  onMount(() => {
    loadTwomilia({
      analyticsKey: 'twomilia_pub_xxx',
      userContext: { userId: user.id, name: user.name, email: user.email },
    });
  });
</script>
```

`isTwomiliaLoaded()` is also re-exported if you need to check whether the agent has already been initialized on the page.

## License

MIT
