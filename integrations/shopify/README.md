# Twomilia for Shopify (theme app extension)

This is a **theme app extension** that adds the [Twomilia](https://twomilia.com) AI
agent to your storefront as an **app embed**. The agent renders its own shadow-DOM
chat widget overlay — this extension adds **no markup to your theme layout**. It
only loads `twomilia.js` from the CDN (once, like Stripe.js) and calls
`Twomilia.init(...)` with the settings a merchant configures in the theme editor.

The only required setting is your **Analytics Key** (`twomilia_pub_…`). The proxy /
server default to **Twomilia Cloud**, so there is nothing else to host.

```
shopify/
└── extensions/
    └── twomilia/
        ├── shopify.extension.toml      # type = "theme" extension manifest
        └── blocks/
            └── twomilia.liquid         # the app-embed block
```

---

## Prerequisites

- A Shopify Partner account and a development (or production) store.
- A Shopify app to attach this extension to. If you don't have one, create it with
  `shopify app init` (or in the Partner Dashboard). Theme app extensions are
  delivered through an app.
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) installed:
  ```bash
  npm install -g @shopify/cli @shopify/theme
  ```
- Your Twomilia **Analytics Key** from **Dashboard → Setup & API Keys**.

---

## Deploy with Shopify CLI

Run these from the directory that contains your app's `shopify.app.toml`
(this `shopify/` folder lives alongside it, or move `extensions/twomilia` under
your app's `extensions/` directory).

1. **Link the app** (first time only):
   ```bash
   shopify app config link
   ```

2. **Preview locally** against a dev store (hot-reloads the extension):
   ```bash
   shopify app dev
   ```

3. **Deploy** a new version to Shopify:
   ```bash
   shopify app deploy
   ```
   This uploads the `twomilia` theme app extension. Releasing the app version makes
   the embed available to stores that have your app installed.

---

## Enable the app embed in the theme editor

App embeds are **off by default** — the merchant turns them on per theme. After the
app is installed on the store:

1. In the Shopify admin go to **Online Store → Themes**.
2. On your live (or a duplicated) theme click **Customize** to open the theme editor.
3. In the left sidebar click the **App embeds** icon (the puzzle-piece / toggle at
   the bottom).
4. Find **Twomilia** in the list and toggle it **on**.
5. Expand it and paste your **Analytics Key**. Optionally toggle **Use knowledge
   base** and pick an **Accent color**.
6. Click **Save**.

The agent loads on the storefront. (As an extra guard the block stays a no-op until
an Analytics Key is filled in, so saving with an empty key changes nothing.)

Deep link to preselect the embed for merchants:
```
https://{store}.myshopify.com/admin/themes/current/editor?context=apps&template=index&activateAppId={uuid}/twomilia
```
(`{uuid}` is your app's extension UUID, shown in `shopify app deploy` output.)

---

## Settings reference

| Setting (theme editor) | `Twomilia.init` field | Notes |
| --- | --- | --- |
| Analytics Key | `analyticsKey` | Required. `twomilia_pub_…` |
| Use knowledge base | `knowledgeBase` | Ground answers in dashboard knowledge |
| Accent color | `accentColor` | Widget primary color |

The block intentionally exposes a minimal set of settings. Every other
`TwomiliaConfig` option (`headerTitle`, `interactionMode`, `confirmSelectors`,
`userContext`, `enableVoice`, `model`, …) can be added either by extending the
`{% schema %}` in `blocks/twomilia.liquid` or via the `customTools` hook below.

---

## Adding `customTools`

Custom tools are named actions the agent can call (e.g. "track an order",
"apply a discount"). Their `execute` functions are JavaScript, so they can't live in
the block's `{% schema %}`. Two patterns:

### Option A — inline in the block (quick)

Edit `blocks/twomilia.liquid` and set `config.customTools` directly inside the
`<script>`, before `Twomilia.init` runs. There is a commented example in the file.

### Option B — a theme snippet (recommended)

Keep your tool code out of the generated block by defining the tools on
`window.TwomiliaCustomTools` **before** the embed mounts. The block already picks
this up automatically:

```liquid
if (window.TwomiliaCustomTools) {
  config.customTools = window.TwomiliaCustomTools;
}
```

Create `snippets/twomilia-tools.liquid` in your theme:

```liquid
{%- comment -%} snippets/twomilia-tools.liquid {%- endcomment -%}
<script>
  window.TwomiliaCustomTools = {
    trackOrder: {
      name: 'trackOrder',
      description: 'Look up the status of an order by its number.',
      parameters: {
        orderNumber: { type: 'string', description: 'The order number, e.g. 1042', required: true }
      },
      execute: function (args) {
        return fetch('/apps/your-app/track?order=' + encodeURIComponent(args.orderNumber))
          .then(function (r) { return r.json(); })
          .then(function (data) { return { success: true, message: data.status }; })
          .catch(function () { return { success: false, message: 'Could not reach the order service.' }; });
      }
    }
  };
</script>
```

Then render it ahead of the agent (it must run before `Twomilia.init`). The
simplest place is just before `</head>` in `layout/theme.liquid`:

```liquid
{% render 'twomilia-tools' %}
```

Because the app embed targets `head` and reads `window.TwomiliaCustomTools` at init
time, defining the tools earlier in `<head>` guarantees they're registered when the
agent mounts.

---

## Notes

- **One mount per page.** `twomilia.js` is loaded once (`data-twomilia-loader`) and
  `Twomilia.init` is guarded so the widget never double-mounts, even if the embed
  re-renders.
- **No server to run.** Proxy and server default to Twomilia Cloud. Only set the
  advanced `proxyUrl` / `serverUrl` fields (by extending the block) if you
  self-host the runtime.
- **App embeds are global.** Enabling it loads the agent on every storefront page.
  Use Twomilia's `ignoreSelectors` / `confirmSelectors` (add them to the schema +
  config) to fence off areas the agent shouldn't touch.
