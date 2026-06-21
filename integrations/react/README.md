# @twomilia/react

Thin React wrapper for the [Twomilia](https://twomilia.com) web agent.

It does **not** render any UI of its own — the agent injects its own
shadow-DOM chat widget overlay. This package just loads `twomilia.js`
(once, from the CDN, like Stripe.js) and initializes the agent with your
config at the right point in the React lifecycle.

- `useTwomilia(config)` — a hook that loads the agent once on mount.
- `<Twomilia config={...} />` — a component that renders `null` and uses the hook.

The loader is **SSR-safe** (a no-op on the server) and **idempotent**
(the widget is never mounted twice — the first config wins for the page's lifetime).

## Install

```bash
npm install @twomilia/react @twomilia/web
```

`react` (>=17) is a peer dependency you already have in your app.

## Usage

Drop `<Twomilia />` anywhere in your tree. `analyticsKey` is the only required
field — everything else (proxy/server) defaults to Twomilia Cloud. Here we also
ground answers in your dashboard knowledge base and expose a custom action the
agent can call:

```tsx
import { Twomilia } from '@twomilia/react';

export default function App() {
  return (
    <>
      {/* ...your app... */}

      <Twomilia
        config={{
          analyticsKey: 'twomilia_pub_xxx',

          // Ground answers in your dashboard knowledge (Settings -> AI Knowledge).
          knowledgeBase: true,

          // Named actions the agent can call.
          customTools: {
            createOrder: {
              name: 'createOrder',
              description: 'Place an order for the given product and quantity.',
              parameters: {
                product: { type: 'string', description: 'Product name' },
                quantity: { type: 'number', description: 'How many', required: false },
              },
              execute: async ({ product, quantity }) => {
                await myApi.createOrder(product as string, (quantity as number) ?? 1);
                return { success: true, message: `Ordered ${product}` };
              },
            },
          },
        }}
      />
    </>
  );
}
```

Prefer a hook? Same effect, no element:

```tsx
import { useTwomilia } from '@twomilia/react';

export function Agent() {
  useTwomilia({ analyticsKey: 'twomilia_pub_xxx', knowledgeBase: true });
  return null;
}
```

> Pass your **final** config on first render. Because the underlying loader is
> idempotent, changing the config object later will not re-initialize the widget.

## Next.js

Both `useTwomilia` and `<Twomilia />` use React hooks and touch `window`, so they
must run on the **client** — never during server rendering.

In the **App Router**, put `<Twomilia />` inside a Client Component:

```tsx
// app/twomilia.tsx
'use client';

import { Twomilia } from '@twomilia/react';

export function TwomiliaAgent() {
  return <Twomilia config={{ analyticsKey: 'twomilia_pub_xxx', knowledgeBase: true }} />;
}
```

```tsx
// app/layout.tsx (a Server Component — that's fine, the child is a client component)
import { TwomiliaAgent } from './twomilia';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <TwomiliaAgent />
      </body>
    </html>
  );
}
```

Alternatively, call `useTwomilia` inside a `'use client'` component / `useEffect`.
Don't call either API during SSR — the loader will simply no-op there, but the
hook itself belongs in a client component.

In the **Pages Router**, importing and rendering `<Twomilia />` in any page works
out of the box (the effect only runs in the browser).

## API

### `useTwomilia(config: TwomiliaConfig): void`

Loads `twomilia.js` and initializes the agent once, inside `useEffect([])`.

### `<Twomilia config={config} />`

Renders `null`; calls `useTwomilia(config)` internally.

`TwomiliaConfig` and `TwomiliaTool` are re-exported from `@twomilia/web` for
convenience:

```ts
import type { TwomiliaConfig, TwomiliaTool } from '@twomilia/react';
```

See [`@twomilia/web`](https://www.npmjs.com/package/@twomilia/web) for the full
config surface (support mode, voice, web search, theming, self-host proxy, etc.).
