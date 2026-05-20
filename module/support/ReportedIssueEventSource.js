"use strict";

import { logger } from "../utils/logger.js";
export class ReportedIssueEventSource {
  abortController = null;
  intentionalClose = false;
  reconnectAttempts = 0;
  reconnectTimer = null;
  maxReconnectAttempts = 5;
  constructor(options) {
    this.options = options;
  }
  connect() {
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.openConnection();
  }
  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
  async openConnection() {
    if (this.intentionalClose) return;
    this.abortController = new AbortController();
    try {
      const response = await fetch(this.options.url, {
        signal: this.abortController.signal,
        headers: {
          Accept: 'text/event-stream'
        }
      });
      if (!response.ok) {
        this.scheduleReconnect();
        return;
      }
      if (!response.body) {
        await this.readFullResponse(response);
        return;
      }
      this.reconnectAttempts = 0;
      await this.readStream(response.body);
    } catch (error) {
      if (this.intentionalClose) return;
      if (error.name === 'AbortError') return;
      this.options.onError?.(error);
      this.scheduleReconnect();
    }
  }
  async readStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';
    try {
      while (true) {
        const {
          done,
          value
        } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {
          stream: true
        });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();
          } else if (line === '' && currentEvent) {
            this.handleEvent(currentEvent, currentData);
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (error) {
      if (this.intentionalClose) return;
      if (error.name === 'AbortError') return;
      logger.warn('ReportedIssueSSE', 'Stream read error:', error.message);
    }
    if (!this.intentionalClose) {
      this.scheduleReconnect();
    }
  }
  async readFullResponse(response) {
    try {
      const text = await response.text();
      let currentEvent = '';
      let currentData = '';
      for (const line of text.split('\n')) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6).trim();
        } else if (line === '' && currentEvent) {
          this.handleEvent(currentEvent, currentData);
          currentEvent = '';
          currentData = '';
        }
      }
    } catch (error) {
      if (this.intentionalClose) return;
      logger.warn('ReportedIssueSSE', 'Full response read error:', error.message);
    }
    if (!this.intentionalClose) {
      this.scheduleReconnect();
    }
  }
  handleEvent(event, data) {
    try {
      const parsed = JSON.parse(data);
      if (event === 'connected') {
        this.options.onConnected?.();
        return;
      }
      if (event === 'reported_issue_update' && parsed?.issue) {
        this.options.onIssueUpdate?.(parsed.issue);
      }
    } catch {
      // ignore bad payload
    }
  }
  scheduleReconnect() {
    if (this.intentionalClose) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('ReportedIssueSSE', 'Max reconnect attempts reached — giving up');
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 16_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.openConnection().catch(() => {
        // Connection errors are handled inside openConnection.
      });
    }, delay);
  }
}
//# sourceMappingURL=ReportedIssueEventSource.js.map