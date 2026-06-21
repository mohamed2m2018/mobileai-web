# Twomilia integrations

Thin wrappers around the Twomilia web agent. None of them bundle the runtime —
they load `twomilia.js` from the CDN once (like `@stripe/stripe-js`) and call
`Twomilia.init(config)` in each platform's idiomatic place. The agent renders its
own shadow-DOM chat overlay; the wrappers add **types** and **framework ergonomics**.

`analyticsKey` (from **Dashboard → Setup & API Keys**) is the only required field.
Everything else — `knowledgeBase`, `customTools`, `ignoreSelectors`,
`confirmSelectors`, `supportMode`, `userContext`, … — is optional and defaults to
Twomilia Cloud.

## Packages

| Platform | Path | Install / use |
|---|---|---|
| **Core loader** | [`core/`](./core) | `npm i @twomilia/web` → `loadTwomilia(config)` |
| **React / Next.js** | [`react/`](./react) | `npm i @twomilia/react @twomilia/web` → `<Twomilia config={…}/>` or `useTwomilia(config)` |
| **Vue 3 / Nuxt** | [`vue/`](./vue) | `npm i @twomilia/vue @twomilia/web` → `app.use(TwomiliaPlugin, config)` or `useTwomilia(config)` |
| **Angular** | [`angular/`](./angular) | `npm i @twomilia/angular @twomilia/web` → `provideTwomilia(config)` or `TwomiliaService` |
| **Svelte / SvelteKit** | [`svelte/`](./svelte) | `npm i @twomilia/svelte @twomilia/web` → `<Twomilia config={…}/>` |
| **WordPress** | [`wordpress/`](./wordpress) | Install the plugin → **Settings → Twomilia** → paste key |
| **Shopify** | [`shopify/`](./shopify) | Theme app extension → **Theme editor → App embeds → Twomilia** |
| **Plain `<script>`** | — | No package — see the dashboard docs (`/docs`) |

The JS packages (React/Vue/Angular/Svelte) all depend on the **core** (`@twomilia/web`),
so types and the loader stay consistent across frameworks. WordPress (PHP) and
Shopify (Liquid) load the CDN script directly and expose the same config through a
settings UI.

## Why thin (and not a bundled SDK)?

- The runtime updates on the CDN — apps don't re-publish to get fixes.
- Smaller install; no megabyte of agent code in your bundle.
- One source of truth for the agent; wrappers are ~30 lines each.

Same model Stripe uses: `@stripe/stripe-js` (thin loader) + `js.stripe.com` (runtime).

## SSR

`loadTwomilia` is a no-op when there's no `window`, and every wrapper only calls it
from a client-only lifecycle (`useEffect` / `onMounted` / `isPlatformBrowser` /
`onMount`). Safe to import in Next.js, Nuxt, Angular Universal, and SvelteKit.

## Knowledge base & custom actions

Both work through the same `config`:

```ts
loadTwomilia({
  analyticsKey: "twomilia_pub_...",
  knowledgeBase: true,              // ground answers in dashboard knowledge (RAG)
  customTools: {
    track_order: {
      name: "track_order",
      description: "Look up delivery status by order number",
      parameters: { orderNumber: { type: "string" } },
      execute: async ({ orderNumber }) => {
        const o = await api.getOrder(orderNumber);
        return o ? { success: true, message: `${o.status} — arrives ${o.eta}` }
                 : { success: false, message: "Order not found" };
      },
    },
  },
});
```

- **Knowledge base** content lives in the dashboard (Settings → AI Knowledge); the
  flag just turns on retrieval.
- **Custom actions** (`customTools`) are JS closures, so on WordPress/Shopify you
  register them from a small theme script (`window.TwomiliaCustomTools` on Shopify;
  a theme JS file on WordPress) — see each platform's README.
