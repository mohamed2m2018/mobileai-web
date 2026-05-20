"use strict";

/**
 * A central registry for all actions registered via `useAction`.
 * This acts as the single source of truth for:
 * 1. The in-app AI Agent (AgentRuntime)
 * 2. The MCP Server (external agents)
 * 3. iOS App Intents (Siri)
 * 4. Android AppFunctions (Gemini)
 */
export class ActionRegistry {
  actions = new Map();
  listeners = new Set();

  /** Register a new action definition */
  register(action) {
    this.actions.set(action.name, action);
    this.notify();
  }

  /** Unregister an action by name */
  unregister(name) {
    this.actions.delete(name);
    this.notify();
  }

  /** Get a specific action by name */
  get(name) {
    return this.actions.get(name);
  }

  /** Get all registered actions */
  getAll() {
    return Array.from(this.actions.values());
  }

  /** Clear all registered actions (useful for testing) */
  clear() {
    this.actions.clear();
    this.notify();
  }

  /**
   * Subscribe to changes (e.g. when a new screen mounts and registers actions).
   * Useful for the MCP server to re-announce tools.
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Serialize all actions as strictly-typed MCP tool declarations */
  toMCPTools() {
    return this.getAll().map(a => ({
      name: a.name,
      description: a.description,
      inputSchema: this.buildInputSchema(a.parameters)
    }));
  }
  buildInputSchema(params) {
    const properties = {};
    const required = [];
    for (const [key, val] of Object.entries(params)) {
      if (typeof val === 'string') {
        // Backward compatibility: passing a string means it's a required string param.
        properties[key] = {
          type: 'string',
          description: val
        };
        required.push(key);
      } else {
        // New strict parameter definition
        properties[key] = {
          type: val.type,
          description: val.description
        };
        if (val.enum) {
          properties[key].enum = val.enum;
        }
        if (val.required !== false) {
          required.push(key);
        }
      }
    }
    return {
      type: 'object',
      properties,
      required
    };
  }
  notify() {
    this.listeners.forEach(l => l());
  }
}

// Export a singleton instance. 
// This allows background channels (like App Intents bridging) to access actions 
// even if the React tree hasn't accessed the AIAgent context yet.
export const actionRegistry = new ActionRegistry();
//# sourceMappingURL=ActionRegistry.js.map