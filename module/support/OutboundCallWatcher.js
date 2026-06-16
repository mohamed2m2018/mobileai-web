"use strict";

/**
 * OutboundCallWatcher — WebSocket-based watcher for outbound AI call events.
 *
 * Connects to ws://.../ws/outbound-calls/:callId/events?key=...
 * Receives real-time events: status, transcript, completed, retry_scheduled.
 * Falls back to HTTP poll on socket close.
 */

import { ENDPOINTS } from "../config/endpoints.js";
import { logger } from "../utils/logger.js";

const LOG_TAG = 'OutboundCallWatcher';

function resolveWsBase(proxyUrl) {
  const root = (proxyUrl ?? ENDPOINTS.escalation)
    .replace(/\/$/, '')
    .replace(/\/api\/v1\/analytics$/, '');
  if (root.startsWith('https://')) return `wss://${root.slice('https://'.length)}`;
  if (root.startsWith('http://')) return `ws://${root.slice('http://'.length)}`;
  return root;
}

function resolveMobileAIBase(baseUrl) {
  return (baseUrl ?? ENDPOINTS.escalation)
    .replace(/\/$/, '')
    .replace(/\/api\/v1\/analytics$/, '');
}

/**
 * HTTP poll fallback — fetch terminal call state when WebSocket drops.
 */
export async function getOutboundCallStatus({ callId, analyticsKey, proxyUrl }) {
  const root = resolveMobileAIBase(proxyUrl);
  try {
    const res = await fetch(
      `${root}/api/v1/outbound-calls/${encodeURIComponent(callId)}`,
      { headers: { Authorization: `Bearer ${analyticsKey}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const call = data?.call;
    if (!call) return null;
    if (call.status !== 'completed' && call.status !== 'failed') return null;
    return {
      status: call.status,
      durationSeconds: call.durationSeconds ?? undefined,
      outcome: call.outcome ?? undefined,
      transcript: Array.isArray(call.transcript)
        ? call.transcript.map((e) => ({ role: e.role || 'unknown', text: e.text || '', at: e.at }))
        : [],
      failureReason: call.failureReason ?? undefined,
      failureCode: call.failureCode ?? undefined,
      billedCostUsd: call.billedCostUsd ?? undefined,
    };
  } catch {
    return null;
  }
}

export class OutboundCallWatcher {
  constructor(opts) {
    this.callId = opts.callId;
    this.analyticsKey = opts.analyticsKey;
    this.proxyUrl = opts.proxyUrl;
    const base = resolveWsBase(opts.proxyUrl);
    const key = encodeURIComponent(opts.analyticsKey);
    this.url = `${base}/ws/outbound-calls/${encodeURIComponent(opts.callId)}/events?key=${key}`;
    this.timeoutMs = Math.max(10000, opts.timeoutMs ?? 30 * 60000);
    this.onEvent = opts.onEvent;
    this.socket = null;
    this.terminalResolve = null;
    this.terminalReject = null;
    this.terminalPromise = null;
    this.timeoutHandle = null;
    this.collectedTranscript = [];
    this.latestStatus = undefined;
    this.resolved = false;
  }

  start() {
    if (this.terminalPromise) return this.terminalPromise;
    this.terminalPromise = new Promise((resolve, reject) => {
      this.terminalResolve = resolve;
      this.terminalReject = reject;
    });

    try {
      this.socket = new WebSocket(this.url);
    } catch (err) {
      this._failOnce(new Error(`Failed to open watcher socket: ${err?.message || String(err)}`));
      return this.terminalPromise;
    }

    this.socket.onmessage = (ev) => {
      let data;
      try {
        data = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      this._handleEvent(data);
    };
    this.socket.onerror = () => {
      logger.warn(LOG_TAG, `socket error for ${this.callId}`);
    };
    this.socket.onclose = () => {
      if (!this.resolved) {
        this._pollAndResolve();
      }
    };

    this.timeoutHandle = setTimeout(() => {
      if (this.resolved) return;
      this._resolveOnce({
        status: 'failed',
        transcript: this.collectedTranscript,
        failureReason: 'watcher_timeout',
        failureCode: 'watcher_timeout',
      });
      this.close();
    }, this.timeoutMs);

    return this.terminalPromise;
  }

  close() {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    try {
      this.socket?.close();
    } catch {
      // ignore
    }
    this.socket = null;
  }

  _handleEvent(event) {
    try {
      this.onEvent?.(event);
    } catch (err) {
      logger.warn(LOG_TAG, `onEvent handler threw: ${err?.message || String(err)}`);
    }

    if (event.type === 'transcript') {
      this.collectedTranscript.push({ role: event.role, text: event.text, at: event.at });
      return;
    }
    if (event.type === 'status') {
      this.latestStatus = event.status;
      return;
    }
    if (event.type === 'retry_scheduled') {
      return;
    }
    if (event.type === 'completed') {
      this.latestStatus = event.status;
      const transcript =
        Array.isArray(event.transcript) && event.transcript.length > 0
          ? event.transcript.map((e) => ({
              role: typeof e.role === 'string' ? String(e.role) : 'unknown',
              text: typeof e.text === 'string' ? String(e.text) : '',
              at: typeof e.at === 'string' ? String(e.at) : undefined,
            }))
          : this.collectedTranscript;
      this._resolveOnce({
        status: event.status,
        durationSeconds: event.durationSeconds,
        outcome: event.outcome,
        transcript,
        failureReason: event.failureReason,
        failureCode: event.failureCode,
        billedCostUsd: event.billedCostUsd,
      });
      this.close();
    }
  }

  async _pollAndResolve() {
    try {
      const polled = await getOutboundCallStatus({
        callId: this.callId,
        analyticsKey: this.analyticsKey,
        proxyUrl: this.proxyUrl,
      });
      if (polled) {
        this._resolveOnce(polled);
        return;
      }
    } catch {
      // poll failed, fall through
    }
    this._resolveOnce({
      status: this.latestStatus === 'completed' ? 'completed' : 'failed',
      transcript: this.collectedTranscript,
      failureReason: this.latestStatus === 'completed' ? undefined : 'socket_closed_before_terminal',
      failureCode: 'connection_lost',
    });
  }

  _resolveOnce(terminal) {
    if (this.resolved) return;
    this.resolved = true;
    this.terminalResolve?.(terminal);
  }

  _failOnce(err) {
    if (this.resolved) return;
    this.resolved = true;
    this.terminalReject?.(err);
  }
}
