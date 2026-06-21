# @twomilia/web

Thin, typed loader for the Twomilia web agent. It injects the runtime from the
CDN once and calls `Twomilia.init(config)` for you — the heavy agent stays on the
CDN (same model as `@stripe/stripe-js`). SSR-safe, framework-agnostic.

> Prefer a framework wrapper if you use one: **@twomilia/react**, **@twomilia/vue**,
> **@twomilia/angular**, **@twomilia/svelte**. They all build on this package.
> Pure `<script>` tag also still works — see the dashboard docs.

## Install

```bash
npm install @twomilia/web
```

## Use

```ts
import { loadTwomilia } from "@twomilia/web";

loadTwomilia({
  analyticsKey: "twomilia_pub_...",
  knowledgeBase: true,            // ground answers in your dashboard knowledge
  ignoreSelectors: ["#billing", "[data-pii]"],
  confirmSelectors: ["button.delete", "[type=submit]"],
  customTools: {
    track_order: {
      name: "track_order",
      description: "Look up delivery status by order number",
      parameters: { orderNumber: { type: "string" } },
      execute: async ({ orderNumber }) => {
        const o = await api.getOrder(orderNumber as string);
        return o
          ? { success: true, message: `${o.status} — arrives ${o.eta}` }
          : { success: false, message: "Order not found" };
      },
    },
  },
});
```

## API

| Export | Signature | Notes |
|---|---|---|
| `loadTwomilia` | `(config: TwomiliaConfig, options?: { src?: string }) => Promise<Twomilia \| undefined>` | Injects `twomilia.js` once, then `init(config)`. No-op on the server; idempotent (never double-mounts). |
| `isTwomiliaLoaded` | `() => boolean` | Whether the agent has been initialized on this page. |
| `TwomiliaConfig`, `TwomiliaTool` | types | Typed config + custom-action shape. |

`analyticsKey` (from **Dashboard → Setup & API Keys**) is the only required field;
`proxyUrl` / `serverUrl` default to Twomilia Cloud. Pass `options.src` to load a
self-hosted `twomilia.js`.

## SSR

`loadTwomilia` returns immediately (no-op) when `window` is undefined, so it's safe
to import anywhere — just call it from a client-only lifecycle (effect / onMounted /
`isPlatformBrowser`). The framework wrappers already do this for you.
