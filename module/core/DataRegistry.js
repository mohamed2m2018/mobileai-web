"use strict";

export class DataRegistry {
  dataSources = new Map();
  listeners = new Set();
  register(source) {
    this.dataSources.set(source.name, source);
    this.notify();
  }
  unregister(name) {
    this.dataSources.delete(name);
    this.notify();
  }
  get(name) {
    return this.dataSources.get(name);
  }
  getAll() {
    return Array.from(this.dataSources.values());
  }
  clear() {
    this.dataSources.clear();
    this.notify();
  }
  onChange(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  notify() {
    this.listeners.forEach(listener => listener());
  }
}
export const dataRegistry = new DataRegistry();
//# sourceMappingURL=DataRegistry.js.map