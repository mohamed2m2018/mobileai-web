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
    if (this._ws && this._ws.readyState <= 1) {
      this._ws.send(JSON.stringify({ type: 'cancel' }));
      this._ws.close();
    }
    this._ws = null;
  }

  async execute(userMessage, chatHistory, userImages, config) {
    this._aborted = false;
    const snapshot = this.adapter.getScreenSnapshot();
    let screenshot;
    if (config?.enableScreenshots) {
      screenshot = await this.adapter.captureScreenshot();
    }

    const wsUrl = `${this.serverUrl}?key=${encodeURIComponent(this.analyticsKey)}`;

    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;

      const ws = new WebSocket(wsUrl);
      this._ws = ws;

      ws.onopen = () => {
        const startMsg = {
          type: 'start',
          userMessage,
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
              props: e.props || {},
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
      };

      ws.onmessage = (event) => {
        if (this._aborted) return;
        try {
          const msg = JSON.parse(event.data);
          this._handleServerMessage(msg);
        } catch (err) {
          logger.warn('ServerAgentClient', `Bad message: ${err?.message}`);
        }
      };

      ws.onerror = (err) => {
        logger.error('ServerAgentClient', `WS error: ${err?.message || 'unknown'}`);
        reject(new Error('WebSocket connection failed'));
        this._cleanup();
      };

      ws.onclose = (event) => {
        if (!this._aborted && this._resolve) {
          reject(new Error(`Connection closed unexpectedly (code: ${event.code})`));
        }
        this._cleanup();
      };
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

    this.callbacks.onStatusUpdate?.(`${toolName}...`);
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
