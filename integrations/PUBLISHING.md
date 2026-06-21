# Publishing the Twomilia integration packages

Status of prep (already done):
- `@twomilia/web` (core) builds clean → `core/dist/` ✓ ; `npm pack --dry-run` = 3.7 kB, 5 files ✓
- React wrapper builds clean against the packed core ✓ (the vue/angular/svelte wrappers are structurally identical)
- Versions aligned to **0.1.0**; wrappers depend on `@twomilia/web@^0.1.0`

The only blocker is npm auth — that's a manual step (credentials can't be automated).

## 1. Log in to npm (you)

```bash
npm login            # use an account with publish rights to the @twomilia scope
npm whoami           # confirm
```

## 2. Publish the core FIRST

The framework wrappers depend on `@twomilia/web`, so it must exist on the registry
before they can be installed/published.

```bash
cd mobileai-web/integrations/core
npm run build
npm publish --access public
```

## 3. Publish the framework wrappers

Each needs its deps installed (the core resolves from npm now), then build + publish:

```bash
for pkg in react vue angular svelte; do
  cd mobileai-web/integrations/$pkg
  npm install
  npm run build
  npm publish --access public
  cd -
done
```

(Run them one at a time the first time so you can eyeball each `npm pack --dry-run`.)

## 4. WordPress (not npm)

Zip the plugin folder and distribute (WordPress.org submission, or hand the zip to users):

```bash
cd mobileai-web/integrations/wordpress
zip -r twomilia.zip twomilia
# upload twomilia.zip via WP admin → Plugins → Add New → Upload, or submit to WordPress.org
```

## 5. Shopify (not npm)

Theme app extension — deploy with the Shopify CLI from inside your Shopify app:

```bash
# from your Shopify app root (with the extension copied under extensions/)
shopify app deploy
# then merchants enable it: Theme editor → App embeds → Twomilia
```

## Notes
- Pre-publish, bump versions together if you change the config shape (core + all wrappers).
- `prepublishOnly` runs the build automatically for the wrappers; the core build is `npm run build`.
- Keep the runtime name separate: the heavy CDN source is `@twomilia/web-runtime` (NOT published as `@twomilia/web`).
