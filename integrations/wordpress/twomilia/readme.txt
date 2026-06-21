=== Twomilia AI Agent ===
Contributors: twomilia
Tags: ai, agent, chatbot, customer support, copilot
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.2
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add the Twomilia AI agent (in-page copilot + customer-support widget) to your WordPress site with a single Analytics Key. Thin CDN loader — no build step.

== Description ==

Twomilia is an AI agent that reads your page, answers questions, and can drive the
UI on the user's behalf. This plugin is a **thin loader**: it does not bundle the
agent runtime. Instead it loads `twomilia.js` from the Twomilia CDN (like Stripe.js)
and calls `Twomilia.init({...})` with the configuration you save under
**Settings → Twomilia**.

The agent renders its own shadow-DOM chat overlay, so there is nothing to place in
your theme templates — activate, paste your key, done.

**Features configurable from the admin page**

* **Analytics Key** (required) — your publishable `twomilia_pub_…` key.
* **Knowledge base** — ground answers in your dashboard knowledge base.
* **Ignore selectors** — CSS selectors hidden from the agent (and their children).
* **Confirm selectors** — CSS selectors that force an approval prompt before the
  agent acts on them.

Proxy / server endpoints default to **Twomilia Cloud**; no extra configuration is
needed for the hosted setup.

== Installation ==

1. Download the plugin zip (`twomilia.zip`). It must contain a top-level `twomilia/`
   folder with `twomilia.php` and `readme.txt` inside.
2. In WordPress admin, go to **Plugins → Add New → Upload Plugin**.
3. Choose `twomilia.zip`, click **Install Now**, then **Activate**.
4. Go to **Settings → Twomilia**, paste your **Analytics Key**, adjust the
   optional fields, and click **Save Changes**.
5. Visit any front-end page — the Twomilia chat widget appears automatically.

Manual install (alternative): unzip and upload the `twomilia/` folder to
`wp-content/plugins/`, then activate from **Plugins**.

== Frequently Asked Questions ==

= Where do I get an Analytics Key? =

From your Twomilia Dashboard → **Setup & API Keys**. It looks like `twomilia_pub_…`.
It is a publishable key and is safe to expose in front-end HTML.

= The widget isn't showing up. =

Make sure an Analytics Key is saved under **Settings → Twomilia**. The plugin does
not enqueue anything until a key is present. Also confirm your theme calls
`wp_footer()` (all standard themes do) since the script loads in the footer.

= Can I self-host twomilia.js? =

Yes. Define the source in `wp-config.php` before the plugin loads:

`define( 'TWOMILIA_SCRIPT_SRC', 'https://cdn.example.com/twomilia.js' );`

= How do I add custom tools (custom JS actions)? =

Custom tools have JavaScript `execute` closures, which **cannot be expressed in PHP**
(WordPress options store data, not functions). So register them from a small theme
script that calls `Twomilia.init()` with your tools.

`Twomilia.init` is **idempotent — the first call wins for the page's lifetime**.
So enqueue your tool script with **higher priority** (earlier) than this plugin so
your fuller config is the one that mounts. Practically: hook `wp_enqueue_scripts`
at a priority lower than 10 (the plugin uses the default 10), load `twomilia.js` as
a dependency, and init there.

Example — drop this in your theme's `functions.php`:

`<?php`
`add_action( 'wp_enqueue_scripts', function () {`
`    // Load the same CDN runtime, then init with tools BEFORE the plugin does.`
`    wp_enqueue_script( 'twomilia', 'https://twomilia.com/twomilia.js', array(), null, true );`
`    wp_add_inline_script( 'twomilia', file_get_contents( get_stylesheet_directory() . '/js/twomilia-tools.js' ), 'after' );`
`}, 5 ); // priority 5 < plugin's 10, so this init wins`
`?>`

And `wp-content/themes/your-theme/js/twomilia-tools.js`:

`if (window.Twomilia && typeof window.Twomilia.init === 'function') {`
`  window.Twomilia.init({`
`    analyticsKey: 'twomilia_pub_…',`
`    knowledgeBase: true,`
`    confirmSelectors: ['.checkout-submit'],`
`    customTools: {`
`      addToCart: {`
`        name: 'addToCart',`
`        description: 'Add a product to the cart by its SKU.',`
`        parameters: {`
`          sku: { type: 'string', description: 'Product SKU', required: true },`
`          qty: { type: 'number', description: 'Quantity', required: false }`
`        },`
`        execute: async (args) => {`
`          const res = await fetch('/wp-json/store/v1/cart/add', {`
`            method: 'POST',`
`            headers: { 'Content-Type': 'application/json' },`
`            body: JSON.stringify(args)`
`          });`
`          return { success: res.ok, message: res.ok ? 'Added to cart' : 'Failed' };`
`        }`
`      }`
`    }`
`  });`
`}`

Alternatively, use the `twomilia_init_config` PHP filter to add any
serializable `TwomiliaConfig` field (userContext, accentColor, headerTitle,
supportMode, interactionMode, …) — anything that is plain data rather than a
function:

`<?php`
`add_filter( 'twomilia_init_config', function ( $config ) {`
`    $config['accentColor'] = '#6c5ce7';`
`    $config['headerTitle'] = 'Ask us anything';`
`    if ( is_user_logged_in() ) {`
`        $u = wp_get_current_user();`
`        $config['userContext'] = array(`
`            'userId' => (string) $u->ID,`
`            'name'   => $u->display_name,`
`            'email'  => $u->user_email,`
`        );`
`    }`
`    return $config;`
`} );`
`?>`

== Changelog ==

= 1.0.0 =
* Initial release: admin settings page (Analytics Key, knowledge base, ignore /
  confirm selectors), footer enqueue of twomilia.js, idempotent `Twomilia.init`,
  nonce-protected settings form, and the `twomilia_init_config` filter.
