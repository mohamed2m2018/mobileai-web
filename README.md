# @mobileai/web

React web SDK for MobileAI Cloud by Twomilia.

`@mobileai/web` embeds a DOM-aware AI support agent in React applications. It can inspect the current page, explain what the user is seeing, guide them through workflows, fill forms, select controls, scroll containers, call app-owned actions, query live data sources, render rich UI blocks, and escalate to a human operator through MobileAI Cloud by Twomilia.

Use it when a normal chatbot is not enough because the user needs help inside the actual product UI.

The canonical product domain is `https://mobileai.cloud`. Use `MobileAI Cloud by Twomilia` for public copy, `MobileAI Cloud` for short product references, and `Twomilia` for the company name.

## Why MobileAI Cloud for Web

Most support widgets sit beside your app. MobileAI Cloud works inside it.

- Understands visible DOM structure, labels, forms, tables, buttons, links, iframes, and shadow roots
- Executes UI actions such as tap, type, select, scroll, slider adjustment, date input, navigation, and guided highlights
- Registers safe app actions with `useAction`, so the agent can trigger product logic instead of scraping
- Registers live data sources with `useData`, so the agent can answer using real product, account, order, or billing data
- Supports AI zones that can be highlighted, simplified, restored, or enriched with rich blocks
- Includes support workflows for human escalation, ticket restore, operator replies, CSAT, and voice
- Ships browser-safe root exports for React web apps

## Install

```bash
npm install @mobileai/web
```

Peer dependencies:

```bash
npm install react react-dom
```

## Quick Start

Wrap your app once near the React root.

```tsx
import { AIAgent } from "@mobileai/web";

export function Root() {
  return (
    <AIAgent
      analyticsKey="mobileai_pub_your_key"
      instructions="You are a helpful in-product support agent."
    >
      <App />
    </AIAgent>
  );
}
```

The agent renders a web chat surface by default and builds screen context from the live document. Users can ask things like:

- "Help me update my billing address"
- "Why can’t I submit this form?"
- "Find the failed webhook and show me what went wrong"
- "Export this report"
- "I need a human"

## Next.js App Router

`AIAgent` is a client component. In Next.js App Router, create a small client shell.

```tsx
// app/mobileai-provider.tsx
"use client";

import { AIAgent } from "@mobileai/web";
import { usePathname, useRouter } from "next/navigation";

export function MobileAIProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <AIAgent
      analyticsKey={process.env.NEXT_PUBLIC_MOBILEAI_KEY}
      pathname={pathname}
      routerAdapter={{
        push: router.push,
        replace: router.replace,
        back: router.back,
        getCurrentScreenName: () => pathname,
        getAvailableScreens: () => [
          "/",
          "/dashboard",
          "/dashboard/billing",
          "/dashboard/settings",
        ],
      }}
    >
      {children}
    </AIAgent>
  );
}
```

Then wrap your layout:

```tsx
// app/layout.tsx
import { MobileAIProvider } from "./mobileai-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MobileAIProvider>{children}</MobileAIProvider>
      </body>
    </html>
  );
}
```

## Configuration Modes

### MobileAI Cloud by Twomilia

Use `analyticsKey` for the hosted MobileAI Cloud proxy, analytics, configured actions, knowledge retrieval, support tickets, escalation, and voice.

```tsx
<AIAgent analyticsKey="mobileai_pub_your_key">
  <App />
</AIAgent>
```

### Self-hosted Proxy

Use `proxyUrl` if your backend owns provider keys and model calls.

```tsx
<AIAgent
  proxyUrl="/api/mobileai/chat"
  proxyHeaders={{ "x-tenant-id": tenantId }}
>
  <App />
</AIAgent>
```

### Local Prototype

`apiKey` is supported for local experiments, but do not ship browser-visible provider keys in production.

```tsx
<AIAgent provider="gemini" apiKey={import.meta.env.VITE_GEMINI_API_KEY}>
  <App />
</AIAgent>
```

## Core Props

```tsx
<AIAgent
  analyticsKey="mobileai_pub_your_key"
  model="gemini-2.5-flash"
  instructions="Use concise, friendly product-support language."
  maxSteps={12}
  interactionMode="copilot"
  enableUIControl
  showChat
  defaultOpen={false}
  inputPlaceholder="Ask for help..."
  userContext={{
    userId: "user_123",
    email: "sam@example.com",
    plan: "pro",
    custom: { accountId: "acct_456" },
  }}
>
  <App />
</AIAgent>
```

Common props:

| Prop | Purpose |
| --- | --- |
| `analyticsKey` | Enables MobileAI Cloud by Twomilia features and hosted proxy |
| `proxyUrl` | Self-hosted text proxy URL |
| `voiceProxyUrl` | Self-hosted voice proxy URL |
| `instructions` | Product-specific agent instructions |
| `routerAdapter` | Navigation bridge for your router |
| `pathname` | Current route/screen name |
| `customTools` | Low-level tools exposed to the runtime |
| `enableUIControl` | Allows the agent to interact with the UI |
| `interactionMode` | `copilot` for confirmation-aware behavior or `autopilot` for full autonomy |
| `supportMode` | Customer support persona and escalation config |
| `userContext` | User metadata for support, telemetry, and personalization |
| `theme` | Global rich UI theme override |
| `surfaceThemes` | Per-surface theme overrides for chat, zones, and support |
| `blockActionHandlers` | Handlers for rich block button actions |

## Register App Actions

Use `useAction` for things your app should do directly: export data, open modals, apply filters, update preferences, start checkout, create tickets, cancel subscriptions, or trigger any product workflow.

```tsx
import { useAction } from "@mobileai/web";

function BillingActions() {
  useAction(
    "download_invoice",
    "Download an invoice for the current customer",
    {
      invoiceId: {
        type: "string",
        description: "Invoice id shown in the billing table",
        required: true,
      },
    },
    async ({ invoiceId }) => {
      await downloadInvoice(invoiceId);
      return {
        success: true,
        message: `Invoice ${invoiceId} downloaded.`,
      };
    },
  );

  useAction(
    "open_cancel_plan_modal",
    "Open the cancel plan confirmation modal",
    {},
    () => {
      openCancelPlanModal();
      return "Cancel plan modal opened.";
    },
  );

  return null;
}
```

Handlers stay fresh across renders, so they can safely read current React state.

## Register Live Data

Use `useData` when the agent should query structured app data instead of inferring from visible UI.

```tsx
import { useData } from "@mobileai/web";

function ProductDataSources() {
  useData(
    "product_catalog",
    "Search the live product catalog",
    {
      query: "Search phrase, product name, SKU, or category",
    },
    async ({ query }) => {
      return searchProducts(query);
    },
  );

  useData(
    "order_status",
    "Look up the signed-in user's order status",
    {
      query: "Order id or natural language lookup",
    },
    async ({ query }) => {
      return getOrderStatus(query);
    },
  );

  return null;
}
```

Good data sources include:

- Product catalogs and pricing
- Billing plans, invoices, and subscriptions
- Order status and shipment events
- Account settings and permissions
- Feature flags and entitlements
- Internal docs and troubleshooting guides
- Analytics summaries and operational metrics

## Build Custom AI Entry Points

`useAI` lets you trigger the same runtime from your own UI.

```tsx
import { useAI } from "@mobileai/web";

function HelpButton() {
  const { send, isLoading, status, cancel } = useAI();

  return (
    <div>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => send("Help me update my billing address")}
      >
        {isLoading ? status || "Working..." : "Ask MobileAI"}
      </button>

      {isLoading ? (
        <button type="button" onClick={cancel}>
          Cancel
        </button>
      ) : null}
    </div>
  );
}
```

You can also hide the default chat and ship a fully custom surface.

```tsx
<AIAgent analyticsKey="mobileai_pub_your_key" showChat={false}>
  <App />
  <CustomAssistantLauncher />
</AIAgent>
```

## AI Zones

`AIZoneWeb` marks a region that can be targeted by the agent. Zones are useful for dense forms, dashboards, checkout summaries, billing panels, and settings pages.

```tsx
import { AIZoneWeb } from "@mobileai/web";

function CheckoutSummary() {
  return (
    <AIZoneWeb
      id="checkout-summary"
      allowHighlight
      allowSimplify
      allowInjectBlock
      allowInjectCard
    >
      <aside>
        <h2>Order summary</h2>
        <p data-ai-priority="low">
          Secondary promotion copy and optional legal text.
        </p>
        <button>Place order</button>
      </aside>
    </AIZoneWeb>
  );
}
```

When the agent simplifies a zone, children marked with `data-ai-priority="low"` can be hidden until restored. The agent can also inject cards and rich blocks into eligible zones.

## Rich Blocks

The web SDK includes rich UI blocks for product, fact, action, comparison, and form content.

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

Wire block actions back into your app with `blockActionHandlers`.

```tsx
<AIAgent
  analyticsKey="mobileai_pub_your_key"
  blockActionHandlers={{
    add_to_cart: async ({ productId }) => {
      await addToCart(productId);
      return { success: true };
    },
    open_plan: async ({ planId }) => {
      navigate(`/billing/plans/${planId}`);
    },
  }}
>
  <App />
</AIAgent>
```

## Routing

Give the agent your router API so it can navigate safely.

### React Router

```tsx
import { AIAgent, type WebRouterAdapter } from "@mobileai/web";
import { useLocation, useNavigate } from "react-router-dom";

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
    <AIAgent routerAdapter={routerAdapter} pathname={location.pathname}>
      {children}
    </AIAgent>
  );
}
```

### Custom Router

```tsx
const routerAdapter = {
  push: (href: string) => appRouter.go(href),
  replace: (href: string) => appRouter.replace(href),
  back: () => appRouter.back(),
  navigate: (screen: string, params?: unknown) => {
    appRouter.go(resolveScreen(screen, params));
  },
  resolveHref: (screen: string, params?: unknown) => resolveScreen(screen, params),
  getCurrentScreenName: () => appRouter.currentRoute,
  getAvailableScreens: () => appRouter.routes.map((route) => route.path),
};
```

## Support Mode

Support mode changes the assistant into an in-product customer support agent. With `analyticsKey`, it can create MobileAI Cloud tickets, restore open tickets, stream operator replies, report issues, and collect CSAT.

```tsx
<AIAgent
  analyticsKey="mobileai_pub_your_key"
  userContext={{
    userId: "user_123",
    name: "Sam Lee",
    email: "sam@example.com",
    plan: "pro",
  }}
  supportMode={{
    enabled: true,
    greeting: {
      agentName: "MobileAI Support",
      message: "Hi Sam, how can I help today?",
    },
    quickReplies: [
      { label: "Billing issue" },
      { label: "App is stuck" },
      { label: "Talk to a human" },
    ],
    escalation: {
      provider: "mobileai",
      buttonLabel: "Talk to a human",
    },
    csat: {
      enabled: true,
      onSubmit: (rating) => console.log("CSAT", rating),
    },
    persona: {
      preset: "warm-concise",
      agentName: "MobileAI",
      tone: "empathetic",
    },
  }}
>
  <App />
</AIAgent>
```

For Intercom, Zendesk, or your own support backend, use a custom escalation handler.

```tsx
<AIAgent
  supportMode={{
    enabled: true,
    escalation: {
      provider: "custom",
      onEscalate: (context) => {
        openSupportWidget({
          summary: context.conversationSummary,
          screen: context.currentScreen,
          originalQuery: context.originalQuery,
        });
      },
    },
  }}
>
  <App />
</AIAgent>
```

## Voice

Enable voice when your MobileAI project or proxy supports realtime voice.

```tsx
<AIAgent analyticsKey="mobileai_pub_your_key" enableVoice>
  <App />
</AIAgent>
```

For self-hosted voice traffic:

```tsx
<AIAgent
  proxyUrl="/api/mobileai/chat"
  voiceProxyUrl="/api/mobileai/voice"
  voiceProxyHeaders={{ "x-session-id": sessionId }}
  enableVoice
>
  <App />
</AIAgent>
```

## Theming

Use `theme` for global rich UI overrides and `surfaceThemes` when chat, zones, and support should look different.

```tsx
<AIAgent
  theme={{
    colors: {
      primaryAccent: "#2563eb",
      ctaAccent: "#111827",
      linkText: "#2563eb",
    },
    shape: {
      cardRadius: 10,
      controlRadius: 8,
    },
  }}
  surfaceThemes={{
    support: {
      colors: {
        chatCanvas: "#f8fafc",
        assistantBubble: "#ffffff",
      },
    },
  }}
>
  <App />
</AIAgent>
```

## Screenshots

The web SDK can work from DOM structure alone. If you want to provide screenshots to the model, pass `captureScreenshot`.

```tsx
<AIAgent
  captureScreenshot={async () => {
    const canvas = await captureVisiblePage();
    return canvas.toDataURL("image/jpeg", 0.8);
  }}
>
  <App />
</AIAgent>
```

Return a data URL or base64-compatible image string from your capture function.

## Production Checklist

- Use `analyticsKey` or `proxyUrl`; do not ship raw provider API keys in production.
- Keep destructive actions protected by your app’s existing permission checks.
- Use `interactionMode="copilot"` for workflows that need user confirmation.
- Register only actions and data sources the agent should actually use.
- Prefer `useAction` for business operations instead of relying on DOM clicks alone.
- Pass `userContext.userId` for ticket restore, telemetry, and support continuity.
- Provide a router adapter so navigation remains inside your app’s routing rules.
- Add `AIZoneWeb` around complex workflows the agent should simplify or enrich.
- Treat all AI output as untrusted when it crosses into backend systems.

## Troubleshooting

### The agent cannot see a control

Make sure the control has visible text, an accessible label, `aria-label`, `title`, or nearby label text. Custom controls should expose semantic roles where possible.

### The agent cannot navigate

Pass `routerAdapter` and `pathname`. Also provide `getAvailableScreens` if your routes are not obvious from the current page.

### The package imports fail in SSR

Render `AIAgent` from a client-only boundary. In Next.js App Router, add `"use client"` to the provider component that imports `@mobileai/web`.

### Actions are not available

`useAction` and `useData` must run inside the `AIAgent` tree. Mount action/data registration components on pages where the actions should be available.

### Human escalation does not create tickets

Check that `analyticsKey` is present, `supportMode.enabled` is true, and the project is configured in MobileAI Cloud by Twomilia.

### Voice does not connect

Check microphone permissions, `enableVoice`, and either `analyticsKey` or `voiceProxyUrl`.

## Main Exports

```ts
import {
  AIAgent,
  AIZoneWeb,
  AIZoneWebStateContext,
  RichContentRendererWeb,
  WebPlatformAdapter,
  ProductCardWeb,
  FactCardWeb,
  ActionCardWeb,
  ComparisonCardWeb,
  FormCardWeb,
  webBlockDefinitions,
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

## Development

```bash
npm install
npm test
```

The test suite validates browser-safe package exports, DOM snapshotting, iframe and shadow DOM traversal, and web action execution.

## License

License terms are not included in this repository yet.
