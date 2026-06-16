"use strict";

/**
 * AgentRuntime — The main agent loop.
 *
 * Flow:
 * 1. Walk Fiber tree → detect interactive elements
 * 2. Dehydrate screen → text for LLM
 * 3. Send to AI provider with tools
 * 4. Parse tool call → execute (tap, type, navigate, done)
 * 5. If not done, repeat from step 1 (re-dehydrate after UI change)
 */

import { logger } from "../utils/logger.js";
import { buildSystemPrompt, buildKnowledgeOnlyPrompt } from "./systemPrompt.js";
import { buildVerificationAction, createVerificationSnapshot, OutcomeVerifier } from "./OutcomeVerifier.js";
import { KnowledgeBaseService } from "../services/KnowledgeBaseService.js";
import { installAlertInterceptor, uninstallAlertInterceptor } from "./NativeAlertInterceptor.js";
import { createTapTool, createLongPressTool, createTypeTool, createScrollTool, createSliderTool, createPickerTool, createDatePickerTool, createKeyboardTool, createGuideTool, createSimplifyTool, createRenderBlockTool, createInjectCardTool, createRestoreTool } from "../tools/index.js";
import { actionRegistry } from "./ActionRegistry.js";
import { dataRegistry } from "./DataRegistry.js";
import { createProvider } from "../providers/ProviderFactory.js";
import { formatActionToolResult } from "../utils/actionResult.js";
import { normalizeRichContent, richContentToPlainText } from "./richContent.js";
import { DefaultActionSafetyClassifier } from "./DefaultActionSafetyClassifier.js";
const DEFAULT_MAX_STEPS = 25;
const DEFAULT_ACTION_SAFETY_TIMEOUT_MS = 300;
const DEFAULT_MIN_CONFIDENCE_TO_ALLOW = 0.75;
function generateTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
// ─── Action-safety helpers (ported from RN core for web↔RN parity) ───
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = hash * 31 + value.charCodeAt(i) | 0;
  }
  return Math.abs(hash).toString(36);
}
function stableJson(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (seen.has(value)) {
    return '"[Circular]"';
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return `[${value.map(entry => stableJson(entry, seen)).join(',')}]`;
  }
  const record = value;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableJson(record[key], seen)}`).join(',')}}`;
}
async function withTimeout(promise, timeoutMs) {
  let timeout = null;
  try {
    return await Promise.race([promise.then(value => ({
      status: 'resolved',
      value
    })), new Promise(resolve => {
      timeout = setTimeout(() => resolve({
        status: 'timeout'
      }), timeoutMs);
    })]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
function normalizeApprovalMatchText(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const APPROVAL_GRANTED_TOKEN = '__APPROVAL_GRANTED__';
const APPROVAL_REJECTED_TOKEN = '__APPROVAL_REJECTED__';
const APPROVAL_ALREADY_DONE_TOKEN = '__APPROVAL_ALREADY_DONE__';
const ASK_USER_CANCELLED_TOKEN = '__ASK_USER_CANCELLED__';
const USER_ALREADY_COMPLETED_MESSAGE = '✅ It looks like you already completed that step yourself. Great — let me know if you want help with anything else.';
const ACTION_NOT_APPROVED_MESSAGE = "Okay — I won't do that. If you'd like, I can help with something else instead.";
function looksLikeInternalPlanText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return false;
  return /^to\b.+\bi will\b/i.test(normalized) || /^i will\b/i.test(normalized) || /^next[:,]?\s/i.test(normalized);
}
// ─── Conversational loop detection ─────────────────────────────
// Reduce a reply to comparable tokens: lowercase, strip markdown/punctuation.
function normalizeReplyForCompare(s) {
  return String(s || '').toLowerCase().replace(/[`*_>#~]+/g, ' ').replace(/[^\w ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
// Length of the longest shared contiguous word run, capped at `target`. A run of
// `target` identical consecutive words is a strong signal of a reused canned phrase.
function sharedWordRun(wordsA, wordsB, target = 7) {
  if (wordsA.length < target || wordsB.length < target) return 0;
  const grams = new Set();
  for (let i = 0; i + target <= wordsB.length; i++) {
    grams.add(wordsB.slice(i, i + target).join(' '));
  }
  for (let i = 0; i + target <= wordsA.length; i++) {
    if (grams.has(wordsA.slice(i, i + target).join(' '))) return target;
  }
  return 0;
}
// True when two assistant replies are effectively the same message — verbatim,
// containment, ≥0.5 token Jaccard (heavy-overlap reword), or a shared 7-word run
// (reused canned phrase). Catches reworded "I understand why you might think that,
// but I don't see hello_world… would you like to try a template or upload" repeats
// where wording shifts but the substance and the canned question stay identical.
function isNearDuplicateReply(a, b) {
  const na = normalizeReplyForCompare(a);
  const nb = normalizeReplyForCompare(b);
  if (na.length < 12 || nb.length < 12) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  if (longer.includes(shorter) && shorter.length >= 24) return true;
  const wa = na.split(' ');
  const wb = nb.split(' ');
  const ta = new Set(wa);
  const tb = new Set(wb);
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter++;
  }
  const union = ta.size + tb.size - inter;
  if (union > 0 && inter / union >= 0.5) return true;
  return sharedWordRun(wa, wb) >= 7;
}
// Scan the recent assistant turns in the cross-task chat history. If the agent
// has already given a near-identical reply, it is stuck re-explaining a settled
// point and ignoring new user intents — return a breaker instruction to inject
// into this turn's prompt. Returns null when no repetition is detected.
function detectConversationalRepetition(chatHistory) {
  if (!Array.isArray(chatHistory) || chatHistory.length < 3) return null;
  const replies = chatHistory.filter(m => m && m.role === 'assistant' && typeof m.content === 'string').map(m => m.content);
  if (replies.length < 2) return null;
  const recent = replies.slice(-3);
  let repeated = false;
  for (let i = 0; i < recent.length - 1 && !repeated; i++) {
    for (let j = i + 1; j < recent.length; j++) {
      if (isNearDuplicateReply(recent[i], recent[j])) {
        repeated = true;
        break;
      }
    }
  }
  if (!repeated) return null;
  return '⚠️ LOOP DETECTED: You have already given the user a nearly identical answer on a previous turn. Do NOT send that same answer again. Treat the user\'s latest message as a NEW request and respond to it directly — take the action they asked for, provide new information, or ask ONE specific clarifying question. If their request genuinely cannot be done in this app, say so in ONE short sentence, offer the closest available alternative, and move on. Do not re-explain the earlier point.';
}
// ─── Agent Runtime ─────────────────────────────────────────────

export class AgentRuntime {
  tools = new Map();
  history = [];
  isRunning = false;
  isCancelRequested = false;
  taskAbortController = null;
  lastAskUserQuestion = null;
  knowledgeService = null;
  lastDehydratedRoot = null;
  currentTraceId = null;
  _cachedProviderTools = null;
  _cachedProviderToolMap = null;
  currentUserGoal = '';
  verifierProvider = null;
  outcomeVerifier = null;
  pendingCriticalVerification = null;
  staleMapWarned = false;

  // ─── Task-scoped error suppression ──────────────────────────
  // Installed once at execute() start, removed after grace period.
  // Catches ALL async errors (useEffect, native callbacks, PagerView)
  // that would otherwise crash the host app during agent execution.
  originalErrorHandler = null;
  lastSuppressedError = null;
  graceTimer = null;
  originalReportErrorsAsExceptions = undefined;

  // ─── App-action approval gate ────────────────────────────────
  // Copilot uses a workflow-scoped approval model:
  // - none: routine UI actions are blocked
  // - workflow: routine UI actions are allowed for the current task
  // Final irreversible commits are still protected separately by prompt rules
  // and aiConfirm-based confirmation checks.
  appActionApprovalScope = 'none';
  appActionApprovalSource = 'none';
  // ─── Action-safety classifier state (ported for web↔RN parity) ───
  actionSafetyCache = new Map();
  screenSafetyPromises = new Map();
  defaultActionSafetyClassifier = null;
  actionSafetyApprovedBoundaries = new Set();
  lastExplicitActionApproval = null;
  currentScreenSignature = '';
  currentScreenContent = '';
  // Tools that physically alter the app — must be gated by workflow approval
  static APP_ACTION_TOOLS = new Set(['tap', 'type', 'scroll', 'navigate', 'long_press', 'adjust_slider', 'select_picker', 'set_date', 'dismiss_keyboard']);
  static UI_EFFECT_TOOLS = new Set([...AgentRuntime.APP_ACTION_TOOLS, 'guide_user', 'simplify_zone', 'render_block', 'inject_card', 'restore_zone']);
  static NON_UI_TOOLS = new Set(['done', 'ask_user', 'wait', 'capture_screenshot', 'query_knowledge', 'query_data', 'escalate_to_human', 'report_issue', 'guide', 'simplify', 'restore', 'web_search']);
  getConfig() {
    return this.config;
  }
  async executeQueryData(args) {
    const sourceName = typeof args.source === 'string' ? args.source.trim() : '';
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!sourceName) {
      return '❌ query_data requires a non-empty source name.';
    }
    const source = dataRegistry.get(sourceName);
    if (!source) {
      const available = dataRegistry.getAll().map(entry => entry.name);
      return available.length > 0 ? `❌ Unknown data source "${sourceName}". Available sources: ${available.join(', ')}.` : '❌ No app data sources are currently registered.';
    }
    try {
      const result = await source.handler({
        query,
        screenName: this.getNavigationSnapshot().currentScreenName
      });
      if (result === null || result === undefined) {
        return `No data returned from "${sourceName}".`;
      }
      if (typeof result === 'string') {
        return result;
      }
      const serialized = JSON.stringify(result, null, 2);
      const maxChars = 12000;
      if (serialized.length <= maxChars) {
        return serialized;
      }
      return `${serialized.slice(0, maxChars)}\n... [truncated]`;
    } catch (error) {
      return `❌ Data source "${sourceName}" failed: ${error?.message || 'Unknown error'}`;
    }
  }
  resetAppActionApproval(reason) {
    this.appActionApprovalScope = 'none';
    this.appActionApprovalSource = 'none';
    this.lastExplicitActionApproval = null;
    logger.info('AgentRuntime', `🔒 Workflow approval cleared (${reason})`);
  }
  grantWorkflowApproval(source, reason) {
    this.appActionApprovalScope = 'workflow';
    this.appActionApprovalSource = source;
    logger.info('AgentRuntime', `✅ Workflow approval granted via ${source} (${reason})`);
  }
  hasWorkflowApproval() {
    return this.appActionApprovalScope === 'workflow' && this.appActionApprovalSource !== 'none';
  }
  // ─── Action safety classifier (ported from RN core for web↔RN parity) ──────
  // The web build has NO react-native dependency, so RN's Alert.alert confirmation
  // fallback is intentionally dropped here — confirmation runs through onAskUser
  // only (mirroring how ask_user already works on web).
  rememberExplicitActionApproval(question) {
    this.lastExplicitActionApproval = {
      question,
      userGoal: this.currentUserGoal,
      screenName: this.getNavigationSnapshot().currentScreenName,
      approvedAt: Date.now()
    };
    logger.info('AgentRuntime', '✅ Fresh action approval remembered for semantic safety gate');
  }
  getActionSafetyTimeoutMs() {
    return this.config.actionSafety?.classifierTimeoutMs ?? DEFAULT_ACTION_SAFETY_TIMEOUT_MS;
  }
  getMinConfidenceToAllow() {
    return this.config.actionSafety?.minConfidenceToAllow ?? DEFAULT_MIN_CONFIDENCE_TO_ALLOW;
  }
  isActionSafetyEnabled() {
    if (this.config.actionSafety?.enabled === false) return false;
    if (this.config.interactionMode === 'companion') return true;
    if (this.config.interactionMode === 'autopilot' && this.config.actionSafety?.enabled !== true) {
      return !!this.config.actionSafety?.classifier;
    }
    return true;
  }
  getActionSafetyClassifier() {
    const configured = this.config.actionSafety?.classifier;
    if (configured === false) return null;
    if (configured && configured !== 'default') return configured;
    const shouldUseDefault = configured === 'default' || this.config.interactionMode === 'copilot' || this.config.interactionMode === 'autopilot' && this.config.actionSafety?.enabled === true;
    if (!shouldUseDefault) return null;
    if (!this.defaultActionSafetyClassifier) {
      this.defaultActionSafetyClassifier = new DefaultActionSafetyClassifier({
        config: this.config
      });
    }
    return this.defaultActionSafetyClassifier;
  }
  getScreenSignature(screen, screenContent) {
    if (!screen) return 'no-screen';
    const elementSummary = screen.elements.map(element => `${element.index}:${element.type}:${element.label}:${element.requiresConfirmation === true}`).join('|');
    return hashString([screen.screenName, screen.availableScreens.join(','), screenContent ?? screen.elementsText, elementSummary].join('\n'));
  }
  getElementSignature(element) {
    if (!element) return 'no-target';
    return hashString([element.index, element.type, element.label, element.requiresConfirmation === true, element.analyticsElementKind ?? '', element.analyticsComponentName ?? ''].join('|'));
  }
  getElementSafetyCacheKey(screenSignature, element) {
    return `${this.currentTraceId ?? 'trace'}:${screenSignature}:element:${element.index}:${this.getElementSignature(element)}`;
  }
  getActionSafetyCacheKey(screenSignature, toolName, args, targetElement) {
    if (targetElement) {
      return this.getElementSafetyCacheKey(screenSignature, targetElement);
    }
    return `${this.currentTraceId ?? 'trace'}:${screenSignature}:tool:${toolName}:${hashString(stableJson(args))}`;
  }
  getPolicyTargetElement(toolName, args) {
    if (!AgentRuntime.UI_EFFECT_TOOLS.has(toolName)) return undefined;
    const index = args?.index;
    if (typeof index !== 'number') return undefined;
    const screen = this.lastDehydratedRoot;
    return screen?.elements?.find(element => element.index === index);
  }
  getToolEffect(toolName, tool) {
    if (tool?.effect) return tool.effect;
    switch (toolName) {
      case 'query_data':
      case 'query_knowledge':
      case 'web_search':
      case 'capture_screenshot':
        return 'read';
      case 'escalate_to_human':
      case 'report_issue':
        return 'support';
      case 'navigate':
      case 'scroll':
      case 'guide_user':
        return 'navigate';
      case 'type':
        return 'fill';
      case 'select_picker':
      case 'adjust_slider':
      case 'set_date':
      case 'dismiss_keyboard':
        return 'select';
      case 'tap':
      case 'long_press':
      case 'render_block':
      case 'inject_card':
      case 'simplify_zone':
      case 'restore_zone':
        return 'unknown';
      default:
        return 'unknown';
    }
  }
  isSafetyGatedTool(toolName, tool) {
    if (tool?.requiresFreshApproval) return true;
    if (AgentRuntime.NON_UI_TOOLS.has(toolName)) return false;
    if (AgentRuntime.UI_EFFECT_TOOLS.has(toolName)) return true;
    return !!tool?.effect;
  }
  normalizeSafetyDecision(decision, source, toolName, args, targetElement) {
    let normalized = {
      ...decision
    };
    const decisionContext = {
      source,
      toolName,
      args,
      targetElement
    };
    const override = this.config.actionSafety?.overrideDecision?.({
      ...normalized,
      ...decisionContext
    });
    if (override) {
      normalized = {
        ...override,
        reason: override.reason || normalized.reason || 'Decision overridden by app policy.'
      };
    }
    const confidence = normalized.confidence ?? 1;
    if (normalized.decision === 'allow' && confidence < this.getMinConfidenceToAllow()) {
      normalized = {
        decision: 'ask',
        confidence,
        reason: normalized.reason || `Safety confidence ${confidence.toFixed(2)} is below the allow threshold.`,
        userMessage: normalized.userMessage || 'I am not fully sure this action is safe to do automatically. Do you want me to continue?'
      };
    }
    this.config.actionSafety?.onDecision?.({
      ...normalized,
      ...decisionContext
    });
    this.emitTrace('action_safety_decision', {
      source,
      tool: toolName,
      args,
      targetLabel: targetElement?.label,
      decision: normalized.decision,
      confidence: normalized.confidence,
      scope: normalized.scope,
      capability: normalized.capability,
      risk: normalized.risk,
      reason: normalized.reason
    });
    return normalized;
  }
  async startScreenSafetyPreclassification(screen, screenContent, stepIndex) {
    const classifier = this.getActionSafetyClassifier();
    if (!this.isActionSafetyEnabled() || !classifier || screen.elements.length === 0) {
      return;
    }
    const screenSignature = this.getScreenSignature(screen, screenContent);
    this.currentScreenSignature = screenSignature;
    if (this.screenSafetyPromises.has(screenSignature)) return;
    const promise = (async () => {
      const result = await withTimeout(classifier.classifyScreen({
        userRequest: this.currentUserGoal,
        screen,
        screenContent,
        screenSignature,
        mode: this.config.interactionMode || 'copilot',
        history: this.history
      }), this.getActionSafetyTimeoutMs());
      if (result.status === 'timeout') {
        this.emitTrace('action_safety_preclassification_timeout', {
          screenSignature
        }, stepIndex);
        return;
      }
      const safetyMap = result.value;
      for (const [rawIndex, decision] of Object.entries(safetyMap.decisions ?? {})) {
        const index = Number(rawIndex);
        const element = screen.elements.find(entry => entry.index === index);
        if (!element) continue;
        this.actionSafetyCache.set(this.getElementSafetyCacheKey(screenSignature, element), decision);
      }
      this.emitTrace('action_safety_preclassified', {
        screenSignature,
        decisionCount: Object.keys(safetyMap.decisions ?? {}).length
      }, stepIndex);
    })().catch(error => {
      this.emitTrace('action_safety_preclassification_failed', {
        screenSignature,
        error: error?.message ?? String(error)
      }, stepIndex);
    }).finally(() => {
      this.screenSafetyPromises.delete(screenSignature);
    });
    this.screenSafetyPromises.set(screenSignature, promise);
  }
  async evaluateActionSafety(tool, args, toolName, _stepIndex) {
    const targetElement = this.getPolicyTargetElement(toolName, args);
    const screen = this.lastDehydratedRoot ?? null;
    const screenSignature = this.currentScreenSignature || this.getScreenSignature(screen, this.currentScreenContent);
    const toolEffect = this.getToolEffect(toolName, tool);
    if (!this.isActionSafetyEnabled()) {
      return this.normalizeSafetyDecision({
        decision: 'allow',
        reason: 'Action safety is disabled.'
      }, 'disabled', toolName, args, targetElement);
    }
    if (!this.isSafetyGatedTool(toolName, tool)) {
      return this.normalizeSafetyDecision({
        decision: 'allow',
        reason: 'Tool is not UI/action safety-gated.'
      }, 'deterministic', toolName, args, targetElement);
    }
    if (this.config.interactionMode === 'companion' && AgentRuntime.UI_EFFECT_TOOLS.has(toolName)) {
      return this.normalizeSafetyDecision({
        decision: 'block',
        reason: 'Companion mode cannot execute UI-control tools.',
        userMessage: 'I can guide you, but I cannot control the app in companion mode.'
      }, 'deterministic', toolName, args, targetElement);
    }
    if (tool?.requiresFreshApproval) {
      return this.normalizeSafetyDecision({
        decision: 'ask',
        reason: 'This tool starts external communication and requires fresh approval.',
        userMessage: `I can start the outbound AI call now. Do you approve calling ${String(args.targetType ?? 'the contact')}:${String(args.targetId ?? '')}?`,
        capability: 'support.escalate',
        scope: 'support_investigation',
        risk: 'high',
        requiresFreshApproval: true
      }, 'deterministic', toolName, args, targetElement);
    }
    if (toolEffect === 'read' || toolEffect === 'support' || toolEffect === 'navigate' || toolEffect === 'fill' || toolEffect === 'select') {
      return this.normalizeSafetyDecision({
        decision: 'allow',
        reason: `Known low-risk tool effect: ${toolEffect}.`
      }, 'deterministic', toolName, args, targetElement);
    }
    if (toolEffect === 'commit' || toolEffect === 'payment' || toolEffect === 'destructive') {
      return this.normalizeSafetyDecision({
        decision: 'ask',
        reason: `Tool effect "${toolEffect}" requires explicit approval.`,
        userMessage: 'This action may make a real change. Do you want me to continue?'
      }, 'deterministic', toolName, args, targetElement);
    }
    const cacheKey = this.getActionSafetyCacheKey(screenSignature, toolName, args, targetElement);
    const cached = this.actionSafetyCache.get(cacheKey);
    if (cached) {
      return this.normalizeSafetyDecision(cached, 'cache', toolName, args, targetElement);
    }
    const pendingPreclassification = this.screenSafetyPromises.get(screenSignature);
    if (pendingPreclassification) {
      await withTimeout(pendingPreclassification, this.getActionSafetyTimeoutMs());
      const refreshed = this.actionSafetyCache.get(cacheKey);
      if (refreshed) {
        return this.normalizeSafetyDecision(refreshed, 'cache', toolName, args, targetElement);
      }
    }
    const classifier = this.getActionSafetyClassifier();
    if (!classifier) {
      return this.normalizeSafetyDecision({
        decision: 'allow',
        reason: this.config.actionSafety?.classifier === false ? 'Semantic action safety classifier is disabled by configuration.' : 'No semantic action safety classifier is configured.'
      }, this.config.actionSafety?.classifier === false ? 'disabled' : 'deterministic', toolName, args, targetElement);
    }
    const input = {
      userRequest: this.currentUserGoal,
      toolName,
      args,
      targetElement,
      screen,
      screenContent: this.currentScreenContent,
      screenSignature,
      mode: this.config.interactionMode || 'copilot',
      history: this.history,
      toolEffect
    };
    const result = await withTimeout(classifier.classifyAction(input), this.getActionSafetyTimeoutMs());
    if (result.status === 'timeout') {
      return this.normalizeSafetyDecision({
        decision: 'ask',
        confidence: 0,
        reason: 'Semantic action safety classifier timed out.',
        userMessage: 'I need your confirmation before I continue with this action.',
        capability: 'unknown',
        scope: 'unknown_task',
        risk: 'medium'
      }, 'timeout', toolName, args, targetElement);
    }
    this.actionSafetyCache.set(cacheKey, result.value);
    return this.normalizeSafetyDecision(result.value, 'classifier', toolName, args, targetElement);
  }
  async enforceActionSafetyDecision(decision, toolName, args, stepIndex) {
    if (decision.decision === 'allow') return null;
    if (decision.decision === 'block') {
      const message = decision.userMessage || `Action blocked by safety guard: ${decision.reason}`;
      const agentMessage = `SAFETY_BLOCKED: ${message} Do not retry this action. Explain the limitation to the user and offer a safe alternative.`;
      this.emitTrace('action_safety_blocked', {
        tool: toolName,
        args,
        reason: decision.reason,
        message,
        scope: decision.scope,
        capability: decision.capability,
        risk: decision.risk
      }, stepIndex);
      return agentMessage;
    }
    const question = decision.userMessage || 'Do you want me to continue with this action?';
    this.emitTrace('action_safety_approval_required', {
      tool: toolName,
      args,
      reason: decision.reason,
      question,
      scope: decision.scope,
      capability: decision.capability,
      risk: decision.risk
    }, stepIndex);
    if (decision.requiresFreshApproval && this.hasMatchingExplicitActionApproval(decision, toolName, args)) {
      this.rememberActionSafetyApproval(decision);
      this.emitTrace('action_safety_fresh_approval_reused', {
        tool: toolName,
        args,
        reason: decision.reason,
        scope: decision.scope,
        capability: decision.capability,
        risk: decision.risk
      }, stepIndex);
      return null;
    }
    if (this.canReuseActionSafetyApproval(decision)) {
      this.emitTrace('action_safety_approval_reused', {
        tool: toolName,
        args,
        reason: decision.reason,
        scope: decision.scope,
        capability: decision.capability,
        risk: decision.risk
      }, stepIndex);
      return null;
    }
    if (this.config.actionSafety?.userOverride?.allowAskDecision === false) {
      this.emitTrace('action_safety_user_override_disabled', {
        tool: toolName,
        args,
        reason: decision.reason
      }, stepIndex);
      return `Action needs approval but user override is disabled: ${decision.reason}`;
    }
    if (this.config.onAskUser) {
      const response = await this.config.onAskUser({
        question,
        kind: 'approval'
      });
      if (response === APPROVAL_GRANTED_TOKEN || /^yes|allow|confirm|continue$/i.test(String(response).trim())) {
        this.rememberActionSafetyApproval(decision);
        this.emitTrace('action_safety_approved', {
          tool: toolName,
          args
        }, stepIndex);
        return null;
      }
      this.emitTrace('action_safety_rejected', {
        tool: toolName,
        args,
        response: String(response)
      }, stepIndex);
      return ACTION_NOT_APPROVED_MESSAGE;
    }
    // Web has no native Alert fallback (RN-only). Without an onAskUser callback we
    // cannot obtain confirmation, so fail safe by refusing the action.
    return `Action needs confirmation but no approval UI is available: ${decision.reason}`;
  }
  getActionSafetyBoundaryKey(decision) {
    if (!decision.scope || !decision.capability || !decision.risk) return null;
    return `${decision.scope}:${decision.capability}:${decision.risk}`;
  }
  hasMatchingExplicitActionApproval(decision, toolName, args) {
    const approval = this.lastExplicitActionApproval;
    if (!approval || this.appActionApprovalSource !== 'explicit_button') return false;
    if (Date.now() - approval.approvedAt > 2 * 60 * 1000) return false;
    if (approval.userGoal !== this.currentUserGoal) return false;
    // Intentionally do NOT require the same screenName. A confirmed destructive
    // action commonly opens a confirm modal or re-renders the list, shifting the
    // screen between the user's "Allow" and the actual tap. Requiring an exact
    // screen match here caused an infinite re-confirmation loop (Allow → screen
    // drifts → approval no longer matches → agent re-asks → repeat). Safety is
    // still bounded by the 2-min TTL, the matching userGoal, and the target-label
    // relevance checks below.
    const target = this.getPolicyTargetElement(toolName, args);
    const approvalText = normalizeApprovalMatchText(approval.question);
    const goalText = normalizeApprovalMatchText(this.currentUserGoal);
    const targetText = normalizeApprovalMatchText(target?.label);
    if (!targetText) return false;
    const targetWords = targetText.split(' ').filter(word => word.length >= 4);
    const targetMentioned = approvalText.includes(targetText) || goalText.includes(targetText) || targetWords.some(word => approvalText.includes(word) && goalText.includes(word));
    if (!targetMentioned) return false;
    if (decision.scope && decision.scope !== 'unknown_task') {
      const scopeHint = normalizeApprovalMatchText(decision.scope.replace(/_/g, ' '));
      if (scopeHint && !approvalText.includes(scopeHint) && !goalText.includes(scopeHint) && targetWords.length === 0) {
        return false;
      }
    }
    return true;
  }
  canReuseActionSafetyApproval(decision) {
    const reuse = this.config.actionSafety?.approvalReuse ?? 'risk-boundary';
    if (reuse === 'none' || decision.requiresFreshApproval) return false;
    if (decision.risk === 'high' || decision.risk === 'critical') return false;
    const boundaryKey = this.getActionSafetyBoundaryKey(decision);
    if (boundaryKey && this.actionSafetyApprovedBoundaries.has(boundaryKey)) {
      return true;
    }
    if (!this.hasWorkflowApproval()) return false;
    if (reuse === 'workflow') return true;
    return decision.risk === 'low';
  }
  rememberActionSafetyApproval(decision) {
    const boundaryKey = this.getActionSafetyBoundaryKey(decision);
    if (boundaryKey) {
      this.actionSafetyApprovedBoundaries.add(boundaryKey);
    }
  }
  debugLogChunked(label, text, chunkSize = 1600) {
    if (!text) {
      logger.debug('AgentRuntime', `${label}: (empty)`);
      return;
    }
    logger.debug('AgentRuntime', `${label} (length=${text.length})`);
    for (let start = 0; start < text.length; start += chunkSize) {
      const end = Math.min(start + chunkSize, text.length);
      const chunkIndex = Math.floor(start / chunkSize) + 1;
      const chunkCount = Math.ceil(text.length / chunkSize);
      logger.debug('AgentRuntime', `${label} [chunk ${chunkIndex}/${chunkCount}]`, text.slice(start, end));
    }
  }
  formatInteractiveForDebug(element) {
    const props = element.props || {};
    const stateParts = [];
    if (props.accessibilityRole) stateParts.push(`role=${String(props.accessibilityRole)}`);
    if (props.value !== undefined && typeof props.value !== 'function') stateParts.push(`value=${String(props.value)}`);
    if (props.checked !== undefined && typeof props.checked !== 'function') stateParts.push(`checked=${String(props.checked)}`);
    if (props.selected !== undefined && typeof props.selected !== 'function') stateParts.push(`selected=${String(props.selected)}`);
    if (props.enabled !== undefined && typeof props.enabled !== 'function') stateParts.push(`enabled=${String(props.enabled)}`);
    if (props.disabled === true) stateParts.push('disabled=true');
    if (element.aiPriority) stateParts.push(`aiPriority=${element.aiPriority}`);
    if (element.zoneId) stateParts.push(`zoneId=${element.zoneId}`);
    if (element.requiresConfirmation) stateParts.push('requiresConfirmation=true');
    const summary = `[${element.index}] <${element.type}> "${element.label}"`;
    return stateParts.length > 0 ? `${summary} | ${stateParts.join(' | ')}` : summary;
  }
  debugScreenSnapshot(screenName, elements, rawElementsText, transformedScreenContent, contextMessage) {
    const interactiveSummary = elements.length > 0 ? elements.map(element => this.formatInteractiveForDebug(element)).join('\n') : '(no interactive elements)';
    logger.debug('AgentRuntime', `Screen snapshot for "${screenName}" | interactiveCount=${elements.length}`);
    this.debugLogChunked('Interactive inventory', interactiveSummary);
    this.debugLogChunked('Raw dehydrated elementsText', rawElementsText);
    if (transformedScreenContent !== rawElementsText) {
      this.debugLogChunked('Transformed screen content', transformedScreenContent);
    }
    if (contextMessage) {
      this.debugLogChunked('Full provider context message', contextMessage);
    }
  }
  constructor(provider, config, _rootRef, _navRef) {
    this.provider = provider;
    this.config = config;
    logger.debug('AgentRuntime', 'constructor: config.screenMap exists:', !!config.screenMap);

    // Initialize knowledge base service if configured
    if (config.knowledgeBase) {
      this.knowledgeService = new KnowledgeBaseService(config.knowledgeBase, config.knowledgeMaxTokens);
    }

    // Register tools based on mode
    if (config.enableUIControl === false) {
      this.registerKnowledgeOnlyTools();
    } else {
      this.registerBuiltInTools();
    }

    // Apply customTools
    if (config.customTools) {
      for (const [name, tool] of Object.entries(config.customTools)) {
        if (tool === null) {
          this.tools.delete(name);
          this.invalidateToolCache();
          logger.info('AgentRuntime', `Removed tool: ${name}`);
        } else {
          this.tools.set(name, tool);
          this.invalidateToolCache();
          logger.info('AgentRuntime', `Overrode tool: ${name}`);
        }
      }
    }
  }

  /**
   * Drop the memoized provider-tool list so the next buildToolsForProvider()
   * rebuild picks up live changes — e.g. actions registered/unregistered via
   * useAction() after the runtime was constructed. Mirrors RN AgentRuntime.
   */
  invalidateToolCache() {
    this._cachedProviderTools = null;
    this._cachedProviderToolMap = null;
  }
  getVerifier() {
    if (this.config.verifier?.enabled === false) {
      return null;
    }
    if (!this.outcomeVerifier) {
      const verifierConfig = this.config.verifier;
      if (verifierConfig?.provider || verifierConfig?.model || verifierConfig?.proxyUrl || verifierConfig?.proxyHeaders) {
        this.verifierProvider = createProvider(verifierConfig.provider || this.config.provider || 'gemini', this.config.apiKey, verifierConfig.model || this.config.model, verifierConfig.proxyUrl || this.config.proxyUrl, verifierConfig.proxyHeaders || this.config.proxyHeaders);
      } else {
        this.verifierProvider = this.provider;
      }
      this.outcomeVerifier = new OutcomeVerifier(this.verifierProvider, this.config);
    }
    return this.outcomeVerifier;
  }
  createCurrentVerificationSnapshot(screenName, screenContent, elements, screenshot) {
    return createVerificationSnapshot(screenName, screenContent, elements, screenshot);
  }
  async updateCriticalVerification(screenName, screenContent, elements, screenshot, stepIndex) {
    if (!this.pendingCriticalVerification) return;
    const verifier = this.getVerifier();
    if (!verifier) {
      this.pendingCriticalVerification = null;
      return;
    }
    const postAction = this.createCurrentVerificationSnapshot(screenName, screenContent, elements, screenshot);
    this.pendingCriticalVerification.followupSteps += 1;
    const result = await verifier.verify({
      goal: this.pendingCriticalVerification.goal,
      action: this.pendingCriticalVerification.action,
      preAction: this.pendingCriticalVerification.preAction,
      postAction
    });
    this.emitTrace('critical_action_verified', {
      action: this.pendingCriticalVerification.action.toolName,
      label: this.pendingCriticalVerification.action.label,
      status: result.status,
      failureKind: result.failureKind,
      evidence: result.evidence,
      missingFields: result.missingFields,
      validationMessages: result.validationMessages,
      source: result.source,
      followupSteps: this.pendingCriticalVerification.followupSteps
    }, stepIndex);
    if (result.status === 'success') {
      this.pendingCriticalVerification = null;
      return;
    }
    if (result.status === 'error') {
      const validationDetails = result.validationMessages?.length ? ` Visible validation messages: ${result.validationMessages.join(' | ')}.` : '';
      if (result.failureKind === 'controllable' && result.missingFields && result.missingFields.length > 0) {
        const fieldLabel = result.missingFields.join(', ');
        const bundleInstruction = result.missingFields.length > 1 ? `Visible missing required fields: ${fieldLabel}. Before retrying the submit/save/confirm action, collect ALL of them in ONE ask_user(grants_workflow_approval=true) call. Do not ask one field at a time or retry between partial answers unless a new validation error appears after filling these fields.` : `Visible missing required field: ${fieldLabel}. Ask for it with ask_user(grants_workflow_approval=true) before retrying the submit/save/confirm action.`;
        this.observations.push(`Outcome verifier: The previous action "${this.pendingCriticalVerification.action.label}" did NOT complete successfully. ${result.evidence}${validationDetails} Treat this as a controllable failure. ${bundleInstruction}`);
        return;
      }
      this.observations.push(`Outcome verifier: The previous action "${this.pendingCriticalVerification.action.label}" did NOT complete successfully. ${result.evidence}${validationDetails} Treat this as a ${result.failureKind} failure, do not claim success, and either recover or explain the issue clearly.`);
      return;
    }
    const maxFollowupSteps = verifier.getMaxFollowupSteps();
    const ageNote = this.pendingCriticalVerification.followupSteps >= maxFollowupSteps ? ` This critical action is still unverified after ${this.pendingCriticalVerification.followupSteps} follow-up checks.` : '';
    this.observations.push(`Outcome verifier: The previous action "${this.pendingCriticalVerification.action.label}" is still unverified. ${result.evidence}${ageNote} Before calling done(success=true), keep checking for success or error evidence on the current screen.`);
  }
  maybeStartCriticalVerification(toolName, args, preAction) {
    const verifier = this.getVerifier();
    if (!verifier) return;
    const action = buildVerificationAction(toolName, args, preAction.elements, this.getToolStatusLabel(toolName, args));
    if (!verifier.isCriticalAction(action)) {
      return;
    }
    this.pendingCriticalVerification = {
      goal: this.currentUserGoal,
      action,
      preAction,
      followupSteps: 0
    };
  }
  shouldBlockSuccessCompletion() {
    return this.pendingCriticalVerification !== null;
  }

  // ─── Tool Registration ─────────────────────────────────────

  registerBuiltInTools() {
    const toolContext = {
      platformAdapter: this.getPlatformAdapter()
    };

    // ── Register modular tools (extracted to src/tools/) ──
    const modularTools = [createTapTool(toolContext), createLongPressTool(toolContext), createTypeTool(toolContext), createScrollTool(toolContext), createSliderTool(toolContext), createPickerTool(toolContext), createDatePickerTool(toolContext), createKeyboardTool(toolContext), createGuideTool(toolContext), createSimplifyTool(toolContext), createRenderBlockTool(toolContext), createInjectCardTool(toolContext), createRestoreTool(toolContext)];
    for (const tool of modularTools) {
      this.tools.set(tool.name, tool);
    }

    // navigate — navigate to a screen (supports React Navigation + Expo Router)
    this.tools.set('navigate', {
      name: 'navigate',
      description: 'Navigate to a top-level screen by name. ONLY use this for top-level screens that do NOT require route params (e.g. Login, Settings, Cart, TabBar). NEVER use this for parameterized screens that require an ID or selection (e.g. DishDetail, SelectCategory, ProfileDetail, OrderDetails) — those screens will crash without required params. For parameterized screens, always navigate by TAPPING the relevant item in the parent screen instead.',
      parameters: {
        screen: {
          type: 'string',
          description: 'Top-level screen name to navigate to (must not require route params)',
          required: true
        },
        params: {
          type: 'string',
          description: 'Optional JSON params object for screens that accept them',
          required: false
        }
      },
      execute: async args => {
        return this.getPlatformAdapter().executeAction({
          type: 'navigate',
          screen: String(args.screen),
          params: args.params
        });
      }
    });

    // done — complete the task
    this.tools.set('done', {
      name: 'done',
      description: 'Complete the task with a user-facing response. Use text for simple replies, or use reply (JSON string) plus previewText for rich chat replies.',
      parameters: {
        text: {
          type: 'string',
          description: 'Response message to the user',
          required: false
        },
        reply: {
          type: 'string',
          description: 'Optional JSON string representing an array of rich reply nodes for chat rendering.',
          required: false
        },
        previewText: {
          type: 'string',
          description: 'Plain text preview used for history, notifications, and transcript previews.',
          required: false
        },
        message: {
          type: 'string',
          description: 'Alternative to text parameter',
          required: false
        },
        success: {
          type: 'boolean',
          description: 'Whether the task was completed successfully',
          required: true
        }
      },
      execute: async args => {
        let cleanText = args.previewText || args.text || args.message || '';
        const structuredCandidate = typeof args.reply === 'string' ? args.reply : typeof args.text === 'string' ? args.text : typeof args.message === 'string' ? args.message : '';
        if (!args.previewText && typeof structuredCandidate === 'string') {
          try {
            const parsed = JSON.parse(structuredCandidate);
            cleanText = richContentToPlainText(normalizeRichContent(parsed, cleanText), cleanText);
          } catch {
            // Fall through to normal text cleaning when the payload is not JSON.
          }
        }
        if (typeof cleanText === 'string') {
          // Strip bracketed indices safely avoiding regex stack overflows on large strings
          cleanText = cleanText.replace(/\[\d+\]/g, '').replace(/  +/g, ' ').trim();
        }
        return cleanText;
      }
    });

    // wait — explicitly wait for loading states
    this.tools.set('wait', {
      name: 'wait',
      description: 'Wait for a specified number of seconds before taking the next action. Use this when the screen explicitly shows "Loading...", "Please wait", or loading skeletons, to give the app time to fetch data.',
      parameters: {
        seconds: {
          type: 'number',
          description: 'Number of seconds to wait (max 5)',
          required: true
        }
      },
      execute: async args => {
        const seconds = Math.min(Number(args.seconds) || 2, 5);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        return `⏳ Waited ${seconds} seconds for the screen to update.`;
      }
    });

    // ask_user — ask for clarification
    this.tools.set('ask_user', {
      name: 'ask_user',
      description: 'Communicate with the user. Use this to ask questions, request explicit permission for app actions, answer a direct user question, or collect missing low-risk workflow data that can authorize routine in-flow steps.',
      parameters: {
        question: {
          type: 'string',
          description: 'The message or question to say to the user',
          required: true
        },
        request_app_action: {
          type: 'boolean',
          description: 'Set to true when requesting permission to take an action in the app (navigate, tap, investigate). Shows explicit approval buttons to the user.',
          required: true
        },
        grants_workflow_approval: {
          type: 'boolean',
          description: 'Optional. Set to true only when asking for missing low-risk input or a low-risk selection that you will directly apply in the current action workflow. If the user answers, their answer authorizes routine in-flow actions like typing/selecting/toggling, but NOT irreversible final commits or support investigations.',
          required: false
        }
      },
      execute: async args => {
        // Strip any leaked bracketed indices like [41] safely
        let cleanQuestion = args.question || '';
        if (typeof cleanQuestion === 'string') {
          cleanQuestion = cleanQuestion.replace(/\[\d+\]/g, '').replace(/  +/g, ' ').trim();
        }
        const wantsExplicitAppApproval = args.request_app_action === true;
        const grantsWorkflowApproval = args.grants_workflow_approval === true;
        const kind = wantsExplicitAppApproval ? 'approval' : 'freeform';

        // Mark that an explicit approval checkpoint is now pending.
        if (wantsExplicitAppApproval) {
          this.resetAppActionApproval('explicit approval requested');
          logger.info('AgentRuntime', '🔒 App action gate: explicit approval requested, UI tools now BLOCKED until granted');
        } else if (grantsWorkflowApproval) {
          logger.info('AgentRuntime', '📝 ask_user will grant workflow approval if the user answers with routine action data');
        }
        logger.info('AgentRuntime', `❓ ask_user emitted (kind=${kind}): "${cleanQuestion}"`);
        if (this.config.onAskUser) {
          // Block until user responds, then continue the loop
          this.config.onStatusUpdate?.('Waiting for your answer...');
          logger.info('AgentRuntime', `⏸️ Waiting for user response via onAskUser callback (kind=${kind})`);
          const answer = await this.config.onAskUser({
            question: cleanQuestion,
            kind
          });
          logger.info('AgentRuntime', `✅ ask_user resolved with: "${String(answer)}"`);

          // Resolve approval gate based on button response
          if (answer === '__APPROVAL_GRANTED__') {
            this.grantWorkflowApproval('explicit_button', 'user tapped Allow');
            this.rememberExplicitActionApproval(cleanQuestion);
          } else if (answer === '__APPROVAL_REJECTED__') {
            this.resetAppActionApproval('explicit approval rejected');
            logger.info('AgentRuntime', '🚫 App action gate: REJECTED — UI tools remain blocked');
            return ACTION_NOT_APPROVED_MESSAGE;
          } else if (answer === ASK_USER_CANCELLED_TOKEN) {
            logger.info('AgentRuntime', '🛑 ask_user cancelled by user before answering');
            return 'User cancelled the follow-up question instead of answering. Do not assume an answer; acknowledge the cancellation and only ask again if the task still requires it.';
          } else if (grantsWorkflowApproval && typeof answer === 'string' && answer.trim().length > 0) {
            this.grantWorkflowApproval('user_input', 'user supplied requested workflow data');
          }
          // Any other text answer leaves workflow approval unchanged.

          return `User answered: ${answer}`;
        }
        // Legacy fallback: break the loop (context will be lost)
        logger.warn('AgentRuntime', '⚠️ ask_user has no onAskUser callback; returning legacy fallback');
        return `❓ ${cleanQuestion}`;
      }
    });

    // capture_screenshot — on-demand visual capture (for image/video content questions)
    this.tools.set('capture_screenshot', {
      name: 'capture_screenshot',
      description: 'Capture the SDK root component as an image. Use when the user asks about visual content (images, videos, colors, layout appearance) that cannot be determined from the element tree alone.',
      parameters: {},
      execute: async () => {
        const screenshot = await this.getPlatformAdapter().captureScreenshot();
        if (screenshot) {
          return `✅ Screenshot captured (${Math.round(screenshot.length / 1024)}KB). Visual content is now available for analysis.`;
        }
        return '❌ Screenshot capture failed. react-native-view-shot is required and must be installed in your app.';
      }
    });

    // query_knowledge — retrieve domain-specific knowledge (only if knowledgeBase is configured)
    if (this.knowledgeService) {
      this.tools.set('query_knowledge', {
        name: 'query_knowledge',
        description: 'Search the app knowledge base for domain-specific information ' + '(policies, FAQs, product details, delivery areas, allergens, etc). ' + 'Use when the user asks about the business or app and the answer is NOT visible on screen.',
        parameters: {
          question: {
            type: 'string',
            description: 'The question or topic to search for',
            required: true
          }
        },
        execute: async args => {
          const screenName = this.getNavigationSnapshot().currentScreenName;
          return this.knowledgeService.retrieve(args.question, screenName);
        }
      });
    }
    this.tools.set('query_data', {
      name: 'query_data',
      description: 'Query an app-registered data source for structured async data such as products, recommendations, inventory, live pricing, or order status. Use when the app exposes a named data source and it is more reliable than inferring from the current screen.',
      parameters: {
        source: {
          type: 'string',
          description: 'The registered data source name to query',
          required: true
        },
        query: {
          type: 'string',
          description: 'What data you need from that source',
          required: true
        }
      },
      execute: async args => this.executeQueryData(args)
    });
  }

  /**
   * Register only knowledge-assistant tools (no UI control).
   * Used when enableUIControl = false — the AI can only answer questions.
   */
  registerKnowledgeOnlyTools() {
    // done — complete the task
    this.tools.set('done', {
      name: 'done',
      description: 'Complete the task with a message to the user.',
      parameters: {
        text: {
          type: 'string',
          description: 'Response message to the user',
          required: true
        },
        success: {
          type: 'boolean',
          description: 'Whether the task was completed successfully',
          required: true
        }
      },
      execute: async args => {
        return args.text;
      }
    });

    // query_knowledge — retrieve domain-specific knowledge (only if knowledgeBase is configured)
    if (this.knowledgeService) {
      this.tools.set('query_knowledge', {
        name: 'query_knowledge',
        description: 'Search the app knowledge base for domain-specific information ' + '(policies, FAQs, product details, delivery areas, allergens, etc). ' + 'Use when the user asks about the business or app and the answer is NOT visible on screen.',
        parameters: {
          question: {
            type: 'string',
            description: 'The question or topic to search for',
            required: true
          }
        },
        execute: async args => {
          const screenName = this.getNavigationSnapshot().currentScreenName;
          return this.knowledgeService.retrieve(args.question, screenName);
        }
      });
    }
    this.tools.set('query_data', {
      name: 'query_data',
      description: 'Query an app-registered data source for structured async data such as products, recommendations, inventory, live pricing, or order status.',
      parameters: {
        source: {
          type: 'string',
          description: 'The registered data source name to query',
          required: true
        },
        query: {
          type: 'string',
          description: 'What data you need from that source',
          required: true
        }
      },
      execute: async args => this.executeQueryData(args)
    });
  }
  getPlatformAdapter() {
    if (!this.config.platformAdapter) {
      throw new Error('Platform adapter is required. Provide config.platformAdapter from the host platform shell.');
    }
    return this.config.platformAdapter;
  }
  getNavigationSnapshot() {
    return this.getPlatformAdapter().getNavigationSnapshot();
  }

  // ─── Dynamic Config Overrides ────────────────────────────────

  setUIControlOverride(enabled) {
    this.uiControlOverride = enabled;
  }
  isUIEnabled() {
    if (this.uiControlOverride !== undefined) return this.uiControlOverride;
    return this.config.enableUIControl !== false; // defaults to true
  }

  /** Maps a tool call to a user-friendly status label for the loading overlay. */
  getToolStatusLabel(toolName, args) {
    switch (toolName) {
      case 'tap':
        return 'Tapping a button...';
      case 'type':
        return 'Typing into a field...';
      case 'navigate':
        return `Navigating to ${args.screen || 'another screen'}...`;
      case 'done':
        return 'Wrapping up...';
      case 'ask_user':
        return 'Asking you a question...';
      case 'query_knowledge':
        return 'Searching knowledge base...';
      case 'scroll':
        return `Scrolling ${args.direction || 'down'}...`;
      case 'wait':
        return 'Waiting for the screen to load...';
      case 'long_press':
        return 'Long-pressing an element...';
      case 'adjust_slider':
        return `Adjusting slider to ${Math.round((args.value ?? 0) * 100)}%...`;
      case 'select_picker':
        return `Selecting "${args.value || ''}" from a dropdown...`;
      case 'set_date':
        return `Setting date to ${args.date || ''}...`;
      case 'dismiss_keyboard':
        return 'Dismissing keyboard...';
      default:
        return `Running ${toolName}...`;
    }
  }

  // ─── Screen Context for Voice Mode ──────────────────────

  /**
   * Get current screen context as formatted text.
   * Used by voice mode: sent once at connect + after each tool call.
   * Tree goes in user prompt, not system instructions.
   */
  getScreenContext() {
    try {
      logger.debug('AgentRuntime', 'getScreenContext called');
      logger.debug('AgentRuntime', 'config.screenMap exists:', !!this.config.screenMap);
      if (this.config.screenMap) {
        logger.debug('AgentRuntime', 'screenMap.screens count:', Object.keys(this.config.screenMap.screens).length);
        logger.debug('AgentRuntime', 'screenMap.chains count:', this.config.screenMap.chains?.length);
      }
      const snapshot = this.getPlatformAdapter().getScreenSnapshot();
      const screenName = snapshot.screenName;
      logger.debug('AgentRuntime', 'current screen:', screenName);
      this.lastDehydratedRoot = snapshot;
      const routeNames = snapshot.availableScreens;
      logger.debug('AgentRuntime', 'routeNames:', routeNames);
      let availableScreensText;
      let appMapText = '';
      if (this.config.screenMap) {
        const map = this.config.screenMap;
        logger.debug('AgentRuntime', 'USING SCREEN MAP - enriching context');
        const screenLines = routeNames.map(name => {
          const entry = map.screens[name];
          if (entry) {
            const title = entry.title ? ` (${entry.title})` : '';
            const line = `- ${name}${title}: ${entry.description}`;
            logger.debug('AgentRuntime', 'matched:', line);
            return line;
          }
          logger.debug('AgentRuntime', 'NO MATCH for route:', name);
          return `- ${name}`;
        });
        availableScreensText = `Available Screens:\n${screenLines.join('\n')}`;
        if (map.chains && map.chains.length > 0) {
          const chainLines = map.chains.map(chain => `  ${chain.join(' → ')}`);
          appMapText = `\nNavigation Chains:\n${chainLines.join('\n')}`;
          logger.debug('AgentRuntime', 'chains:', chainLines.length);
        }
        this.detectStaleMap(routeNames, map);
      } else {
        logger.debug('AgentRuntime', 'NO SCREEN MAP - using flat list');
        availableScreensText = `Available Screens: ${routeNames.join(', ')}`;
      }
      const context = `<screen_update>
Current Screen: ${screenName}
${availableScreensText}${appMapText}

${snapshot.elementsText}
</screen_update>`;
      logger.debug('AgentRuntime', 'FULL CONTEXT:', context.substring(0, 500));
      return context;
    } catch (error) {
      logger.debug('AgentRuntime', 'getScreenContext ERROR:', error.message);
      logger.error('AgentRuntime', `getScreenContext failed: ${error.message}`);
      return '<screen_update>Error reading screen</screen_update>';
    }
  }
  detectStaleMap(routeNames, map) {
    if (this.staleMapWarned) return; // Only warn once

    const mapScreens = new Set(Object.keys(map.screens));
    const missing = routeNames.filter(r => !mapScreens.has(r));
    if (missing.length > 0) {
      this.staleMapWarned = true;
      console.warn(`⚠️ [AIAgent] Screens not in map: "${missing.join('", "')}". ` + `Update your configured screen map to include them.`);
    }
  }

  // ─── Build Tools Array for Provider ────────────────────────

  buildToolsForProvider() {
    if (this._cachedProviderTools) return this._cachedProviderTools;
    const allTools = [...this.tools.values()];
    const existingToolNames = new Set(allTools.map(tool => tool.name));
    const allowedActionNames = this.config.allowedActionNames ? new Set(this.config.allowedActionNames) : null;

    // Add registered actions as tools
    for (const action of actionRegistry.getAll()) {
      if (allowedActionNames && !allowedActionNames.has(action.name)) {
        continue;
      }
      if (existingToolNames.has(action.name)) {
        continue;
      }
      const toolParams = {};
      for (const [key, val] of Object.entries(action.parameters)) {
        if (typeof val === 'string') {
          toolParams[key] = {
            type: 'string',
            description: val,
            required: true
          };
        } else {
          toolParams[key] = {
            type: val.type,
            description: val.description,
            required: val.required !== false,
            enum: val.enum
          };
        }
      }
      allTools.push({
        name: action.name,
        description: action.description,
        parameters: toolParams,
        execute: async args => {
          try {
            const result = await action.handler(args);
            logger.info('AgentRuntime', `Action "${action.name}" result:`, JSON.stringify(result));
            return formatActionToolResult(result, `✅ Action "${action.name}" executed successfully.`);
          } catch (error) {
            return `❌ Action "${action.name}" failed: ${error.message}`;
          }
        }
      });
      existingToolNames.add(action.name);
    }
    this._cachedProviderTools = allTools;
    this._cachedProviderToolMap = new Map(allTools.map(t => [t.name, t]));
    return allTools;
  }

  /** Public accessor for voice mode — returns all registered tool definitions. */
  getTools() {
    return this.buildToolsForProvider();
  }

  /** Execute a tool by name (for voice mode tool calls from WebSocket). */
  async executeTool(name, args) {
    const tool = this.tools.get(name) || this._cachedProviderToolMap?.get(name) || this.buildToolsForProvider().find(t => t.name === name);
    if (!tool) {
      return `❌ Unknown tool: ${name}`;
    }
    return this.executeToolSafely(tool, args, name);
  }
  /**
   * Start 3-layer error suppression for the agent task lifecycle.
   *
   * Layer 1 — ErrorUtils: Catches non-React async errors (setTimeout, fetch, native callbacks).
   * Layer 2 — console.reportErrorsAsExceptions: React Native dev-mode flag. When false,
   *           console.error calls don't trigger ExceptionsManager.handleException(),
   *           preventing the red "Render Error" screen for errors that React surfaces
   *           via console.error (useEffect, lifecycle, invariant violations).
   * Layer 3 — Grace period (in _stopErrorSuppression): Keeps suppression active
   *           for N ms after task completion, covering delayed useEffect effects.
   *
   * Same compound approach used by Sentry React Native SDK (ErrorUtils + ExceptionsManager override).
   */
  _startErrorSuppression() {
    // Cancel any pending grace timer from a previous task
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }

    // Layer 1: ErrorUtils global handler
    const ErrorUtils = globalThis.ErrorUtils;
    if (ErrorUtils?.setGlobalHandler) {
      this.originalErrorHandler = ErrorUtils.getGlobalHandler?.() ?? null;
      this.lastSuppressedError = null;
      ErrorUtils.setGlobalHandler((error, isFatal) => {
        this.lastSuppressedError = error;
        logger.warn('AgentRuntime', `🛡️ Suppressed ${isFatal ? 'FATAL' : 'non-fatal'} error during agent task: ${error.message}`);
        // Don't re-throw — suppress the crash entirely.
      });
    }

    // Layer 2: Suppress dev-mode red screen
    // In RN dev mode, useEffect errors trigger console.error → ExceptionsManager → red screen.
    // This flag is the official RN mechanism to disable that pipeline.
    const consoleAny = console;
    if (consoleAny.reportErrorsAsExceptions !== undefined) {
      this.originalReportErrorsAsExceptions = consoleAny.reportErrorsAsExceptions;
      consoleAny.reportErrorsAsExceptions = false;
    }
  }

  /**
   * Stop error suppression after a grace period.
   * The grace period covers delayed React side-effects (useEffect, PagerView onPageSelected,
   * scrollToIndex) that can fire AFTER execute() returns.
   */
  _stopErrorSuppression(gracePeriodMs = 0) {
    const restore = () => {
      // Restore Layer 1: ErrorUtils
      const ErrorUtils = globalThis.ErrorUtils;
      if (ErrorUtils?.setGlobalHandler && this.originalErrorHandler) {
        ErrorUtils.setGlobalHandler(this.originalErrorHandler);
        this.originalErrorHandler = null;
      }
      this.lastSuppressedError = null;

      // Restore Layer 2: console.reportErrorsAsExceptions
      const consoleAny = console;
      if (this.originalReportErrorsAsExceptions !== undefined) {
        consoleAny.reportErrorsAsExceptions = this.originalReportErrorsAsExceptions;
        this.originalReportErrorsAsExceptions = undefined;
      }
      this.graceTimer = null;
    };
    if (gracePeriodMs > 0) {
      this.graceTimer = setTimeout(restore, gracePeriodMs);
    } else {
      restore();
    }
  }

  /**
   * Execute a tool with safety checks.
   * Validates args before execution (Detox/Appium pattern).
   * Checks for async errors that were suppressed during the settle window.
   * The global ErrorUtils handler is task-scoped (installed in execute()),
   * so this method only needs to CHECK for errors, not install/remove.
   */
  async executeToolSafely(tool, args, toolName, stepIndex) {
    // Clear any previous suppressed error before this tool
    this.lastSuppressedError = null;

    // Signal analytics that the AGENT is acting (not the user).
    // This prevents AI-driven taps from being tracked as user_interaction events.
    this.config.onToolExecute?.(true, toolName);
    try {
      this.emitTrace('tool_execution_started', {
        tool: toolName,
        args
      }, stepIndex);

      // ── Argument Validation (Pattern from Detox/Appium: typeof checks before native dispatch) ──
      const validationError = this.validateToolArgs(args, toolName);
      if (validationError) {
        logger.warn('AgentRuntime', `🛡️ Arg validation rejected "${toolName}": ${validationError}`);
        this.emitTrace('tool_validation_rejected', {
          tool: toolName,
          args,
          validationError
        }, stepIndex);
        return validationError;
      }

      // ── Copilot aiConfirm gate ──────────────────────────────────
      // In copilot mode, elements marked with aiConfirm={true} require
      // user confirmation before execution. This is the code-level safety net
      // complementing the prompt-level copilot instructions.
      if (this.config.interactionMode !== 'autopilot') {
        logger.info('AgentRuntime', `🛡️ Checking copilot confirmation for ${toolName}(${JSON.stringify(args)})`);
        const confirmResult = await this.checkCopilotConfirmation(toolName, args, stepIndex);
        if (confirmResult) return confirmResult;
      } else {
        logger.info('AgentRuntime', `🚀 interactionMode=autopilot, skipping copilot confirmation for "${toolName}"`);
        this.emitTrace('confirmation_skipped_autopilot', {
          tool: toolName,
          args
        }, stepIndex);
      }

      // ── App-action approval gate ────────────────────────────────────────
      // Mandate explicit ask_user approval for all UI-altering tools ONLY if we are in
      // copilot mode AND the host app has provided an onAskUser callback.
      // If the model tries to use a UI tool without explicitly getting approval, we block it.
      if (this.config.interactionMode !== 'autopilot' && this.config.onAskUser && AgentRuntime.APP_ACTION_TOOLS.has(toolName) && !this.hasWorkflowApproval()) {
        const blockedMsg = `🚫 APP ACTION BLOCKED: You are attempting to use "${toolName}" without workflow approval. Before routine UI actions, either (1) call ask_user(request_app_action=true) and wait for the user to tap 'Allow', or (2) if you are collecting missing low-risk input/selection for the current action workflow, call ask_user(grants_workflow_approval=true) so the user's answer authorizes routine in-flow actions. Never use option (2) for support investigations or irreversible final commits.`;
        logger.warn('AgentRuntime', blockedMsg);
        this.emitTrace('app_action_gate_blocked', {
          tool: toolName,
          args
        }, stepIndex);
        return blockedMsg;
      }

      // ── Action-safety gate ──────────────────────────────────────────────
      // Classify the action (destructive / payment / state-change / etc.) and
      // require fresh confirmation when warranted. An explicit approval within
      // the same task (TTL + goal + target match) is reused to avoid
      // re-confirmation loops.
      const safetyDecision = await this.evaluateActionSafety(tool, args, toolName, stepIndex);
      const safetyBlock = await this.enforceActionSafetyDecision(safetyDecision, toolName, args, stepIndex);
      if (safetyBlock) return safetyBlock;
      const result = await tool.execute(args);

      // Settle window for async side-effects (useEffect, native callbacks)
      // The global ErrorUtils handler catches any errors during this window
      await new Promise(resolve => setTimeout(resolve, 2000));
      const suppressedError = this.lastSuppressedError;
      if (suppressedError) {
        logger.warn('AgentRuntime', `🛡️ Tool "${toolName}" caused async error (suppressed): ${suppressedError.message}`);
        this.lastSuppressedError = null;
        this.emitTrace('tool_async_error_suppressed', {
          tool: toolName,
          args,
          result,
          error: suppressedError.message
        }, stepIndex);
        return `${result} (⚠️ a background error was safely caught: ${suppressedError.message})`;
      }
      this.emitTrace('tool_execution_finished', {
        tool: toolName,
        args,
        result
      }, stepIndex);
      return result;
    } catch (error) {
      logger.error('AgentRuntime', `Tool "${toolName}" threw: ${error.message}`);
      this.emitTrace('tool_execution_failed', {
        tool: toolName,
        args,
        error: error?.message ?? String(error)
      }, stepIndex);
      return `❌ Tool "${toolName}" failed: ${error.message}`;
    } finally {
      // Always restore the flag — even on error or validation rejection
      this.config.onToolExecute?.(false, toolName);
    }
  }

  /**
   * Validate tool arguments before execution.
   * Pattern from Detox: `typeof index !== 'number' → throw Error`
   * Pattern from Appium: `_.isFinite(x) && _.isFinite(y)` for coordinates
   * Returns error string if validation fails, null if valid.
   */
  validateToolArgs(args, toolName) {
    if (!args || typeof args !== 'object') return null;

    // Reject any null/undefined values that could crash native components
    for (const [key, value] of Object.entries(args)) {
      if (value === undefined) {
        return `❌ Argument "${key}" is undefined for tool "${toolName}". Provide a valid value.`;
      }
    }

    // Tool-specific number validation (like Detox's typeof checks)
    const numericArgs = ['containerIndex', 'index', 'x', 'y', 'offset'];
    for (const key of numericArgs) {
      if (key in args && args[key] !== null && args[key] !== undefined) {
        const val = args[key];
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          return `❌ Argument "${key}" must be a finite number for tool "${toolName}", got ${typeof val}: ${val}`;
        }
      }
    }
    return null;
  }
  emitTrace(stage, data = {}, stepIndex) {
    if (!this.currentTraceId || !this.config.onTrace) return;
    const event = {
      traceId: this.currentTraceId,
      stage,
      timestamp: new Date().toISOString(),
      stepIndex,
      screenName: this.getNavigationSnapshot().currentScreenName,
      data
    };
    this.config.onTrace(event);
  }

  // ─── Copilot Confirmation ─────────────────────────────────────

  /** Write tools that can mutate state — only these are checked for aiConfirm */
  static WRITE_TOOLS = new Set(['tap', 'type', 'long_press', 'adjust_slider', 'select_picker', 'set_date']);

  /**
   * Check if a tool call targets an aiConfirm element and request user confirmation.
   * Returns null if the action should proceed, or an error string if rejected.
   */
  async checkCopilotConfirmation(toolName, args, stepIndex) {
    // Only gate write tools
    if (!AgentRuntime.WRITE_TOOLS.has(toolName)) {
      logger.info('AgentRuntime', `🛡️ No confirmation needed for "${toolName}" because it is not a write tool`);
      this.emitTrace('confirmation_not_needed', {
        tool: toolName,
        reason: 'not_write_tool',
        args
      }, stepIndex);
      return null;
    }

    // Look up the target element by index
    const index = args.index;
    if (typeof index !== 'number') {
      logger.info('AgentRuntime', `🛡️ No confirmation needed for "${toolName}" because no element index was provided`);
      this.emitTrace('confirmation_not_needed', {
        tool: toolName,
        reason: 'missing_index',
        args
      }, stepIndex);
      return null;
    }
    const screen = this.lastDehydratedRoot;
    if (!screen?.elements) {
      logger.warn('AgentRuntime', `🛡️ Could not evaluate confirmation for "${toolName}" because no dehydrated screen was available`);
      this.emitTrace('confirmation_not_evaluated', {
        tool: toolName,
        reason: 'missing_dehydrated_screen',
        args
      }, stepIndex);
      return null;
    }
    const element = screen.elements.find(e => e.index === index);
    if (!element) {
      logger.warn('AgentRuntime', `🛡️ Could not find element index ${index} for "${toolName}" on screen "${screen.screenName}"`);
      this.emitTrace('confirmation_not_evaluated', {
        tool: toolName,
        reason: 'element_not_found',
        args,
        index
      }, stepIndex);
      return null;
    }
    logger.info('AgentRuntime', `🛡️ Copilot gate inspect: tool="${toolName}" index=${index} label="${element.label}" type="${element.type}" aiConfirm=${element.requiresConfirmation === true}`);
    if (!element.requiresConfirmation) {
      logger.info('AgentRuntime', `🛡️ No confirmation needed for "${toolName}" on "${element.label}" because aiConfirm is not set`);
      this.emitTrace('confirmation_not_needed', {
        tool: toolName,
        reason: 'aiConfirm_not_set',
        args,
        elementLabel: element.label,
        elementType: element.type,
        index
      }, stepIndex);
      return null;
    }

    // Element has aiConfirm — request user confirmation
    const label = element.label || `[${element.type}]`;
    const description = this.getToolStatusLabel(toolName, args);
    const question = `I can do this in the app for you by tapping and typing where needed, and ${description} on "${label}". If you'd rather do it yourself, I can guide you step by step instead.`;
    logger.info('AgentRuntime', `🛡️ Copilot: aiConfirm gate triggered for "${toolName}" on "${label}"`);
    this.emitTrace('confirmation_required', {
      tool: toolName,
      args,
      elementLabel: label,
      elementType: element.type,
      index,
      question
    }, stepIndex);

    // Use onAskUser if available (integrated into chat UI), otherwise Alert.alert
    if (this.config.onAskUser) {
      logger.info('AgentRuntime', `🛡️ Requesting explicit confirmation via ask_user for "${label}"`);
      this.emitTrace('confirmation_prompted', {
        tool: toolName,
        elementLabel: label,
        elementType: element.type,
        question,
        channel: 'ask_user'
      }, stepIndex);
      const response = await this.config.onAskUser({
        question,
        kind: 'approval'
      });
      logger.info('AgentRuntime', `🛡️ Confirmation response for "${label}": "${String(response)}"`);
      this.emitTrace('confirmation_response_received', {
        tool: toolName,
        elementLabel: label,
        response: String(response)
      }, stepIndex);
      if (response === APPROVAL_ALREADY_DONE_TOKEN) {
        this.emitTrace('confirmation_already_done', {
          tool: toolName,
          elementLabel: label
        }, stepIndex);
        return APPROVAL_ALREADY_DONE_TOKEN;
      }
      if (response === APPROVAL_GRANTED_TOKEN) {
        logger.info('AgentRuntime', `✅ User approved "${toolName}" on "${label}"`);
        this.emitTrace('confirmation_approved', {
          tool: toolName,
          elementLabel: label,
          response: 'explicit_button'
        }, stepIndex);
        return null;
      }
      if (response === APPROVAL_REJECTED_TOKEN) {
        logger.info('AgentRuntime', `🛑 User rejected "${toolName}" on "${label}"`);
        this.emitTrace('confirmation_rejected', {
          tool: toolName,
          elementLabel: label,
          response: 'explicit_button'
        }, stepIndex);
        return ACTION_NOT_APPROVED_MESSAGE;
      }

      // If it's conversational input (e.g. "Why?"), pause the action and pass the user's question back to the LLM so it can answer it!
      this.emitTrace('confirmation_interrupted', {
        tool: toolName,
        elementLabel: label,
        response: String(response)
      }, stepIndex);
      return `Action paused because the user interrupted with this message: "${response}". Please answer the user by fully explaining your logic.`;
    }

    // Fallback: native browser confirm
    logger.info('AgentRuntime', `🛡️ Requesting explicit confirmation via window.confirm for "${label}"`);
    this.emitTrace('confirmation_prompted', {
      tool: toolName,
      elementLabel: label,
      elementType: element.type,
      question,
      channel: 'web_confirm'
    }, stepIndex);
    const approved = (typeof window !== 'undefined' && typeof window.confirm === 'function')
      ? window.confirm(question)
      : true;
    if (!approved) {
      logger.info('AgentRuntime', `🛑 User rejected "${toolName}" on "${label}"`);
      this.emitTrace('confirmation_rejected', {
        tool: toolName,
        elementLabel: label,
        response: 'cancel'
      }, stepIndex);
      return ACTION_NOT_APPROVED_MESSAGE;
    }
    logger.info('AgentRuntime', `✅ User approved "${toolName}" on "${label}" via window.confirm`);
    this.emitTrace('confirmation_approved', {
      tool: toolName,
      elementLabel: label,
      response: 'continue'
    }, stepIndex);
    return null;
  }

  // ─── Instructions ───────

  getInstructions(screenName) {
    const {
      instructions
    } = this.config;
    if (!instructions) return '';
    let result = '';
    if (instructions.system?.trim()) {
      result += `<system_instructions>\n${instructions.system.trim()}\n</system_instructions>\n`;
    }
    if (instructions.getScreenInstructions) {
      try {
        const screenInstructions = instructions.getScreenInstructions(screenName)?.trim();
        if (screenInstructions) {
          result += `<screen_instructions>\n${screenInstructions}\n</screen_instructions>\n`;
        }
      } catch (error) {
        logger.error('AgentRuntime', 'Failed to get screen instructions:', error);
      }
    }
    return result ? `<instructions>\n${result}</instructions>\n\n` : '';
  }

  // ─── Observation System ──

  observations = [];
  lastScreenName = '';
  handleObservations(step, maxSteps, screenName) {
    // Screen change detection
    if (this.lastScreenName && screenName !== this.lastScreenName) {
      this.observations.push(`Screen navigated to → ${screenName}`);
    }
    this.lastScreenName = screenName;

    // Remaining steps warning
    const remaining = maxSteps - step;
    if (remaining === 5) {
      this.observations.push(`⚠️ Only ${remaining} steps remaining. Consider wrapping up or calling done with partial results.`);
    } else if (remaining === 2) {
      this.observations.push(`⚠️ Critical: Only ${remaining} steps left! You must finish the task or call done immediately.`);
    }
  }

  // ─── User Prompt Assembly ──

  assembleUserPrompt(step, maxSteps, contextualMessage, screenName, screenContent, chatHistory) {
    let prompt = '';

    // 1. <instructions> (optional system/screen instructions)
    prompt += this.getInstructions(screenName);

    // 2. <agent_state> — user request + step info
    prompt += '<agent_state>\n';
    prompt += '<user_request>\n';
    prompt += `${contextualMessage}\n`;
    prompt += '</user_request>\n';
    if (chatHistory && chatHistory.length > 0) {
      prompt += '<chat_history>\n';
      // Only include the last 10 messages to manage context length
      const recentHistory = chatHistory.slice(-10);
      for (const msg of recentHistory) {
        prompt += `[${msg.role}]: ${msg.content}\n`;
      }
      prompt += '</chat_history>\n';
    }
    prompt += '<step_info>\n';
    prompt += `Step ${step + 1} of ${maxSteps} max possible steps\n`;
    prompt += '</step_info>\n';
    prompt += '</agent_state>\n\n';

    // 3. <agent_history> — structured per-step history
    prompt += '<agent_history>\n';

    // History summarization: when steps > 8, compress middle steps
    // to bound prompt growth for long tasks (approaching 25-step limit).
    // Keep first 2 (initial context) + last 4 (recent context) as full detail.
    const SUMMARIZE_THRESHOLD = 8;
    const KEEP_HEAD = 2;
    const KEEP_TAIL = 4;
    const shouldSummarize = this.history.length > SUMMARIZE_THRESHOLD;
    let stepIndex = 0;
    for (let i = 0; i < this.history.length; i++) {
      const event = this.history[i];
      stepIndex++;
      if (shouldSummarize && i >= KEEP_HEAD && i < this.history.length - KEEP_TAIL) {
        // First compressed step emits the summary block
        if (i === KEEP_HEAD) {
          prompt += '<steps_summary>\n';
          for (let j = KEEP_HEAD; j < this.history.length - KEEP_TAIL; j++) {
            const h = this.history[j];
            const actionName = h.action.name || 'unknown';
            const succeeded = h.action.output?.startsWith('✅') ? 'success' : 'fail';
            prompt += `Step ${j + 1}: ${actionName} → ${succeeded}\n`;
          }
          prompt += '</steps_summary>\n';
        }
        continue; // Skip full detail for middle steps
      }
      prompt += `<step_${stepIndex}>\n`;
      prompt += `Previous Goal Eval: ${event.reflection.previousGoalEval}\n`;
      prompt += `Memory: ${event.reflection.memory}\n`;
      prompt += `Plan: ${event.reflection.plan}\n`;
      prompt += `Action Result: ${event.action.output}\n`;
      prompt += `</step_${stepIndex}>\n`;
    }

    // Inject system observations
    for (const obs of this.observations) {
      prompt += `<sys>${obs}</sys>\n`;
    }
    this.observations = [];
    prompt += '</agent_history>\n\n';

    // 4. <screen_state> — dehydrated screen content + screen map enrichment
    logger.debug('AgentRuntime', 'assembleUserPrompt: screenMap exists:', !!this.config.screenMap);
    prompt += '<screen_state>\n';
    prompt += `Current Screen: ${screenName}\n`;

    // Inject screen map descriptions & navigation chains if available
    if (this.config.screenMap) {
      const map = this.config.screenMap;
      const routeNames = this.getNavigationSnapshot().availableScreens;
      logger.debug('AgentRuntime', 'ENRICHING prompt with screenMap for screen:', screenName);

      // Build enriched screen list with descriptions
      const screenLines = routeNames.map(name => {
        const entry = map.screens[name];
        if (entry) {
          const title = entry.title ? ` (${entry.title})` : '';
          return `- ${name}${title}: ${entry.description}`;
        }
        return `- ${name}`;
      });
      prompt += `\nAvailable Screens:\n${screenLines.join('\n')}\n`;

      // Add navigation chains
      if (map.chains && map.chains.length > 0) {
        const chainLines = map.chains.map(chain => `  ${chain.join(' → ')}`);
        prompt += `\nNavigation Chains:\n${chainLines.join('\n')}\n`;
      }
    } else {
      // Flat list fallback
      const routeNames = this.getNavigationSnapshot().availableScreens;
      prompt += `Available Screens: ${routeNames.join(', ')}\n`;
    }
    prompt += '\n' + screenContent + '\n';
    prompt += '</screen_state>\n';
    return prompt;
  }

  // ─── Main Execution Loop ──────────────────────────────────────

  async execute(userMessage, chatHistory, userImages) {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Agent is already running.',
        steps: []
      };
    }
    this.isRunning = true;
    this.isCancelRequested = false;
    // Per-task abort controller — lets cancel() abort the in-flight LLM fetch so
    // the run unwinds immediately instead of wedging isRunning until the fetch returns.
    const taskAbortController = new AbortController();
    this.taskAbortController = taskAbortController;
    this.history = [];
    this.currentTraceId = generateTraceId();
    this.observations = [];
    this.lastScreenName = '';
    this.pendingCriticalVerification = null;
    this.outcomeVerifier = null;
    this.verifierProvider = null;
    this.currentUserGoal = userMessage;
    // Reset workflow approval for each new task
    this.resetAppActionApproval('new task');
    const maxSteps = this.config.maxSteps || DEFAULT_MAX_STEPS;
    const stepDelay = this.config.stepDelay ?? 300;

    // Token usage accumulator for the entire task
    const sessionUsage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUSD: 0
    };
    let malformedAgentStepRecoveries = 0;

    // Inject conversational context if we are answering the AI's question
    let contextualMessage = userMessage;
    if (this.lastAskUserQuestion) {
      contextualMessage = `(Note: You just asked the user: "${this.lastAskUserQuestion}")\n\nUser replied: ${userMessage}`;
      this.lastAskUserQuestion = null; // Consume the question
    }
    this.currentUserGoal = contextualMessage;
    // Conversational loop breaker: if recent replies to the user are near-duplicates,
    // the agent is stuck re-explaining a settled point and ignoring new intents.
    // Prepend an explicit instruction to break the pattern on this turn.
    const repetitionBreaker = detectConversationalRepetition(chatHistory);
    if (repetitionBreaker) {
      contextualMessage = `${repetitionBreaker}\n\n${contextualMessage}`;
      logger.info('AgentRuntime', '🔁 Conversational repetition detected — injected loop breaker.');
    }
    logger.info('AgentRuntime', `Starting execution: "${contextualMessage}"`);

    // Lifecycle: onBeforeTask
    await this.config.onBeforeTask?.();
    try {
      this.emitTrace('task_started', {
        message: userMessage,
        contextualMessage,
        maxSteps,
        interactionMode: this.config.interactionMode || 'copilot',
        enableUIControl: this.config.enableUIControl !== false,
        chatHistoryLength: chatHistory?.length ?? 0
      });

      // ── Start interceptors & error suppression ──────────────────
      if (this.config.interceptNativeAlerts) {
        installAlertInterceptor();
      }
      this._startErrorSuppression();

      // ─── Knowledge-only fast path ─────────────────────────────────
      // Skip fiber walk, dehydration, screenshots, and multi-step loop.
      // Only sends the user question → single LLM call → done.
      if (!this.isUIEnabled()) {
        this.config.onStatusUpdate?.('Thinking...');
        const hasKnowledge = !!this.knowledgeService;
        const systemPrompt = buildKnowledgeOnlyPrompt('en', hasKnowledge, this.config.instructions?.system);
        const tools = this.buildToolsForProvider();
        const screenName = this.getNavigationSnapshot().currentScreenName;

        // Minimal user prompt — just the question + screen name for context
        const userPrompt = `Current screen: ${screenName}\n\nUser: ${contextualMessage}`;
        const response = await this.provider.generateContent(systemPrompt, userPrompt, tools, [], undefined, taskAbortController.signal);

        // Track token usage
        if (response.tokenUsage) {
          sessionUsage.promptTokens += response.tokenUsage.promptTokens;
          sessionUsage.completionTokens += response.tokenUsage.completionTokens;
          sessionUsage.totalTokens += response.tokenUsage.totalTokens;
          sessionUsage.estimatedCostUSD += response.tokenUsage.estimatedCostUSD;
          this.config.onTokenUsage?.(response.tokenUsage);
        }

        // Execute tool calls (done / query_knowledge)
        let message = response.text || '';
        if (response.toolCalls) {
          for (const tc of response.toolCalls) {
            const tool = this.tools.get(tc.name);
            if (tool) {
              const result = await this.executeToolSafely(tool, tc.args, tc.name);
              if (tc.name === 'done') {
                message = result;
              } else if (tc.name === 'query_knowledge') {
                // Knowledge retrieved — need a second call with the results
                const followUp = `Knowledge result:\n${result}\n\nUser question: ${contextualMessage}\n\nAnswer the user based on this knowledge. Call done() with your answer.`;
                const followUpResponse = await this.provider.generateContent(systemPrompt, followUp, tools, [], undefined, taskAbortController.signal);
                if (followUpResponse.tokenUsage) {
                  sessionUsage.promptTokens += followUpResponse.tokenUsage.promptTokens;
                  sessionUsage.completionTokens += followUpResponse.tokenUsage.completionTokens;
                  sessionUsage.totalTokens += followUpResponse.tokenUsage.totalTokens;
                  sessionUsage.estimatedCostUSD += followUpResponse.tokenUsage.estimatedCostUSD;
                  this.config.onTokenUsage?.(followUpResponse.tokenUsage);
                }
                if (followUpResponse.toolCalls) {
                  for (const ftc of followUpResponse.toolCalls) {
                    if (ftc.name === 'done') {
                      const doneResult = await this.tools.get('done').execute(ftc.args);
                      message = doneResult;
                    }
                  }
                }
                if (!message && followUpResponse.text) {
                  message = followUpResponse.text;
                }
              }
            }
          }
        }
        const result = {
          success: true,
          message: message || 'I could not find an answer.',
          steps: [],
          tokenUsage: sessionUsage
        };
        await this.config.onAfterTask?.(result);
        return result;
      }

      // ─── Full agent loop (UI control enabled) ─────────────────────
      for (let step = 0; step < maxSteps; step++) {
        // ── Cancel check ──
        if (this.isCancelRequested) {
          logger.info('AgentRuntime', `Task cancelled by user at step ${step + 1}`);
          this.emitTrace('task_cancelled', {
            reason: 'user_cancelled'
          }, step);
          const cancelResult = {
            success: false,
            message: 'Task was cancelled.',
            steps: this.history,
            tokenUsage: sessionUsage
          };
          await this.config.onAfterTask?.(cancelResult);
          return cancelResult;
        }
        logger.info('AgentRuntime', `===== Step ${step + 1}/${maxSteps} =====`);
        this.emitTrace('step_started', {
          maxSteps,
          historyLength: this.history.length
        }, step);
        logger.info('AgentRuntime', `⚙️ Effective mode: interactionMode=${this.config.interactionMode || 'copilot(default)'} | onAskUser=${!!this.config.onAskUser} | enableUIControl=${this.config.enableUIControl !== false}`);

        // Lifecycle: onBeforeStep
        await this.config.onBeforeStep?.(step);

        // 1. Walk Fiber tree with security config and dehydrate screen
        const screen = this.getPlatformAdapter().getScreenSnapshot();
        const screenName = screen.screenName;

        // Store root for tooling access (e.g., GuideTool measuring)
        this.lastDehydratedRoot = screen;
        this.emitTrace('screen_dehydrated', {
          screenName: screen.screenName,
          elementCount: screen.elements.length,
          elementsTextLength: screen.elementsText.length
        }, step);
        logger.info('AgentRuntime', `Screen: ${screen.screenName}`);

        // 2. Apply transformScreenContent
        let screenContent = screen.elementsText;
        if (this.config.transformScreenContent) {
          screenContent = await this.config.transformScreenContent(screenContent);
        }
        // Track current screen content + warm the action-safety classifier so the
        // safety gate has cached decisions ready before the model acts.
        this.currentScreenContent = screenContent;
        this.startScreenSafetyPreclassification(screen, screenContent, step).catch(() => {});

        // 3. Handle observations
        this.handleObservations(step, maxSteps, screenName);

        // 4. Capture screenshot for Gemini vision (optional)
        // Skip screenshot on step 0 when user images are present to avoid token overflow
        const hasUserImages = step === 0 && userImages?.length > 0;
        const screenshot = hasUserImages ? undefined : await this.getPlatformAdapter().captureScreenshot();
        await this.updateCriticalVerification(screenName, screenContent, screen.elements, screenshot, step);

        // 5. Assemble structured user prompt after verification updates so
        // any new observations are included in the very next model turn.
        const contextMessage = this.assembleUserPrompt(step, maxSteps, contextualMessage, screenName, screenContent, chatHistory);
        this.debugScreenSnapshot(screen.screenName, screen.elements, screen.elementsText, screenContent, contextMessage);

        // 6. Send to AI provider
        this.config.onStatusUpdate?.('Thinking...');
        const hasKnowledge = !!this.knowledgeService;
        const isCopilot = this.config.interactionMode !== 'autopilot';
        const systemPrompt = buildSystemPrompt('en', hasKnowledge, isCopilot, this.config.supportStyle);
        const tools = this.buildToolsForProvider();
        const stepUserImages = step === 0 ? userImages : undefined;
        logger.info('AgentRuntime', `Sending to AI with ${tools.length} tools...${stepUserImages?.length ? `, with ${stepUserImages.length} user image(s)` : ''}`);
        logger.debug('AgentRuntime', 'System prompt length:', systemPrompt.length);
        logger.debug('AgentRuntime', 'User context preview:', contextMessage.substring(0, 300));
        const response = await this.provider.generateContent(systemPrompt, contextMessage, tools, this.history, screenshot, taskAbortController.signal, stepUserImages);
        this.emitTrace('provider_response', {
          text: response.text,
          toolCalls: response.toolCalls,
          tokenUsage: response.tokenUsage
        }, step);
        logger.info('AgentRuntime', `🤖 Provider response: textLength=${response.text?.length || 0} toolCalls=${response.toolCalls?.length || 0}`);
        if (response.toolCalls?.length) {
          response.toolCalls.forEach((toolCall, idx) => {
            logger.info('AgentRuntime', `🤖 Tool call[${idx}]: ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
          });
        } else if (response.text) {
          logger.info('AgentRuntime', `🤖 Provider text response: ${response.text}`);
        }

        // Accumulate token usage
        if (response.tokenUsage) {
          sessionUsage.promptTokens += response.tokenUsage.promptTokens;
          sessionUsage.completionTokens += response.tokenUsage.completionTokens;
          sessionUsage.totalTokens += response.tokenUsage.totalTokens;
          sessionUsage.estimatedCostUSD += response.tokenUsage.estimatedCostUSD;
          this.config.onTokenUsage?.(response.tokenUsage);
        }

        // ── Budget Guards ──────────────────────────────────────
        if (this.config.maxTokenBudget && sessionUsage.totalTokens >= this.config.maxTokenBudget) {
          logger.warn('AgentRuntime', `Token budget exceeded: ${sessionUsage.totalTokens} >= ${this.config.maxTokenBudget}`);
          this.emitTrace('task_stopped_budget', {
            budgetType: 'tokens',
            used: sessionUsage.totalTokens,
            limit: this.config.maxTokenBudget
          }, step);
          const budgetResult = {
            success: false,
            message: `Task stopped: token budget exceeded (used ${sessionUsage.totalTokens.toLocaleString()} of ${this.config.maxTokenBudget.toLocaleString()} tokens)`,
            steps: this.history,
            tokenUsage: sessionUsage
          };
          await this.config.onAfterTask?.(budgetResult);
          return budgetResult;
        }
        if (this.config.maxCostUSD && sessionUsage.estimatedCostUSD >= this.config.maxCostUSD) {
          logger.warn('AgentRuntime', `Cost budget exceeded: $${sessionUsage.estimatedCostUSD.toFixed(4)} >= $${this.config.maxCostUSD}`);
          this.emitTrace('task_stopped_budget', {
            budgetType: 'cost_usd',
            used: sessionUsage.estimatedCostUSD,
            limit: this.config.maxCostUSD
          }, step);
          const budgetResult = {
            success: false,
            message: `Task stopped: cost budget exceeded ($${sessionUsage.estimatedCostUSD.toFixed(4)} of $${this.config.maxCostUSD.toFixed(2)} max)`,
            steps: this.history,
            tokenUsage: sessionUsage
          };
          await this.config.onAfterTask?.(budgetResult);
          return budgetResult;
        }

        // 6. Process tool calls
        if (!response.toolCalls || response.toolCalls.length === 0) {
          if (looksLikeInternalPlanText(response.text)) {
            logger.error('AgentRuntime', `Provider returned plan-like plain text with no toolCalls at step ${step + 1}. text="${response.text}"`);
            if (malformedAgentStepRecoveries < 2) {
              malformedAgentStepRecoveries += 1;
              this.observations.push('System observation: Your previous response exposed internal planning text instead of using the required agent_step tool. Do NOT narrate your plan to the user. On this step, either call done() with the actual user-facing answer or emit exactly one valid agent_step action.');
              this.emitTrace('provider_response_retried_malformed_plan_text', {
                text: response.text,
                recoveries: malformedAgentStepRecoveries
              }, step);
              continue;
            }
          }
          if (this.shouldBlockSuccessCompletion()) {
            this.emitTrace('task_completion_blocked_needs_verification', {
              responseText: response.text,
              pendingVerification: this.pendingCriticalVerification
            }, step);
            continue;
          }
          logger.warn('AgentRuntime', 'No tool calls in response. Text:', response.text);
          this.emitTrace('task_completed_without_tool', {
            responseText: response.text
          }, step);
          const result = {
            success: true,
            message: response.text || 'Task completed.',
            steps: this.history,
            tokenUsage: sessionUsage
          };
          await this.config.onAfterTask?.(result);
          return result;
        }

        // 7. Structured reasoning from provider (no regex parsing needed)
        const {
          reasoning
        } = response;
        logger.info('AgentRuntime', `🧠 Plan: ${reasoning.plan}`);
        if (reasoning.memory) {
          logger.debug('AgentRuntime', `💾 Memory: ${reasoning.memory}`);
        }

        // Only process the FIRST tool call per step (one action per step).
        // After one action, the loop re-reads the screen with fresh indexes.
        const toolCall = response.toolCalls[0];
        if (response.toolCalls.length > 1) {
          logger.warn('AgentRuntime', `AI returned ${response.toolCalls.length} tool calls, executing only the first one.`);
        }
        logger.info('AgentRuntime', `Tool: ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
        this.emitTrace('tool_selected', {
          tool: toolCall.name,
          args: toolCall.args,
          reasoning
        }, step);
        if (toolCall.name !== 'ask_user' && this.config.interactionMode !== 'autopilot') {
          logger.info('AgentRuntime', `🛡️ Tool "${toolCall.name}" chosen without prompt-level pause; relying on model plan-following and aiConfirm safeguards if present`);
        }

        // Dynamic status update based on tool being executed + Reasoning
        const statusLabel = this.getToolStatusLabel(toolCall.name, toolCall.args);
        // Prefer the human-readable plan over the raw tool status if available to avoid double statuses
        const statusDisplay = reasoning.plan || statusLabel;
        this.config.onStatusUpdate?.(statusDisplay);
        const preActionSnapshot = this.createCurrentVerificationSnapshot(screenName, screenContent, screen.elements, screenshot);

        // Find and execute the tool
        const tool = this.tools.get(toolCall.name) || this._cachedProviderToolMap?.get(toolCall.name) || this.buildToolsForProvider().find(t => t.name === toolCall.name);
        let output;
        if (tool) {
          output = await this.executeToolSafely(tool, toolCall.args, toolCall.name, step);
        } else {
          this.emitTrace('tool_unknown', {
            tool: toolCall.name,
            args: toolCall.args
          }, step);
          output = `❌ Unknown tool: ${toolCall.name}`;
        }
        logger.info('AgentRuntime', `Result: ${output}`);
        this.emitTrace('tool_result', {
          tool: toolCall.name,
          args: toolCall.args,
          output
        }, step);
        const rawDoneText = typeof toolCall.args.reply === 'string' ? toolCall.args.reply : typeof toolCall.args.text === 'string' ? toolCall.args.text : typeof toolCall.args.message === 'string' ? toolCall.args.message : '';
        if (toolCall.name === 'done' && toolCall.args.success === false && (looksLikeInternalPlanText(rawDoneText) || looksLikeInternalPlanText(reasoning.plan))) {
          logger.error('AgentRuntime', `Plan-like text reached done(false) at step ${step + 1}. toolText="${rawDoneText}" plan="${reasoning.plan}" output="${output}"`);
          if (malformedAgentStepRecoveries < 2) {
            malformedAgentStepRecoveries += 1;
            this.observations.push('System observation: Your previous response exposed internal planning text instead of a valid user-facing answer. Do NOT say what you will do. Either perform the next tool action or call done() with the actual answer.');
            this.emitTrace('done_retried_malformed_plan_text', {
              toolText: rawDoneText,
              plan: reasoning.plan,
              recoveries: malformedAgentStepRecoveries
            }, step);
            continue;
          }
        }
        if (output.startsWith('✅')) {
          this.maybeStartCriticalVerification(toolCall.name, toolCall.args, preActionSnapshot);
        } else if (toolCall.name !== 'done') {
          this.pendingCriticalVerification = null;
        }
        if (output === APPROVAL_ALREADY_DONE_TOKEN) {
          const result = {
            success: true,
            message: USER_ALREADY_COMPLETED_MESSAGE,
            steps: this.history,
            tokenUsage: sessionUsage
          };
          await this.config.onAfterTask?.(result);
          return result;
        }

        // Record step with structured reasoning. userTurnText/modelArgs/thoughtSignature
        // let the provider replay this step as a proper multi-turn function-call turn
        // (required for Gemini 3.x tool-call continuity).
        const agentStep = {
          stepIndex: step,
          reflection: reasoning,
          action: {
            name: toolCall.name,
            input: toolCall.args,
            output
          },
          userTurnText: contextMessage,
          modelArgs: response.modelArgs,
          thoughtSignature: response.thoughtSignature
        };
        this.history.push(agentStep);

        // Lifecycle: onAfterStep
        await this.config.onAfterStep?.(this.history);
        if (output === ACTION_NOT_APPROVED_MESSAGE) {
          const result = {
            success: false,
            message: ACTION_NOT_APPROVED_MESSAGE,
            steps: this.history,
            tokenUsage: sessionUsage
          };
          this.emitTrace('task_stopped_not_approved', {
            tool: toolCall.name,
            message: ACTION_NOT_APPROVED_MESSAGE
          }, step);
          await this.config.onAfterTask?.(result);
          return result;
        }

        // Check if done
        if (toolCall.name === 'done') {
          if (toolCall.args.success !== false && this.shouldBlockSuccessCompletion()) {
            this.emitTrace('done_blocked_needs_verification', {
              pendingVerification: this.pendingCriticalVerification
            }, step);
            continue;
          }
          const fallbackReplySource = toolCall.args.reply || toolCall.args.text || toolCall.args.message || output || reasoning.plan || '';
          let reply = normalizeRichContent(fallbackReplySource, toolCall.args.text || toolCall.args.message || output || reasoning.plan || '');
          const structuredReplyCandidate = typeof toolCall.args.reply === 'string' ? toolCall.args.reply : typeof toolCall.args.text === 'string' ? toolCall.args.text : typeof toolCall.args.message === 'string' ? toolCall.args.message : '';
          if (typeof structuredReplyCandidate === 'string' && structuredReplyCandidate.trim()) {
            try {
              const parsedReply = JSON.parse(structuredReplyCandidate);
              reply = normalizeRichContent(parsedReply, toolCall.args.text || toolCall.args.message || output || reasoning.plan || '');
            } catch {
              reply = normalizeRichContent(fallbackReplySource, toolCall.args.text || toolCall.args.message || output || reasoning.plan || '');
            }
          }
          const previewText = toolCall.args.previewText || richContentToPlainText(reply, toolCall.args.text || toolCall.args.message || output || reasoning.plan || '');
          const result = {
            success: toolCall.args.success !== false,
            message: previewText || (toolCall.args.success === false ? 'Action stopped.' : 'Action completed.'),
            previewText,
            reply,
            steps: this.history,
            tokenUsage: sessionUsage
          };
          logger.info('AgentRuntime', `Task completed: ${result.message}`);
          this.emitTrace('task_completed', {
            success: result.success,
            message: result.message,
            steps: this.history.length,
            tokenUsage: sessionUsage
          }, step);
          await this.config.onAfterTask?.(result);
          return result;
        }

        // Check if asking user (legacy path — only breaks loop when onAskUser is NOT set)
        if (toolCall.name === 'ask_user' && !this.config.onAskUser) {
          let rawQuestion = toolCall.args.question || output || '';
          if (typeof rawQuestion === 'string') {
            rawQuestion = rawQuestion.replace(/\[\d+\]/g, '').replace(/  +/g, ' ').trim();
          }
          this.lastAskUserQuestion = rawQuestion;
          const result = {
            success: true,
            message: this.lastAskUserQuestion || '',
            steps: this.history,
            tokenUsage: sessionUsage
          };
          this.emitTrace('task_paused_for_user', {
            question: this.lastAskUserQuestion || ''
          }, step);
          await this.config.onAfterTask?.(result);
          return result;
        }

        // Step delay — skip for non-UI tools (no render settle needed)
        const NON_UI_TOOLS = new Set(['done', 'ask_user', 'wait', 'capture_screenshot', 'query_knowledge', 'query_data', 'escalate_to_human', 'report_issue', 'guide', 'simplify', 'restore', 'web_search']);
        if (!NON_UI_TOOLS.has(toolCall.name)) {
          await new Promise(resolve => setTimeout(resolve, stepDelay));
        }
      }

      // Max steps reached
      const result = {
        success: false,
        message: `Reached maximum steps (${maxSteps}) without completing the task.`,
        steps: this.history,
        tokenUsage: sessionUsage
      };

      // Dev warning: remind developers to add aiConfirm for extra safety
      if (__DEV__ && this.config.interactionMode !== 'autopilot') {
        logger.info('AgentRuntime', 'ℹ️ Copilot mode active. Tip: Add aiConfirm={true} to critical buttons (e.g. "Place Order", "Delete") for extra safety.');
      }
      this.emitTrace('task_failed_max_steps', {
        success: false,
        steps: this.history.length,
        message: result.message
      });
      await this.config.onAfterTask?.(result);
      return result;
    } catch (error) {
      // A cancel() aborts the in-flight fetch, surfacing here as an AbortError.
      // Treat that as a clean cancellation rather than a failure.
      if (this.isCancelRequested) {
        const cancelledResult = {
          success: false,
          message: 'Task was cancelled.',
          steps: this.history,
          tokenUsage: sessionUsage
        };
        await this.config.onAfterTask?.(cancelledResult);
        return cancelledResult;
      }
      logger.error('AgentRuntime', 'Execution error:', error);
      this.emitTrace('task_failed_error', {
        error: error?.message ?? String(error),
        steps: this.history.length
      });
      const result = {
        success: false,
        message: `Error: ${error.message}`,
        steps: this.history,
        tokenUsage: sessionUsage
      };
      await this.config.onAfterTask?.(result);
      return result;
    } finally {
      this.isRunning = false;
      if (this.taskAbortController === taskAbortController) {
        this.taskAbortController = null;
      }
      this.currentTraceId = null;
      // Reset per-task action-safety state — cache/approvals must not leak across tasks.
      this.actionSafetyCache.clear();
      this.screenSafetyPromises.clear();
      this.actionSafetyApprovedBoundaries.clear();
      this.lastExplicitActionApproval = null;
      this.currentScreenSignature = '';
      this.currentScreenContent = '';
      if (this.config.interceptNativeAlerts) {
        uninstallAlertInterceptor();
      }
      // ── Grace period: keep error suppression for delayed side-effects ──
      // useEffect callbacks, PagerView onPageSelected, scrollToIndex, etc.
      // can fire AFTER execute() returns. Keep suppression active for 10s.
      this._stopErrorSuppression(10000);
    }
  }

  /** Update refs (called when component re-renders) */
  updateRefs(_rootRef, _navRef) {}

  /** Check if agent is currently executing */
  getIsRunning() {
    return this.isRunning;
  }

  /**
   * Cancel the currently running task.
   * The agent loop checks this flag at the start of each step,
   * so the current step will complete before the task stops.
   */
  cancel() {
    if (this.isRunning) {
      this.isCancelRequested = true;
      // Abort the in-flight LLM fetch so the run unwinds now (otherwise isRunning
      // stays true until a slow/hung request returns, wedging the runtime).
      this.taskAbortController?.abort();
      logger.info('AgentRuntime', 'Cancel requested — aborting in-flight request');
    }
  }

  /**
   * Cancel the running task and wait until the runtime has fully stopped.
   * Polls isRunning every 50ms up to the given timeout.
   */
  async cancelAndWait(timeoutMs = 5000) {
    this.cancel();
    const deadline = Date.now() + timeoutMs;
    while (this.isRunning && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
//# sourceMappingURL=AgentRuntime.js.map
