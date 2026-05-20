"use strict";

export class IdleDetector {
  pulseTimer = null;
  badgeTimer = null;
  dismissed = false;
  config = null;
  start(config) {
    this.config = config;
    this.dismissed = false;
    this.resetTimers();
  }
  reset() {
    if (!this.config || this.dismissed) return;
    this.config.onReset();
    this.resetTimers();
  }
  dismiss() {
    this.dismissed = true;
    this.clearTimers();
    if (this.config) {
      this.config.onReset();
    }
  }
  destroy() {
    this.clearTimers();
    this.config = null;
  }

  /**
   * Instantly trigger proactive help if the behavior matches a configured trigger.
   */
  triggerBehavior(type, currentScreen) {
    if (!this.config || this.dismissed || !this.config.behaviorTriggers) return;
    const trigger = this.config.behaviorTriggers.find(t => t.type === type && (t.screen === '*' || t.screen === currentScreen));
    if (trigger) {
      this.clearTimers(); // Intercept normal idle flow
      const message = trigger.message || `It looks like you might be having trouble. Can I help?`;
      if (trigger.delayMs) {
        this.badgeTimer = setTimeout(() => {
          this.config?.onBadge(message);
        }, trigger.delayMs);
      } else {
        this.config.onBadge(message);
      }
    }
  }
  resetTimers() {
    this.clearTimers();
    if (!this.config || this.dismissed) return;
    this.pulseTimer = setTimeout(() => {
      this.config?.onPulse();
    }, this.config.pulseAfterMs);
    this.badgeTimer = setTimeout(() => {
      const suggestion = this.config?.generateSuggestion?.() ?? "Need help with this screen?";
      this.config?.onBadge(suggestion);
    }, this.config.badgeAfterMs);
  }
  clearTimers() {
    if (this.pulseTimer) {
      clearTimeout(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.badgeTimer) {
      clearTimeout(this.badgeTimer);
      this.badgeTimer = null;
    }
  }
}
//# sourceMappingURL=IdleDetector.js.map