"use strict";

import { logger } from "../../utils/logger.js";

const STEP_TIMEOUT_MS = 60000;

export class ServerAgentClient {
  constructor(proxyUrl, analyticsKey, platformAdapter, callbacks) {
    this.serverUrl = ServerAgentClient._deriveAgentUrl(proxyUrl);
    this.analyticsKey = analyticsKey;
    this.adapter = platformAdapter;
    this.callbacks = callbacks || {};
    this._ws = null;
    this._aborted = false;
    this._resolve = null;
    this._reject = null;
  }

  abort() {
    this._aborted = true;
    const ws = this._ws;
    this._ws = null;
    if (ws) {
      // Only OPEN sockets can receive a cancel frame; sending on a CONNECTING
      // socket throws. Always close, never throw.
      try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'cancel' })); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
    }
  }

  // Tear down any in-flight connection before starting a new one. This client is a
  // singleton reused across turns, so two overlapping execute() calls (e.g. an MPA
  // resume-on-reload racing a user send) would otherwise clobber this._ws and orphan
  // a socket whose `start` is never sent — the server holds it open and the user gets
  // no reply. Closing the previous socket here guarantees only one live connection.
  _supersedePrevious() {
    const prevWs = this._ws;
    const prevReject = this._reject;
    this._ws = null;
    this._resolve = null;
    this._reject = null;
    if (prevWs) {
      try { if (prevWs.readyState === WebSocket.OPEN) prevWs.send(JSON.stringify({ type: 'cancel' })); } catch { /* ignore */ }
      try { prevWs.close(); } catch { /* ignore */ }
    }
    if (prevReject) {
      try { prevReject(new Error('Request superseded by a newer one')); } catch { /* ignore */ }
    }
  }

  async execute(userMessage, chatHistory, userImages, config) {
    this._supersedePrevious();
    this._aborted = false;

    const wsUrl = `${this.serverUrl}?key=${encodeURIComponent(this.analyticsKey)}`;
    // Auto-reconnect on an UNEXPECTED close — the socket died before a terminal
    // `done`/`error` (server restart/deploy, network drop, idle timeout). A
    // server-sent `error` (deterministic failure) runs _handleError first, which
    // nulls _resolve and _ws, so its later close is ignored here — we never
    // crash-loop a request the server rejects. Bounded + backoff avoids storms.
    const MAX_RECONNECTS = 2;

    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;

      const fail = (err) => {
        this._resolve = null;
        this._reject = null;
        reject(err);
        this._cleanup();
      };

      const openConnection = async (attempt) => {
        if (this._aborted || !this._resolve) return;
        // Re-capture the screen each attempt — the page may have changed since
        // the drop (a reconnect restarts the run from the current state).
        const snapshot = this.adapter.getScreenSnapshot();
        let screenshot;
        if (config?.enableScreenshots) {
          try { screenshot = await this.adapter.captureScreenshot(); } catch { /* ignore */ }
        }
        if (this._aborted || !this._resolve) return;

        const ws = new WebSocket(wsUrl);
        this._ws = ws;

        ws.onopen = () => {
          if (this._ws !== ws) return;
          try {
            const startMsg = {
              type: 'start',
              userMessage,
              chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
              // Carried across an MPA reload+resume: a workflow approval the user
              // already granted, so the resumed server session doesn't re-prompt.
              workflowApproved: config?.workflowApproved === true,
              screenState: {
                screenName: snapshot.screenName,
                availableScreens: snapshot.availableScreens,
                elementsText: snapshot.elementsText,
                elements: snapshot.elements.map(e => ({
                  index: e.index,
                  type: e.type,
                  label: e.label,
                  requiresConfirmation: e.requiresConfirmation,
                  zoneId: e.zoneId,
                  props: this._safeProps(e.props),
                })),
              },
              screenshot,
              userImages,
              config: {
                interactionMode: config?.interactionMode || 'copilot',
                language: config?.language,
                maxSteps: config?.maxSteps,
                enableScreenshots: config?.enableScreenshots,
                enableKnowledge: config?.enableKnowledge,
                enableWebSearch: config?.enableWebSearch,
                customTools: config?.customTools,
                screenMap: config?.screenMap,
                intentManifest: config?.intentManifest,
                supportStyle: config?.supportStyle,
              },
            };
            ws.send(JSON.stringify(startMsg));
          } catch (err) {
            logger.error('ServerAgentClient', `Failed to send start message: ${err?.message}`);
            fail(err);
          }
        };

        ws.onmessage = (event) => {
          if (this._ws !== ws || this._aborted) return;
          try {
            const msg = JSON.parse(event.data);
            this._handleServerMessage(msg);
          } catch (err) {
            logger.warn('ServerAgentClient', `Bad message: ${err?.message}`);
          }
        };

        ws.onerror = (err) => {
          if (this._ws !== ws) return;
          // Log only — the browser always fires onclose next, where the
          // reconnect-or-reject decision is made.
          logger.warn('ServerAgentClient', `WS error: ${err?.message || 'unknown'}`);
        };

        ws.onclose = (event) => {
          if (this._ws !== ws) return; // a terminal handler already settled + cleaned up
          if (this._aborted || !this._resolve) { this._cleanup(); return; }
          // Unexpected close before any terminal message → reconnect (bounded).
          if (attempt < MAX_RECONNECTS) {
            this._ws = null;
            const delay = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
            logger.warn('ServerAgentClient', `WS closed (code ${event.code}) mid-run — reconnecting ${attempt + 1}/${MAX_RECONNECTS} in ${delay}ms`);
            this.callbacks.onStatusUpdate?.('Reconnecting…');
            setTimeout(() => {
              if (!this._aborted && this._resolve) openConnection(attempt + 1);
            }, delay);
            return;
          }
          fail(new Error(`Connection closed unexpectedly (code: ${event.code})`));
        };
      };

      openConnection(0);
    });
  }

  async _handleServerMessage(msg) {
    switch (msg.type) {
      case 'action':
        await this._handleAction(msg);
        break;
      case 'ask_user':
        await this._handleAskUser(msg);
        break;
      case 'guide':
        this._handleGuide(msg);
        break;
      case 'render_block':
        await this._handleRenderBlock(msg);
        break;
      case 'capture_screenshot':
        await this._handleScreenshotRequest();
        break;
      case 'status':
        // Live per-step progress for the thinking overlay. The server runs the
        // agent loop, so it drives the overlay text ("Looking at your screen…",
        // "Scrolling down…", "Writing response…"); the client only renders it.
        this.callbacks.onStatusUpdate?.(msg.label || '');
        break;
      case 'inline_message':
        // A mid-loop finding (guide_user action="verify"). Unlike 'status', this
        // is appended to the chat thread so on-screen conclusions also appear in
        // the conversation, not only as a transient overlay.
        this.callbacks.onInlineMessage?.(msg.text || '');
        break;
      case 'done':
        this._handleDone(msg);
        break;
      case 'error':
        this._handleError(msg);
        break;
    }
  }

  async _handleAction(msg) {
    const { toolName, args, reasoning, requestScreenshot } = msg;

    // Note: the overlay label is set by the preceding 'status' message (which the
    // server sends just before this action). Don't overwrite it with a raw
    // "toolName..." here — that regressed the friendly "thinking" labels.
    this.callbacks.onActingOnPage?.(true);

    if (reasoning?.plan) {
      logger.info('ServerAgentClient', `Plan: ${reasoning.plan}`);
    }

    let output;
    try {
      const intent = this._buildIntent(toolName, args);
      output = await this.adapter.executeAction(intent);
      if (output == null) output = `✅ ${toolName} executed`;
    } catch (err) {
      output = `❌ ${toolName} failed: ${err?.message || 'unknown error'}`;
    }

    const freshSnapshot = this.adapter.getScreenSnapshot();
    let screenshot;
    if (requestScreenshot) {
      screenshot = await this.adapter.captureScreenshot();
    }

    this._send({
      type: 'action_result',
      output: String(output),
      screenState: {
        screenName: freshSnapshot.screenName,
        availableScreens: freshSnapshot.availableScreens,
        elementsText: freshSnapshot.elementsText,
        elements: freshSnapshot.elements.map(e => ({
          index: e.index,
          type: e.type,
          label: e.label,
          requiresConfirmation: e.requiresConfirmation,
          zoneId: e.zoneId,
          props: e.props || {},
        })),
      },
      screenshot,
    });
  }

  async _handleAskUser(msg) {
    this.callbacks.onActingOnPage?.(false);

    if (!this.callbacks.onAskUser) {
      this._send({
        type: 'user_response',
        response: null,
      });
      return;
    }

    try {
      const response = await this.callbacks.onAskUser({
        question: msg.question,
        kind: msg.kind || (msg.collectInput ? 'freeform' : 'approval'),
        collectInput: msg.collectInput,
        grantsWorkflowApproval: msg.grantsWorkflowApproval,
      });

      this._send({
        type: 'user_response',
        response: response?.text ?? response?.response ?? (typeof response === 'string' ? response : null),
        approvalToken: response?.approvalToken,
      });
    } catch {
      this._send({
        type: 'user_response',
        response: null,
      });
    }
  }

  _handleGuide(msg) {
    if (this.adapter.guideUser) {
      this.adapter.guideUser(msg.index, msg.message, msg.autoRemoveAfterMs, msg.action);
    }

    const freshSnapshot = this.adapter.getScreenSnapshot();
    this._send({
      type: 'action_result',
      output: `✅ Highlighted element [${msg.index}]`,
      screenState: {
        screenName: freshSnapshot.screenName,
        availableScreens: freshSnapshot.availableScreens,
        elementsText: freshSnapshot.elementsText,
        elements: freshSnapshot.elements.map(e => ({
          index: e.index,
          type: e.type,
          label: e.label,
          requiresConfirmation: e.requiresConfirmation,
          zoneId: e.zoneId,
          props: e.props || {},
        })),
      },
    });
  }

  async _handleRenderBlock(msg) {
    let output;
    try {
      output = await this.adapter.executeAction({
        type: 'render_block',
        zoneId: msg.zoneId,
        blockType: msg.blockType,
        props: msg.props,
        lifecycle: msg.lifecycle,
      });
      if (output == null) output = '✅ Block rendered';
    } catch (err) {
      output = `❌ render_block failed: ${err?.message}`;
    }

    const freshSnapshot = this.adapter.getScreenSnapshot();
    this._send({
      type: 'action_result',
      output: String(output),
      screenState: {
        screenName: freshSnapshot.screenName,
        availableScreens: freshSnapshot.availableScreens,
        elementsText: freshSnapshot.elementsText,
        elements: freshSnapshot.elements.map(e => ({
          index: e.index,
          type: e.type,
          label: e.label,
          requiresConfirmation: e.requiresConfirmation,
          zoneId: e.zoneId,
          props: e.props || {},
        })),
      },
    });
  }

  async _handleScreenshotRequest() {
    const screenshot = await this.adapter.captureScreenshot();
    const freshSnapshot = this.adapter.getScreenSnapshot();
    this._send({
      type: 'action_result',
      output: '✅ Screenshot captured',
      screenState: {
        screenName: freshSnapshot.screenName,
        availableScreens: freshSnapshot.availableScreens,
        elementsText: freshSnapshot.elementsText,
        elements: freshSnapshot.elements.map(e => ({
          index: e.index,
          type: e.type,
          label: e.label,
          requiresConfirmation: e.requiresConfirmation,
          zoneId: e.zoneId,
          props: e.props || {},
        })),
      },
      screenshot,
    });
  }

  _handleDone(msg) {
    this.callbacks.onActingOnPage?.(false);
    this.callbacks.onStatusUpdate?.('');
    this.callbacks.onTokenUsage?.(msg.tokenUsage);

    const result = {
      message: msg.text || '',
      reply: msg.reply,
      previewText: msg.previewText,
      success: msg.success,
      tokenUsage: msg.tokenUsage,
    };

    if (this._resolve) {
      this._resolve(result);
      this._resolve = null;
      this._reject = null;
    }
    this._cleanup();
  }

  _handleError(msg) {
    logger.error('ServerAgentClient', `Server error: ${msg.message}`);
    this.callbacks.onStatusUpdate?.('');
    this.callbacks.onActingOnPage?.(false);

    if (this._reject) {
      this._reject(new Error(msg.message || 'Server error'));
      this._resolve = null;
      this._reject = null;
    }
    this._cleanup();
  }

  _buildIntent(toolName, args) {
    switch (toolName) {
      case 'tap':
        return { type: 'tap', index: args.index };
      case 'long_press':
        return { type: 'long_press', index: args.index };
      case 'type':
        return { type: 'type', index: args.index, text: args.text };
      case 'scroll':
        return { type: 'scroll', direction: args.direction, amount: args.amount, containerIndex: args.containerIndex };
      case 'adjust_slider':
        return { type: 'adjust_slider', index: args.index, value: args.value };
      case 'select_picker':
        return { type: 'select_picker', index: args.index, value: args.value };
      case 'set_date':
        return { type: 'set_date', index: args.index, date: args.date };
      case 'dismiss_keyboard':
        return { type: 'dismiss_keyboard' };
      case 'navigate':
        return { type: 'navigate', screen: args.screen, params: args.params };
      case 'guide_user':
        return { type: 'guide_user', index: args.index, message: args.message, autoRemoveAfterMs: args.autoRemoveAfterMs, action: args.action };
      case 'simplify_zone':
        return { type: 'simplify_zone', zoneId: args.zoneId };
      case 'restore_zone':
        return { type: 'restore_zone', zoneId: args.zoneId };
      case 'render_block':
        return { type: 'render_block', zoneId: args.zoneId, blockType: args.blockType, props: args.props, lifecycle: args.lifecycle };
      case 'capture_screenshot':
        return { type: 'capture_screenshot' };
      default:
        return { type: toolName, ...args };
    }
  }

  // Element props can carry non-serializable values on framework-heavy pages — e.g.
  // a jQuery/Bootstrap tooltip stashes a back-reference to its own DOM node, making
  // the props circular. JSON.stringify then throws and the start/action message is
  // never sent (the user gets no reply, intermittently). Whitelist serializable
  // primitives only, so every message is serializable by construction.
  _safeProps(p) {
    if (!p || typeof p !== 'object') return {};
    const out = {};
    for (const key of ['role', 'disabled', 'value', 'placeholder', 'checked', 'inputType', 'scrollable', 'nearbyText', 'parentSectionLabel']) {
      const t = typeof p[key];
      if (t === 'string' || t === 'number' || t === 'boolean') out[key] = p[key];
    }
    const sd = p.scrollData;
    if (sd && typeof sd === 'object') {
      out.scrollData = { up: +sd.up || 0, down: +sd.down || 0, left: +sd.left || 0, right: +sd.right || 0 };
    }
    return out;
  }

  _send(msg) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(msg));
    }
  }

  _cleanup() {
    if (this._ws) {
      if (this._ws.readyState <= 1) {
        this._ws.close();
      }
      this._ws = null;
    }
  }

  static _deriveAgentUrl(proxyUrl) {
    if (!proxyUrl) return '';
    try {
      const u = new URL(proxyUrl, typeof window !== 'undefined' ? window.location.href : undefined);
      u.pathname = '/ws/v1/agent-runtime';
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return u.toString().replace(/\?.*$/, '');
    } catch {
      return proxyUrl.replace(/\/ws\/v1\/\w+/, '/ws/v1/agent-runtime');
    }
  }
}
