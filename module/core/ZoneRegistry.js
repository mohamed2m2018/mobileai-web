"use strict";

import { createContext } from 'react';
export class ZoneRegistry {
  zones = new Map();
  register(config, ref) {
    if (this.zones.has(config.id)) {
      console.warn(`[MobileAI] Zone ID "${config.id}" is already registered on this screen. Overwriting.`);
    }
    this.zones.set(config.id, {
      ...config,
      ref
    });
  }
  unregister(id) {
    this.zones.delete(id);
  }
  get(id) {
    return this.zones.get(id);
  }
  getAll() {
    return Array.from(this.zones.values());
  }
  isActionAllowed(zoneId, action) {
    const zone = this.get(zoneId);
    if (!zone) return false;
    switch (action) {
      case 'highlight':
        return !!zone.allowHighlight;
      case 'hint':
        return !!zone.allowInjectHint;
      case 'simplify':
        return !!zone.allowSimplify;
      case 'card':
        return !!zone.allowInjectCard || !!zone.allowInjectBlock;
      case 'block':
        return !!zone.allowInjectBlock || !!zone.allowInjectCard;
      default:
        return false;
    }
  }
}

// Global registry instance shared across the Agent session
export const globalZoneRegistry = new ZoneRegistry();

// Export context so AIZone components can register themselves
export const ZoneRegistryContext = /*#__PURE__*/createContext(globalZoneRegistry);
//# sourceMappingURL=ZoneRegistry.js.map