import {
  APP_INITIALIZER,
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import type { TwomiliaConfig } from '@twomilia/web';
import { TwomiliaService } from './twomilia.service';

/**
 * Provider helper that auto-initializes the Twomilia agent on app bootstrap.
 *
 * Drop it into your `ApplicationConfig.providers` (app.config.ts) and the agent
 * mounts automatically once the browser is ready. SSR-safe via TwomiliaService's
 * `isPlatformBrowser` guard.
 *
 * @example
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideTwomilia({ analyticsKey: 'twomilia_pub_xxx', knowledgeBase: true }),
 *   ],
 * };
 */
export function provideTwomilia(config: TwomiliaConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    TwomiliaService,
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (twomilia: TwomiliaService) => () => twomilia.init(config),
      deps: [TwomiliaService],
    },
  ]);
}
