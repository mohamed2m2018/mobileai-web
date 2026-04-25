# @mobileai/web

Embedded AI support for first-party web apps.

`@mobileai/web` adds a DOM-aware AI agent to your React web app. It can understand the current page, guide users through flows, call app-registered actions, query live app data, render rich support UI, and escalate to a human operator through MobileAI Cloud.

## Highlights

- DOM-first screen understanding with no browser extension required
- React chat surface through `AIAgentWeb`
- UI actions for tap, type, select, scroll, date inputs, sliders, and guidance overlays
- `useAction` for app-owned commands like checkout, cancel subscription, or export report
- `useData` for live product, account, order, or analytics data
- `AIZoneWeb` for page regions that the agent can simplify, highlight, or enrich
- Rich block rendering for product cards, facts, comparisons, forms, and action cards
- Hosted MobileAI support, analytics, voice, CSAT, and escalation helpers

## Install

```bash
npm install @mobileai/web
```

If the npm package has not been published yet, install directly from GitHub:

```bash
npm install github:mohamed2m2018/mobileai-web
```

For local development in this workspace:

```json
{
  "dependencies": {
    "@mobileai/web": "file:../mobileai-web"
  }
}
```

Peer dependencies:

```bash
npm install react react-dom
```

## Quick Start

Wrap the app once, near your React root.

```tsx
import { AIAgentWeb } from "@mobileai/web";

export function Root() {
  return (
    <AIAgentWeb
      analyticsKey="mobileai_pub_your_key"
      instructions="You are a helpful in-product support agent."
    >
      <App />
    </AIAgentWeb>
  );
}
```

`analyticsKey` enables MobileAI hosted proxy, telemetry, support tickets, configured actions, and escalation workflows. For self-hosted LLM traffic, pass `proxyUrl` instead.

```tsx
<AIAgentWeb
  proxyUrl="/api/mobileai/ai"
  proxyHeaders={{ "x-client": "web" }}
>
  <App />
</AIAgentWeb>
```

Avoid shipping raw provider keys in production web apps. `apiKey` is useful for local prototypes only because browser bundles are inspectable.

## Register App Actions

Use `useAction` anywhere inside the `AIAgentWeb` tree. The agent can call these actions by name after it has enough context.

```tsx
import { useAction } from "@mobileai/web";

function BillingActions() {
  useAction(
    "download_invoice",
    "Download an invoice for the current customer",
    {
      invoiceId: "The invoice id shown on the billing page",
    },
    async ({ invoiceId }) => {
      await downloadInvoice(invoiceId);
      return { success: true, message: "Invoice downloaded." };
    },
  );

  return null;
}
```

Action handlers always receive the latest closure values, so they can safely read current React state.

## Register Live Data

Use `useData` when the agent should fetch structured information instead of guessing from visible text.

```tsx
import { useData } from "@mobileai/web";

function CatalogDataSource() {
  useData(
    "product_catalog",
    "Search the live product catalog",
    {
      query: "Search phrase or product name",
    },
    async ({ query }) => {
      return searchProducts(query);
    },
  );

  return null;
}
```

Good data sources include product catalogs, subscriptions, account settings, order status, inventory, internal docs, and entitlement checks.

## Use AI From Your UI

`useAI` lets you build your own entry points while reusing the same agent runtime.

```tsx
import { useAI } from "@mobileai/web";

function HelpButton() {
  const { send, isLoading, status } = useAI();

  return (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => send("Help me update my billing address")}
    >
      {isLoading ? status : "Ask MobileAI"}
    </button>
  );
}
```

## Mark AI Zones

`AIZoneWeb` marks a page region that the agent can target for simplification, highlighting, hints, and injected rich blocks.

```tsx
import { AIZoneWeb } from "@mobileai/web";

function CheckoutSummary() {
  return (
    <AIZoneWeb id="checkout-summary" allowHighlight allowSimplify allowInjectBlock>
      <aside>
        <h2>Order summary</h2>
        <p data-ai-priority="low">Promo explanations and secondary links</p>
        <button>Place order</button>
      </aside>
    </AIZoneWeb>
  );
}
```

When the agent simplifies a zone, children marked with `data-ai-priority="low"` can be hidden until the user restores them.

## Routing

Pass a router adapter so the agent can navigate using your app router instead of directly changing `window.location`.

```tsx
import { AIAgentWeb, type WebRouterAdapter } from "@mobileai/web";
import { useNavigate, useLocation } from "react-router-dom";

function MobileAIShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const routerAdapter: WebRouterAdapter = {
    push: navigate,
    replace: (href) => navigate(href, { replace: true }),
    back: () => window.history.back(),
    getCurrentScreenName: () => location.pathname,
    getAvailableScreens: () => ["/", "/billing", "/settings", "/support"],
  };

  return (
    <AIAgentWeb routerAdapter={routerAdapter} pathname={location.pathname}>
      {children}
    </AIAgentWeb>
  );
}
```

## Support Mode

With `analyticsKey`, MobileAI can create and restore support tickets, stream operator replies, and collect CSAT.

```tsx
<AIAgentWeb
  analyticsKey="mobileai_pub_your_key"
  userContext={{
    userId: "user_123",
    email: "sam@example.com",
    plan: "pro",
  }}
  supportMode={{
    enabled: true,
    allowEscalation: true,
  }}
>
  <App />
</AIAgentWeb>
```

## Voice

Enable voice when your MobileAI project or proxy is configured for realtime voice.

```tsx
<AIAgentWeb
  analyticsKey="mobileai_pub_your_key"
  enableVoice
>
  <App />
</AIAgentWeb>
```

For self-hosted voice traffic, pass `voiceProxyUrl` and `voiceProxyHeaders`.

## Rich Blocks

The package exports web-ready blocks and a renderer:

```tsx
import {
  ProductCardWeb,
  FactCardWeb,
  ActionCardWeb,
  ComparisonCardWeb,
  FormCardWeb,
  RichContentRendererWeb,
} from "@mobileai/web";
```

Use `blockActionHandlers` on `AIAgentWeb` when rich cards need to call app code.

```tsx
<AIAgentWeb
  blockActionHandlers={{
    add_to_cart: async ({ productId }) => addToCart(productId),
  }}
>
  <App />
</AIAgentWeb>
```

## Main Exports

```ts
import {
  AIAgentWeb,
  AIZoneWeb,
  WebPlatformAdapter,
  useAction,
  useData,
  useAI,
  RichUIProvider,
  VoiceService,
  CSATSurvey,
  buildSupportPrompt,
  createEscalateTool,
  createReportIssueTool,
  EscalationSocket,
} from "@mobileai/web";
```

## Security Notes

- Prefer `analyticsKey` or `proxyUrl` over browser-visible provider API keys.
- Keep destructive actions behind your app’s own authorization checks.
- Treat AI output as untrusted input when it crosses into backend systems.
- Register only actions and data sources that the agent is allowed to use.
- Use `allowedActionNames`, confirmation UX, and server-side permissions for sensitive workflows.

## Development

```bash
npm install
npm test
```

The test suite validates browser-safe package exports, DOM snapshotting, iframe and shadow DOM traversal, and web action execution.

## License

License terms are not included in this repository yet. Add a `LICENSE` file before publishing publicly.
