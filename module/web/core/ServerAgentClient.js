"use strict";

import { logger } from "../../utils/logger.js";

const STEP_TIMEOUT_MS = 60000;
// Hard cap on a single client-side action (execute + snapshot). The server blocks in
// waitForClient (60s) on the action_result we owe it; if an executor hangs — e.g. a
// scroll whose requestAnimationFrame settle never fires in a backgrounded tab — we
// must still answer well before the server gives up, or the run dies at this step and
// the client reconnect-loops a fresh Step 0 forever. Kept under STEP_TIMEOUT_MS.
const ACTION_TIMEOUT_MS = 15000;

// A reconnect re-sends `start`, which spins up a FRESH server session at Step 0 — it
// has no memory of the actions already taken this run. Replaying the raw goal would
// restart the task blind and risk redoing non-idempotent steps. Frame it as a
// continuation instead: the conversation rides along in chatHistory and the live page
// reflects completed work, so the agent re-checks current state and finishes only
// what's left. Mirrors the MPA-reload resume framing for a smooth recovery.
function frameAsResumedGoal(goal) {
  return (
    `[Resuming after a brief connection drop] Original request: "${goal}". ` +
    `Some steps may already be complete. First inspect the CURRENT page and the ` +
    `conversation above to see what is already done, then perform ONLY the remaining ` +
    `steps. If the request is already fully satisfied, briefly confirm that and stop — ` +
    `do not repeat actions that are already done.`
  );
}

// State carried across an MPA reload. A navigating action tears down the socket and the
// page reloads into a brand-new client at Step 0; chatHistory survives but the
// intermediate ACTIONS and the workflow APPROVAL do not, so the resumed run re-derives
// the task and loops (re-search, re-select…) and re-asks "may I?". We persist the action
// outcome lines + the granted approval in sessionStorage keyed to the CONVERSATION id —
// which is stable across the reload AND the resume's goal-wrapping. (Keying by the goal
// string was the bug: resumeTask sends a wrapped "[Resuming…] Original request: X" goal
// that never matched the stored key, so nothing was ever carried.)
const PROGRESS_KEY = 'twomilia-agent-progress';
const PROGRESS_TTL_MS = 3 * 60 * 1000;
const PROGRESS_CAP = 25;
function loadBuffer(convId) {
  if (typeof window === 'undefined' || !window.sessionStorage || !convId) return null;
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || p.convId !== convId || typeof p.ts !== 'number' || (Date.now() - p.ts) > PROGRESS_TTL_MS) return null;
    return {
      lines: Array.isArray(p.lines) ? p.lines.filter(s => typeof s === 'string') : [],
      workflowApproved: p.workflowApproved === true,
    };
  } catch { return null; }
}
function saveBuffer(convId, buf) {
  if (typeof window === 'undefined' || !window.sessionStorage || !convId) return;
  try {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({
      convId, ts: Date.now(),
      lines: (buf.lines || []).slice(-PROGRESS_CAP),
      workflowApproved: buf.workflowApproved === true,
    }));
  } catch { /* sessionStorage full/blocked — carry is best-effort */ }
}
function appendProgress(convId, line) {
  if (!convId || !line) return;
  const buf = loadBuffer(convId) || { lines: [], workflowApproved: false };
  buf.lines.push(String(line));
  saveBuffer(convId, buf);
}
function markWorkflowApproved(convId) {
  if (!convId) return;
  const buf = loadBuffer(convId) || { lines: [], workflowApproved: false };
  buf.workflowApproved = true;
  saveBuffer(convId, buf);
}
function clearProgress() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try { window.sessionStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
}

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
    // Key all carried state by the stable CONVERSATION id (survives the reload + the
    // resume's goal-wrapping). On a fresh user message (not a resume), drop any stale
    // buffer so a new task starts clean; on a RESUME (or a mid-run reconnect) the buffer
    // saved by the pre-reload/pre-drop run is read per-connection in ws.onopen below.
    this._convId = config?.conversationId || null;
    if (config?.resume !== true) clearProgress();

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
            // Read the carry buffer fresh per connection — covers both an MPA-reload
            // resume and a mid-run socket reconnect (it has accumulated this run's actions).
            const buf = loadBuffer(this._convId);
            const startMsg = {
              type: 'start',
              // On a reconnect (attempt > 0) resume as a continuation so a mid-run
              // drop picks the task back up smoothly instead of restarting it blind.
              userMessage: attempt > 0 ? frameAsResumedGoal(userMessage) : userMessage,
              resumed: attempt > 0,
              // Group the run's server-emitted analytics events under this conversation.
              conversationId: config?.conversationId,
              // Pull-tool capabilities this client can execute (P2b/P3). The server declares
              // find / get_page_text / look to the model ONLY when advertised here, so we never
              // get offered a tool we can't run. `look` rides the always-present capture_screenshot
              // path; find / get_page_text are gated on the adapter actually implementing them.
              capabilities: [
                ...(typeof this.adapter.findElements === 'function' ? ['find'] : []),
                ...(typeof this.adapter.getPageText === 'function' ? ['get_page_text'] : []),
                ...(typeof this.adapter.readConsole === 'function' ? ['read_console'] : []),
                ...(typeof this.adapter.readNetwork === 'function' ? ['read_network'] : []),
                ...(typeof this.adapter.tapAt === 'function' ? ['tap_at'] : []),
                'look',
              ],
              chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
              // Carried across an MPA reload+resume: a workflow approval the user already
              // granted, so the resumed server session doesn't re-ask "may I?". Trust
              // EITHER the caller's flag OR the approval persisted in the carry buffer
              // (the buffer is the robust path — survives even if host-side ref timing missed it).
              workflowApproved: config?.workflowApproved === true || buf?.workflowApproved === true,
              // Actions already performed this task before the reload — so the resumed
              // run continues instead of restarting the goal (re-search/re-select loop).
              priorProgress: buf?.lines || [],
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
          // Terminal auth-gate closes — reconnecting can't help, so DON'T loop
          // "Reconnecting…". Resolve with a friendly assistant message instead.
          //   4429 → out of credits / at capacity ("all agents busy")
          //   4401/4403 → bad key / forbidden (config issue)
          if (event.code === 4429 || event.code === 4401 || event.code === 4403) {
            const text = event.code === 4429
              ? "All our agents are busy right now. We'll get back to you shortly — please try again in a little while."
              : "I can't reach the assistant right now. Please try again later.";
            logger.warn('ServerAgentClient', `WS closed (code ${event.code}, ${event.reason || 'no reason'}) — not reconnecting; surfacing message`);
            this.callbacks.onStatusUpdate?.('');
            this.callbacks.onActingOnPage?.(false);
            const resolve = this._resolve;
            this._resolve = null;
            this._reject = null;
            if (resolve) {
              resolve({ success: false, message: text, previewText: text, reply: text });
            }
            this._cleanup();
            return;
          }
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
    const { toolName, args, reasoning, requestScreenshot, targetLabel } = msg;

    // read_more is a NON-mutating read (page the trimmed content / one element's full
    // detail) — handle it separately so it doesn't go through executeAction/waitForStable.
    if (toolName === 'read_more') {
      await this._handleReadMore(args || {});
      return;
    }
    // find / get_page_text are NON-mutating reads (P3) — handle them like read_more, off the
    // executeAction/waitForStable path. They return the SAME screen (cache stays warm).
    if (toolName === 'find') {
      await this._handleFind(args || {});
      return;
    }
    if (toolName === 'get_page_text') {
      await this._handleGetPageText();
      return;
    }
    if (toolName === 'read_console') {
      this._sendReadResult(typeof this.adapter.readConsole === 'function'
        ? this.adapter.readConsole(args?.limit) : '(console reading is not available on this page.)');
      return;
    }
    if (toolName === 'read_network') {
      this._sendReadResult(typeof this.adapter.readNetwork === 'function'
        ? this.adapter.readNetwork(args?.limit) : '(network reading is not available on this page.)');
      return;
    }

    // Note: the overlay label is set by the preceding 'status' message (which the
    // server sends just before this action). Don't overwrite it with a raw
    // "toolName..." here — that regressed the friendly "thinking" labels.
    this.callbacks.onActingOnPage?.(true);

    if (reasoning?.plan) {
      logger.info('ServerAgentClient', `Plan: ${reasoning.plan}`);
    }

    // Invariant: the server dispatched ONE action and is blocked waiting for ONE
    // action_result. We must always send exactly one, within ACTION_TIMEOUT_MS, even
    // if the executor hangs or throws — otherwise the run stalls at this step and the
    // client reconnect-loops Step 0 (the "stuck/pending" bug). Bound every await.
    let output;
    if (toolName === 'wait') {
      // wait sleeps CLIENT-side, then falls through to waitForStable + a FRESH snapshot below,
      // so the agent reasons over the SETTLED page (e.g. an SPA route that just finished
      // hydrating). Previously wait slept server-side and never refetched the screen — so after
      // a navigation the agent kept seeing the same stale "loading" screen and falsely
      // concluded the page would not load.
      const secs = Math.min(Math.max(Number(args?.seconds) || 1, 0), 5);
      await new Promise((resolve) => setTimeout(resolve, secs * 1000));
      output = `✅ Waited ${secs}s`;
    } else {
      try {
        const intent = this._buildIntent(toolName, args, targetLabel);
        output = await this._withTimeout(
          Promise.resolve().then(() => this.adapter.executeAction(intent)),
          ACTION_TIMEOUT_MS,
          // A timeout means "didn't confirm in time" — NOT "didn't happen". Tell the
          // agent to verify against the fresh screen below and retry only if needed, so
          // it recovers the step without blindly re-firing a mutation (double-submit).
          `⌛ ${toolName} did not confirm within ${Math.round(ACTION_TIMEOUT_MS / 1000)}s. ` +
            `It may or may not have taken effect — check the CURRENT screen below; if the ` +
            `intended change is not visible, retry the same action, otherwise continue.`,
        );
        if (output == null) output = `✅ ${toolName} executed`;
      } catch (err) {
        output = `❌ ${toolName} failed: ${err?.message || 'unknown error'}`;
      }
    }

    // Let any SPA navigation triggered by the action settle BEFORE snapshotting, so the
    // agent reasons over the final screen instead of a transient one that goes stale by
    // the next step (the STALE_TARGET churn). Bounded + best-effort — never blocks the
    // result, and resolves fast when nothing navigated.
    // pageBusy = the page never settled (waitForStable timed out → still loading). The
    // server's dead-action guard reads this so an unchanged screen is NOT counted as a
    // dead loop while a slow page is still loading.
    let pageBusy = false;
    try {
      if (typeof this.adapter.waitForStable === 'function') {
        const settled = await this._withTimeout(
          Promise.resolve().then(() => this.adapter.waitForStable()),
          ACTION_TIMEOUT_MS,
          true, // outer-timeout fallback: assume settled (don't over-trigger the guard)
        );
        pageBusy = settled === false;
      }
    } catch { /* settle is best-effort */ }

    let freshSnapshot;
    try {
      freshSnapshot = this.adapter.getScreenSnapshot();
    } catch (err) {
      logger.warn('ServerAgentClient', `getScreenSnapshot failed: ${err?.message}`);
      freshSnapshot = { screenName: '', availableScreens: [], elementsText: '', elements: [] };
    }
    let screenshot;
    if (requestScreenshot) {
      try {
        screenshot = await this._withTimeout(
          Promise.resolve().then(() => this.adapter.captureScreenshot()),
          ACTION_TIMEOUT_MS,
          null,
        );
      } catch { /* screenshot is best-effort — never block the result on it */ }
    }

    // Record the outcome so it survives an MPA reload and the resumed run can continue
    // from here instead of restarting the task.
    appendProgress(this._convId, String(output));

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
          props: this._safeProps(e.props),
        })),
      },
      screenshot,
      pageBusy,
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

      // onAskUser resolves an approval with the token as a bare STRING (RN-style
      // contract). Forward it in BOTH `response` (legacy) and `approvalToken` so the
      // server's fail-closed gate reads a real token instead of undefined — otherwise a
      // "Don't allow" (REJECTED) looks like no-token and the action dispatches anyway.
      const asString = typeof response === 'string' ? response : null;
      const approvalToken = response?.approvalToken
        ?? (asString === '__APPROVAL_GRANTED__' || asString === '__APPROVAL_REJECTED__' ? asString : undefined);
      // Persist a granted workflow approval in the carry buffer so a reload mid-task
      // resumes WITHOUT re-asking "may I?" — robust to host-side ref timing.
      if (approvalToken === '__APPROVAL_GRANTED__') markWorkflowApproved(this._convId);
      this._send({
        type: 'user_response',
        response: response?.text ?? response?.response ?? asString,
        approvalToken,
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
          props: this._safeProps(e.props),
        })),
      },
    });
  }

  async _handleRenderBlock(msg) {
    let output;
    try {
      output = await this._withTimeout(
        Promise.resolve().then(() => this.adapter.executeAction({
          type: 'render_block',
          zoneId: msg.zoneId,
          blockType: msg.blockType,
          props: msg.props,
          lifecycle: msg.lifecycle,
        })),
        ACTION_TIMEOUT_MS,
        '⌛ render_block timed out',
      );
      if (output == null) output = '✅ Block rendered';
    } catch (err) {
      output = `❌ render_block failed: ${err?.message}`;
    }

    let freshSnapshot;
    try { freshSnapshot = this.adapter.getScreenSnapshot(); }
    catch { freshSnapshot = { screenName: '', availableScreens: [], elementsText: '', elements: [] }; }
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
          props: this._safeProps(e.props),
        })),
      },
    });
  }

  async _handleScreenshotRequest() {
    let screenshot;
    try {
      screenshot = await this._withTimeout(
        Promise.resolve().then(() => this.adapter.captureScreenshot()),
        ACTION_TIMEOUT_MS,
        null,
      );
    } catch { /* best-effort — still answer the server below */ }
    let freshSnapshot;
    try { freshSnapshot = this.adapter.getScreenSnapshot(); }
    catch { freshSnapshot = { screenName: '', availableScreens: [], elementsText: '', elements: [] }; }
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
          props: this._safeProps(e.props),
        })),
      },
      screenshot,
    });
  }

  // read_more: return trimmed-but-loaded content WITHOUT scrolling. target=index → that
  // element's full detail; otherwise → next page of the overflow (server tracks offset).
  // Non-mutating, so the screenState we return is the SAME screen (keeps the server's
  // cache warm — the whole cost win vs scrolling).
  async _handleReadMore(args) {
    let output;
    try {
      if (args && args.target != null) {
        const detail = this.adapter.readElementDetail(Number(args.target));
        output = detail?.text || `No detail for element ${args.target}.`;
      } else {
        const more = this.adapter.readMore(Number(args?.offset) || 0, Number(args?.chunk) || undefined);
        output = more?.text ? more.text : '';
        if (!output) {
          output = '(No more content is loaded on this page. If you expected more, scroll to load it — it is not yet rendered.)';
        } else if (more.hasMore) {
          output += '\n\n(More remains — call read_more() again for the next page.)';
        } else {
          output += '\n\n(End of loaded content. Anything further is not yet on the page — scroll to load it.)';
        }
      }
    } catch (err) {
      output = `read_more failed: ${err?.message || 'unknown error'}`;
    }
    let freshSnapshot;
    try { freshSnapshot = this.adapter.getScreenSnapshot(); }
    catch { freshSnapshot = { screenName: '', availableScreens: [], elementsText: '', elements: [] }; }
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
          props: this._safeProps(e.props),
        })),
      },
    });
  }

  // Shared NON-mutating read result: snapshot the SAME screen (cache-warm) and return `output`.
  // Used by find / get_page_text — neither changes the page, so we re-send the current screen.
  _sendReadResult(output) {
    let snap;
    try { snap = this.adapter.getScreenSnapshot(); }
    catch { snap = { screenName: '', availableScreens: [], elementsText: '', elements: [] }; }
    this._send({
      type: 'action_result',
      output: String(output),
      screenState: {
        screenName: snap.screenName,
        availableScreens: snap.availableScreens,
        elementsText: snap.elementsText,
        elements: snap.elements.map(e => ({
          index: e.index,
          type: e.type,
          label: e.label,
          requiresConfirmation: e.requiresConfirmation,
          zoneId: e.zoneId,
          props: this._safeProps(e.props),
        })),
      },
    });
  }

  // find: natural-language element search over the adapter's FULL in-memory element list.
  // Returns the matching indices so the model acts by index — no scroll, no full-list dump.
  async _handleFind(args) {
    const query = (args && typeof args.query === 'string' ? args.query : '').trim();
    let output;
    try {
      if (!query) {
        output = 'find needs a query — say what you are looking for.';
      } else if (typeof this.adapter.findElements === 'function') {
        const matches = this.adapter.findElements(query) || [];
        output = matches.length
          ? `Found ${matches.length} element(s) for "${query}" — act on the index you need:\n`
            + matches.map(m => `[${m.index}] ${m.type} — ${m.label}`).join('\n')
          : `No elements matched "${query}". Do NOT just rephrase and call find again — re-searching the same screen rarely helps. Instead: read the visible element list for the control and act on it directly, or scroll to load more content. If you're trying to run a search, the submit may be an icon button — tap the search field, then tap the nearby search/magnifier button (or the element list's search control).`;
      } else {
        output = 'find is not available on this page.';
      }
    } catch (err) {
      output = `find failed: ${err?.message || 'unknown error'}`;
    }
    this._sendReadResult(output);
  }

  // get_page_text: extract the page's MAIN prose (article / main / body) for answering a
  // content question — cheaper than paging the structured element list with read_more.
  async _handleGetPageText() {
    let output;
    try {
      output = typeof this.adapter.getPageText === 'function'
        ? (this.adapter.getPageText() || '(No readable text content found on this page.)')
        : '(Reading page text is not available on this page.)';
    } catch (err) {
      output = `get_page_text failed: ${err?.message || 'unknown error'}`;
    }
    this._sendReadResult(output);
  }

  _handleDone(msg) {
    // Task finished — drop the carried-progress buffer so the next task starts clean.
    clearProgress();
    this.callbacks.onActingOnPage?.(false);
    this.callbacks.onStatusUpdate?.('');
    // Withdraw any approval prompt still open ("May I tap…?" / Allow) — the run ended, so a
    // stale Allow button is orphaned. Dismissal is fail-closed (resolves it as REJECTED).
    this.callbacks.onDismissPrompt?.();
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

  _buildIntent(toolName, args, targetLabel) {
    switch (toolName) {
      case 'tap':
        return { type: 'tap', index: args.index, label: targetLabel };
      case 'long_press':
        return { type: 'long_press', index: args.index, label: targetLabel };
      case 'type':
        return { type: 'type', index: args.index, text: args.text, label: targetLabel };
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
      case 'dismiss_modal':
        return { type: 'dismiss_modal' };
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
      case 'tap_at':
        return { type: 'tap_at', x: args.x, y: args.y, label: args.label || targetLabel };
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

  // Resolve with `timeoutValue` if `promise` doesn't settle within `ms`. Used to keep a
  // hung action executor from stalling the agent step (and the server's waitForClient).
  _withTimeout(promise, ms, timeoutValue) {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve(timeoutValue);
      }, ms);
      promise.then(
        (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } },
        (err) => { if (!done) { done = true; clearTimeout(timer); reject(err); } },
      );
    });
  }

  _send(msg) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      // Defensive: JSON.stringify throws on a circular value (raw DOM-bound element
      // props on framework-heavy pages). That used to silently drop the message — the
      // server then waited out the full step. Props are sanitized via _safeProps now,
      // but guard the serialize so a stray non-serializable field can never again make
      // a whole action_result vanish; send a degraded result instead of nothing.
      let payload;
      try {
        payload = JSON.stringify(msg);
      } catch (err) {
        logger.error('ServerAgentClient', `message not serializable (${err?.message}); sending degraded`);
        payload = JSON.stringify({
          type: msg.type,
          output: typeof msg.output === 'string' ? msg.output : '⚠️ result not serializable',
          screenState: { screenName: '', availableScreens: [], elementsText: '', elements: [] },
        });
      }
      this._ws.send(payload);
    }
  }

  _cleanup() {
    // Dismiss any open approval prompt so it can't outlive the session (fail-closed → REJECTED).
    this.callbacks?.onDismissPrompt?.();
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
