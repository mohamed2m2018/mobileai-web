# @twomilia/angular

Thin Angular wrapper for the [Twomilia](https://twomilia.com) web agent.

The agent ships its own shadow-DOM chat widget overlay — this package does **not**
render any UI. It loads `twomilia.js` from the CDN (once, like Stripe.js) and
mounts the agent with your config. It's SSR-safe (Angular Universal) and
idempotent (it never double-mounts the widget).

## Install

```bash
npm install @twomilia/angular @twomilia/web
```

`@angular/core` and `@angular/common` are peer dependencies (Angular 16+).

## Usage

### Option A — `provideTwomilia` in `app.config.ts` (recommended)

Auto-inits the agent on bootstrap via `APP_INITIALIZER`. Best place for it: the
config stays in one spot and the widget is available everywhere.

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideTwomilia } from '@twomilia/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideTwomilia({
      // analyticsKey is the ONLY required field — get it from
      // Dashboard → Setup & API Keys. Proxy/server default to Twomilia Cloud.
      analyticsKey: 'twomilia_pub_xxx',

      // Ground answers in your dashboard knowledge base.
      knowledgeBase: true,

      // Named actions the agent can call inside your app.
      customTools: {
        applyCoupon: {
          name: 'applyCoupon',
          description: 'Apply a discount coupon to the current cart.',
          parameters: {
            code: { type: 'string', description: 'The coupon code', required: true },
          },
          execute: async ({ code }) => {
            const res = await fetch('/api/cart/coupon', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code }),
            });
            return res.ok
              ? { success: true, message: `Coupon ${code} applied.` }
              : { success: false, message: 'That coupon is not valid.' };
          },
        },
      },
    }),
  ],
};
```

For a non-standalone app, call it inside a module instead:

```ts
// app.module.ts
import { NgModule } from '@angular/core';
import { provideTwomilia } from '@twomilia/angular';

@NgModule({
  providers: [
    provideTwomilia({ analyticsKey: 'twomilia_pub_xxx', knowledgeBase: true }),
  ],
})
export class AppModule {}
```

### Option B — inject `TwomiliaService` in a component

Use this when you want to init the agent at a specific moment (e.g. only after
login, or once user details are known) instead of on bootstrap.

```ts
import { Component, OnInit, inject } from '@angular/core';
import { TwomiliaService } from '@twomilia/angular';

@Component({
  selector: 'app-shell',
  standalone: true,
  template: '<router-outlet />',
})
export class ShellComponent implements OnInit {
  private readonly twomilia = inject(TwomiliaService);

  ngOnInit() {
    // init() is a no-op on the server, so calling it here is SSR-safe.
    this.twomilia.init({
      analyticsKey: 'twomilia_pub_xxx',
      knowledgeBase: true,
      userContext: { userId: 'u_123', name: 'Ada Lovelace' },
      customTools: {
        applyCoupon: {
          name: 'applyCoupon',
          description: 'Apply a discount coupon to the current cart.',
          parameters: {
            code: { type: 'string', description: 'The coupon code', required: true },
          },
          execute: async ({ code }) =>
            ({ success: true, message: `Coupon ${code} applied.` }),
        },
      },
    });
  }
}
```

> Don't use both options for the same agent — `provideTwomilia` already inits on
> bootstrap, and the loader is idempotent, so a second `init` is ignored anyway.

## Config

`analyticsKey` is the only required field; everything else is optional. Common
options: `knowledgeBase`, `customTools`, `userContext`, `interactionMode`
(`'copilot'` | `'autopilot'`), `enableVoice`, `accentColor`, `headerTitle`,
`defaultOpen`. `proxyUrl` / `serverUrl` default to Twomilia Cloud. See the
[`TwomiliaConfig`](https://twomilia.com/docs) type (re-exported from this package)
for the full list.

## API

- `provideTwomilia(config)` → `EnvironmentProviders`. Add to your providers; inits
  the agent on bootstrap via `APP_INITIALIZER`.
- `TwomiliaService` → injectable; `init(config)` loads and mounts the agent.
  No-op on the server.
- Re-exported types: `TwomiliaConfig`, `TwomiliaTool`.

## SSR (Angular Universal)

Safe out of the box. `TwomiliaService.init` guards with `isPlatformBrowser` and
the underlying loader no-ops without `window`, so the agent only mounts in the
browser. Nothing renders or runs during server-side rendering.

## License

MIT
