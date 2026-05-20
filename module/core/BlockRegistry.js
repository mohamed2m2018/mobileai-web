"use strict";

import { createContext } from 'react';
function isPropTypeValid(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return !!value && typeof value === 'object' && !Array.isArray(value);
    default:
      return true;
  }
}
export class BlockRegistry {
  blocks = new Map();
  register(definition) {
    this.blocks.set(definition.name, definition);
  }
  registerMany(definitions) {
    definitions.forEach(definition => this.register(definition));
  }
  unregister(name) {
    this.blocks.delete(name);
  }
  clear() {
    this.blocks.clear();
  }
  get(name) {
    return this.blocks.get(name);
  }
  getAll() {
    return Array.from(this.blocks.values());
  }
  getForPlacement(placement) {
    return this.getAll().filter(definition => definition.allowedPlacements.includes(placement));
  }
  getAllowed(zoneAllowlist, placement) {
    const candidates = Array.isArray(zoneAllowlist) && zoneAllowlist.length > 0 ? zoneAllowlist : this.getAll();
    return placement ? candidates.filter(definition => definition.allowedPlacements.includes(placement)) : candidates;
  }
  validateProps(name, props) {
    const definition = this.get(name);
    if (!definition?.propSchema) {
      return {
        valid: true,
        errors: []
      };
    }
    const errors = [];
    for (const [key, spec] of Object.entries(definition.propSchema)) {
      const value = props[key];
      if (spec.required && value === undefined) {
        errors.push(`Missing required prop "${key}"`);
        continue;
      }
      if (value !== undefined && !isPropTypeValid(value, spec.type)) {
        errors.push(`Invalid prop "${key}": expected ${spec.type}`);
      }
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
export const globalBlockRegistry = new BlockRegistry();
export const BlockRegistryContext = /*#__PURE__*/createContext(globalBlockRegistry);
export function toBlockDefinition(component, defaults) {
  return {
    name: component.displayName || component.name,
    component,
    allowedPlacements: defaults?.allowedPlacements || ['chat', 'zone'],
    interventionEligible: defaults?.interventionEligible ?? false,
    interventionType: defaults?.interventionType ?? 'none',
    propSchema: defaults?.propSchema,
    previewTextBuilder: defaults?.previewTextBuilder,
    styleSlots: defaults?.styleSlots
  };
}
//# sourceMappingURL=BlockRegistry.js.map