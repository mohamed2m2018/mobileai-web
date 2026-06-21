# @twomilia/vue

Thin [Vue 3](https://vuejs.org/) wrapper for the **Twomilia** web agent.

The agent ships from the CDN (like Stripe.js) and mounts its **own shadow-DOM
chat overlay** — this package renders no UI of its own. It just loads
`twomilia.js` and initializes the agent with your config at the right,
client-only moment in the Vue lifecycle.

- `useTwomilia(config)` — a composable that loads the agent in `onMounted`.
- `TwomiliaPlugin` — a Vue plugin so `app.use(TwomiliaPlugin, config)` works.

Both are SSR-safe. `loadTwomilia` is already a no-op on the server, and this
wrapper only ever calls it from client-only paths.

## Install

```bash
npm install @twomilia/vue @twomilia/web vue
```

`@twomilia/web` is the shared loader core; `vue` is a peer dependency.

## Usage — composable

Call `useTwomilia` once, anywhere in your app (typically the root component).
Only `analyticsKey` is required — the proxy/server default to Twomilia Cloud.

```vue
<!-- App.vue -->
<script setup lang="ts">
import { useTwomilia, type TwomiliaConfig } from '@twomilia/vue'
import { cart } from './store'

const config: TwomiliaConfig = {
  // Required: your publishable key from Dashboard → Setup & API Keys.
  analyticsKey: 'twomilia_pub_xxx',

  // Ground answers in your dashboard knowledge base.
  knowledgeBase: true,

  // Named actions the agent can call in your app.
  customTools: {
    addToCart: {
      name: 'addToCart',
      description: 'Add a product to the shopping cart by its id.',
      parameters: {
        productId: { type: 'string', description: 'The product id to add.' },
        quantity: { type: 'number', description: 'How many.', required: false },
      },
      execute: async ({ productId, quantity }) => {
        cart.add(productId as string, (quantity as number) ?? 1)
        return { success: true, message: `Added ${productId} to cart` }
      },
    },
  },
}

useTwomilia(config)
</script>

<template>
  <!-- Your app. The Twomilia chat widget overlays itself automatically. -->
  <RouterView />
</template>
```

## Usage — plugin

Prefer installing once at the app root? Use the plugin form:

```ts
// main.ts
import { createApp } from 'vue'
import { TwomiliaPlugin } from '@twomilia/vue'
import App from './App.vue'

createApp(App)
  .use(TwomiliaPlugin, {
    analyticsKey: 'twomilia_pub_xxx',
    knowledgeBase: true,
    customTools: {
      addToCart: {
        name: 'addToCart',
        description: 'Add a product to the shopping cart by its id.',
        parameters: { productId: 'string' },
        execute: async ({ productId }) => {
          // ...your app logic...
          return { success: true, message: `Added ${productId} to cart` }
        },
      },
    },
  })
  .mount('#app')
```

Mounting from several components, or calling `.use()` more than once, will not
double-mount the overlay — the loader is idempotent.

## Nuxt

`twomilia.js` is browser-only, so it must load on the **client**, never during
SSR. Two idiomatic options:

**1. From a component (recommended).** `onMounted` only runs in the browser, so
`useTwomilia` is already safe inside any `<script setup>`:

```vue
<!-- app.vue or any layout/page -->
<script setup lang="ts">
import { useTwomilia } from '@twomilia/vue'

useTwomilia({ analyticsKey: 'twomilia_pub_xxx', knowledgeBase: true })
</script>
```

**2. As a client-only Nuxt plugin.** Name the file with a `.client.ts` suffix
so Nuxt only runs it in the browser:

```ts
// plugins/twomilia.client.ts
import { TwomiliaPlugin } from '@twomilia/vue'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(TwomiliaPlugin, {
    analyticsKey: 'twomilia_pub_xxx',
    knowledgeBase: true,
  })
})
```

If you instead register it from a **universal** plugin (no `.client` suffix),
guard the install with `process.client`:

```ts
// plugins/twomilia.ts
import { TwomiliaPlugin } from '@twomilia/vue'

export default defineNuxtPlugin((nuxtApp) => {
  if (process.client) {
    nuxtApp.vueApp.use(TwomiliaPlugin, { analyticsKey: 'twomilia_pub_xxx' })
  }
})
```

## Config

`useTwomilia` / `TwomiliaPlugin` accept the full `TwomiliaConfig` from
`@twomilia/web`. Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `analyticsKey` | `string` | **Required.** Publishable key (`twomilia_pub_…`). |
| `knowledgeBase` | `boolean` | Ground answers in your dashboard knowledge. |
| `customTools` | `Record<string, TwomiliaTool>` | Named actions the agent can call. |
| `userContext` | `{ userId?, name?, email?, … }` | Personalize support. |
| `interactionMode` | `'copilot' \| 'autopilot'` | How the agent acts. |
| `enableVoice` / `enableWebSearch` | `boolean` | Optional capabilities. |
| `accentColor` / `headerTitle` / `inputPlaceholder` / `defaultOpen` | — | Widget chrome. |
| `model` / `maxSteps` / `debug` | — | Tuning. |
| `proxyUrl` / `serverUrl` / `useServerRuntime` | — | Advanced / self-host (default: Twomilia Cloud). |

`TwomiliaConfig` and `TwomiliaTool` are re-exported for convenience:

```ts
import type { TwomiliaConfig, TwomiliaTool } from '@twomilia/vue'
```

## License

MIT
