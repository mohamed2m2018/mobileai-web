var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { loadTwomilia } from '@twomilia/web';
/**
 * Injectable wrapper around the Twomilia web agent loader.
 *
 * The agent renders its own shadow-DOM chat widget overlay — this service does
 * NOT render any UI. It just injects `twomilia.js` (once, from the CDN) and
 * mounts the agent with your config at the right moment.
 *
 * SSR-safe: on the server (Angular Universal) `init` is a no-op, because the
 * underlying `loadTwomilia` already no-ops without `window`, and we additionally
 * guard with `isPlatformBrowser`.
 *
 * Idempotent: calling `init` more than once will not double-mount the widget —
 * the first config wins for the page's lifetime.
 */
let TwomiliaService = class TwomiliaService {
    constructor(platformId) {
        this.platformId = platformId;
    }
    /**
     * Load and mount the Twomilia agent with `config`.
     * Returns a promise that resolves once the agent is initialized (or
     * immediately with `undefined` on the server).
     */
    init(config) {
        if (!isPlatformBrowser(this.platformId)) {
            return Promise.resolve(undefined);
        }
        return loadTwomilia(config);
    }
};
TwomiliaService = __decorate([
    Injectable({ providedIn: 'root' }),
    __param(0, Inject(PLATFORM_ID)),
    __metadata("design:paramtypes", [Object])
], TwomiliaService);
export { TwomiliaService };
