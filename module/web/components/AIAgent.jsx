'use strict';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBridgeProvider } from '../../core/ActionBridge.js';
import { IdleDetector } from '../../core/IdleDetector.js';
import { setTwomiliaBase } from '../../config/endpoints.js';
import {
  createAIMessage,
  markdownToPlainText,
  normalizeExecutionResult,
  richContentToPlainText,
} from '../../core/richContent.js';
import {
  startConversation,
  appendMessages,
  fetchConversations,
  fetchConversation,
} from '../../services/ConversationService.js';
import { VoiceService } from '../../services/VoiceService.js';
import { initDeviceId } from '../../services/telemetry/device.js';
import { AgentContext } from '../../hooks/useAction.js';
import { RichUIProvider } from '../../components/rich-content/RichUIContext.js';
import { CSATSurvey } from '../../support/CSATSurvey.js';
import { createEscalateTool } from '../../support/escalateTool.js';
import { buildSupportPrompt } from '../../support/supportPrompt.js';
import { EscalationSocket } from '../../support/EscalationSocket.js';
import { ENDPOINTS } from '../../config/endpoints.js';
import { float32ToInt16Base64, base64ToFloat32 } from '../../utils/audioUtils.js';
import { logger } from '../../utils/logger.js';
import { WebPlatformAdapter } from '../core/WebPlatformAdapter.js';
import { ServerAgentClient } from '../core/ServerAgentClient.js';
import { webBlockDefinitions } from '../blocks.js';
import { RichContentRendererWeb } from './RichContentRendererWeb.js';
import { QuickActionsPanelWeb } from './QuickActionsPanelWeb.js';
const APPROVAL_GRANTED_TOKEN = '__APPROVAL_GRANTED__';
const APPROVAL_REJECTED_TOKEN = '__APPROVAL_REJECTED__';
const ASK_USER_CANCELLED_TOKEN = '__ASK_USER_CANCELLED__';
const CLOSED_TICKET_STATUSES = new Set(['closed', 'resolved']);
const DEFAULT_WEB_VOICE_MODEL = 'gemini-3.1-flash-live-preview';
const TRANSCRIPT_MERGE_WINDOW_MS = 3200;
const VOICE_TRANSCRIPT_SETTLE_MS = 650;
const COMPOSER_CANCEL_ARM_MS = 900;
const WEB_POPUP_WIDTH = 340;
const WEB_LAUNCHER_SIZE = 60;
const WEB_FLOATING_EDGE_PADDING = 12;
const DISCOVERY_TOOLTIP_SESSION_KEY = '@mobileai_web_discovery_tooltip_seen';
const DISCOVERY_TOOLTIP_DEFAULT_MESSAGE = 'Ask me to find items, answer questions, or complete tasks';
const DISCOVERY_TOOLTIP_AUTO_DISMISS_MS = 6000;

// Per-action highlight glyphs/labels — mirrors RN HighlightOverlay so every
// agent action (tap/type/scroll/…) rings its target with a small action pill.
const ACTION_GLYPH_WEB = {
  tap: '›',
  read: '◉',
  type: '⌨',
  verify: '✓',
  scroll: '↕',
  fill: '✎',
  wait: '⏱',
};
const ACTION_LABEL_WEB = {
  tap: 'Tap',
  read: 'Reading',
  type: 'Typing',
  verify: 'Verifying',
  scroll: 'Scrolling',
  fill: 'Filling',
  wait: 'Working',
};
function clampFloatingPosition(left, top, width, height) {
  if (typeof window === 'undefined') {
    return {
      left,
      top,
    };
  }
  const maxLeft = Math.max(WEB_FLOATING_EDGE_PADDING, window.innerWidth - width - WEB_FLOATING_EDGE_PADDING);
  const maxTop = Math.max(WEB_FLOATING_EDGE_PADDING, window.innerHeight - height - WEB_FLOATING_EDGE_PADDING);
  return {
    left: Math.min(Math.max(WEB_FLOATING_EDGE_PADDING, left), maxLeft),
    top: Math.min(Math.max(WEB_FLOATING_EDGE_PADDING, top), maxTop),
  };
}
function getEstimatedPopupSize() {
  if (typeof window === 'undefined') {
    return {
      width: WEB_POPUP_WIDTH,
      height: 180,
    };
  }
  return {
    width: Math.min(WEB_POPUP_WIDTH, window.innerWidth - 32),
    height: Math.min(220, window.innerHeight * 0.65),
  };
}
function WebAIBadge({ size = 28 }) {
  const bubbleWidth = size * 0.6;
  const bubbleHeight = size * 0.45;
  const tailSize = size * 0.12;
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: bubbleWidth,
          height: bubbleHeight,
          background: '#fff',
          borderRadius: size * 0.12,
          marginBottom: tailSize * 0.5,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: size * 0.18,
          left: size * 0.22,
          width: 0,
          height: 0,
          borderTop: `${tailSize}px solid #fff`,
          borderRight: `${tailSize}px solid transparent`,
        }}
      />
    </div>
  );
}
function WebLoadingDots({ size = 28, color = '#fff' }) {
  const dotSize = size * 0.15;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: dotSize * 0.8,
      }}
    >
      {[0.4, 0.7, 1].map((opacity, index) => (
        <div
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            background: color,
            opacity,
          }}
          key={index}
        />
      ))}
    </div>
  );
}
function WebTypingBubble() {
  // In-chat "assistant is writing" indicator — matches the assistant bubble
  // styling, with three dots that bounce (tw-typing keyframe).
  return (
    <div
      className="mobileai-web-chat-bubble"
      style={{
        alignSelf: 'flex-start',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        borderRadius: 18,
        borderBottomLeftRadius: 5,
        padding: '14px 15px',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.08)',
        marginBottom: 8,
        flexShrink: 0,
      }}
      aria-label="Assistant is typing"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="tw-typing-dot"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.75)',
            animation: `tw-typing 1.3s ${i * 0.16}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
function WebAgentOverlay({ visible, statusText, onCancel }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 58,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          maxWidth: '85%',
          padding: '10px 14px',
          borderRadius: 999,
          background: 'rgba(26, 26, 46, 0.92)',
          color: '#fff',
          boxShadow: '0 16px 36px rgba(0, 0, 0, 0.28)',
          pointerEvents: 'auto',
        }}
      >
        <WebLoadingDots size={18} color="#fff" />
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.3,
            flexShrink: 1,
          }}
        >
          {statusText || 'Thinking...'}
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel AI request"
            style={{
              marginLeft: 2,
              width: 22,
              height: 22,
              borderRadius: 999,
              border: 'none',
              background: 'rgba(255,255,255,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <WebCloseIcon size={12} color="#fff" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
function WebCloseIcon({ size = 14, color = 'rgba(255,255,255,0.6)' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('path', {
      d: 'M6 6L18 18',
    }),
    React.createElement('path', {
      d: 'M18 6L6 18',
    }),
  );
}
function WebTrashIcon({ size = 14, color = 'rgba(255,255,255,0.62)' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('path', {
      d: 'M3 6h18',
    }),
    React.createElement('path', {
      d: 'M8 6V4h8v2',
    }),
    React.createElement('path', {
      d: 'M19 6l-1 14H6L5 6',
    }),
    React.createElement('path', {
      d: 'M10 11v5',
    }),
    React.createElement('path', {
      d: 'M14 11v5',
    }),
  );
}
function WebHistoryIcon({ size = 18, color = '#fff' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('path', {
      d: 'M3 12a9 9 0 1 0 3-6.7',
    }),
    React.createElement('path', {
      d: 'M3 4v5h5',
    }),
    React.createElement('path', {
      d: 'M12 7v5l3 2',
    }),
  );
}
function WebNewChatIcon({ size = 14, color = '#0D9373' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('path', {
      d: 'M12 5v14',
    }),
    React.createElement('path', {
      d: 'M5 12h14',
    }),
  );
}
function WebMicIcon({ size = 18, color = '#fff' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('rect', {
      x: '9',
      y: '3',
      width: '6',
      height: '11',
      rx: '3',
      fill: color,
      stroke: 'none',
    }),
    React.createElement('path', {
      d: 'M7 11a5 5 0 0 0 10 0',
    }),
    React.createElement('path', {
      d: 'M12 16v5',
    }),
    React.createElement('path', {
      d: 'M9 21h6',
    }),
  );
}
function WebSpeakerIcon({ size = 18, color = '#fff', muted = false }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('polygon', {
      points: '5,10 9,10 14,6 14,18 9,14 5,14',
      fill: color,
      stroke: 'none',
    }),
    muted
      ? React.createElement('path', {
          d: 'M18 8l-6 8',
        })
      : React.createElement('path', {
          d: 'M18 9a4 4 0 0 1 0 6',
        }),
  );
}
function WebStopIcon({ size = 18, color = '#fff' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
    },
    React.createElement('rect', {
      x: '7',
      y: '7',
      width: '10',
      height: '10',
      rx: '1.8',
      fill: color,
    }),
  );
}
function WebSendArrowIcon({ size = 18, color = '#fff' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
    },
    React.createElement('polygon', {
      points: '8,6 18,12 8,18',
      fill: color,
    }),
  );
}
function makeStorageKey(provider) {
  return `@mobileai_web_ai_consent_${provider || 'default'}`;
}
// Provider display info for the in-panel consent card "Learn more" link.
const CONSENT_PROVIDER_INFO = {
  gemini: { name: 'Google Gemini', url: 'https://ai.google.dev/terms' },
  openai: { name: 'OpenAI GPT', url: 'https://openai.com/policies/terms-of-use' },
};
const CONSENT_SHARED_DATA_ITEMS = [
  'Your message',
  'Relevant information from the current app screen',
];
// Convert a #rgb/#rrggbb accent into an rgba() string for translucent surfaces.
// Falls back to a brand-green tint if the value isn't a parseable hex.
function hexToRgba(hex, alpha = 1) {
  if (typeof hex !== 'string') return `rgba(13, 147, 115, ${alpha})`;
  let value = hex.trim().replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (value.length !== 6 || /[^0-9a-fA-F]/.test(value)) {
    return `rgba(13, 147, 115, ${alpha})`;
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function loadPersistedChatState(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : null,
      isOpen: parsed.isOpen === true,
    };
  } catch {
    return null;
  }
}
function persistChatState(storageKey, state) {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}
// ── Task continuity across full page reloads (multi-page-app navigation) ──
// On MPA sites (WordPress/WooCommerce/plain server-rendered) every navigation is
// a full reload that destroys the running agent loop. We persist the active goal
// before such a reload and auto-resume it on the next page, so a multi-step task
// (e.g. "add to cart then checkout") continues seamlessly. Loop-safety: a per-task
// resume cap + a freshness TTL.
const RESUME_TTL_MS = 120000;
const RESUME_CAP = 4;
function makeResumeStorageKey(storageKey) {
  return storageKey ? `${storageKey}__resume` : null;
}
function loadResumeTask(storageKey) {
  const key = makeResumeStorageKey(storageKey);
  if (!key || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.goal !== 'string') return null;
    return { goal: parsed.goal, count: Number(parsed.count) || 0, ts: Number(parsed.ts) || 0 };
  } catch {
    return null;
  }
}
function saveResumeTask(storageKey, record) {
  const key = makeResumeStorageKey(storageKey);
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Ignore storage failures.
  }
}
function clearResumeTask(storageKey) {
  const key = makeResumeStorageKey(storageKey);
  if (!key || typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}
function makeHistoryStorageKey(storageKey) {
  return storageKey ? `${storageKey}__history` : null;
}
function loadPersistedConversationHistory(storageKey) {
  const historyKey = makeHistoryStorageKey(storageKey);
  if (!historyKey || typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(historyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistConversationHistory(storageKey, conversations) {
  const historyKey = makeHistoryStorageKey(storageKey);
  if (!historyKey || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(historyKey, JSON.stringify(conversations));
  } catch {
    // Ignore storage failures.
  }
}
function buildConversationSummary(id, messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const firstUserMessage = safeMessages.find((message) => message.role === 'user');
  const lastMessage = safeMessages[safeMessages.length - 1];
  const titleSource =
    firstUserMessage?.previewText || firstUserMessage?.content || lastMessage?.previewText || 'Conversation';
  const previewSource = lastMessage?.previewText || lastMessage?.content || '';
  const titleText = Array.isArray(titleSource)
    ? richContentToPlainText(titleSource, 'Conversation')
    : markdownToPlainText(String(titleSource || 'Conversation')).trim();
  const previewText = Array.isArray(previewSource)
    ? richContentToPlainText(previewSource, '')
    : markdownToPlainText(String(previewSource || '')).trim();
  return {
    id,
    title: titleText.slice(0, 60) || 'Conversation',
    preview: previewText.slice(0, 120),
    updatedAt: lastMessage?.timestamp || Date.now(),
    messageCount: safeMessages.length,
    messages: safeMessages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      previewText: message.previewText,
      timestamp: message.timestamp,
      promptKind: message.promptKind,
    })),
  };
}
function formatRelativeTimestamp(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m ago`;
  if (diff < 86_400_000) return `${Math.max(1, Math.round(diff / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(diff / 86_400_000))}d ago`;
}
// U5 — human-chat time formatting (mirrors RN SupportChatModal).
function formatMessageClock(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
function formatDateSeparator(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  try {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: today.getFullYear() === date.getFullYear() ? undefined : 'numeric',
    });
  } catch {
    return '';
  }
}
async function ensureConsent(requireConsent, providerName) {
  if (!requireConsent || typeof window === 'undefined') return true;
  const key = makeStorageKey(providerName);
  try {
    if (window.localStorage.getItem(key) === 'granted') return true;
  } catch {
    // Ignore storage failures.
  }
  const approved = window.confirm(
    'Allow this app to send your message and relevant page context to the configured AI provider?',
  );
  if (approved) {
    try {
      window.localStorage.setItem(key, 'granted');
    } catch {
      // Ignore storage failures.
    }
  }
  return approved;
}
// U6(b) — auto-grow a composer textarea with its content (capped at 140px),
// matching the RN multiline input behavior. Pass `reset` to collapse it back to
// its base height after a send.
function autoGrowTextarea(el, reset = false) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = reset ? '' : `${Math.min(el.scrollHeight, 140)}px`;
}
function toUserHistory(messages) {
  return messages.map((entry) => ({
    role: entry.role,
    content: entry.previewText,
  }));
}
function createModeTranscriptMessage(role, text, final = true, timestamp = Date.now()) {
  return {
    id: `${role}-${Date.now()}-${Math.random()}`,
    role,
    text,
    final,
    timestamp,
  };
}
function normalizeVoiceTranscriptText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<noise>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function shouldReplaceVoiceTranscript(currentText, nextText) {
  const current = normalizeVoiceTranscriptText(currentText).toLowerCase();
  const next = normalizeVoiceTranscriptText(nextText).toLowerCase();
  if (!current || !next) return false;
  if (current === next) return true;
  if (next.startsWith(current) || current.startsWith(next)) return true;
  if (next.includes(current) || current.includes(next)) return true;
  return false;
}
function toSupportMessage(ticketId, role, content, timestamp) {
  const previewText =
    typeof content === 'string' ? markdownToPlainText(content).trim() : richContentToPlainText(content, '');
  return createAIMessage({
    id: `${ticketId}-${role}-${timestamp || Date.now()}-${Math.random()}`,
    role: role === 'user' ? 'user' : 'assistant',
    content,
    previewText,
    timestamp: timestamp || Date.now(),
  });
}
function historyToSupportMessages(ticketId, history) {
  return history.map((entry, index) =>
    toSupportMessage(
      ticketId,
      entry.role === 'live_agent' ? 'assistant' : entry.role,
      entry.content,
      entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now() + index,
    ),
  );
}
function getBrowserLanguage() {
  const raw = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en';
  return raw.split('-')[0] || 'en';
}
function describeMicrophonePermissionError(error) {
  const name = typeof error?.name === 'string' ? error.name : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  const lowered = `${name} ${message}`.toLowerCase();
  if (typeof window !== 'undefined' && !window.isSecureContext && window.location?.hostname !== 'localhost') {
    return 'Microphone access requires HTTPS or localhost.';
  }
  if (
    lowered.includes('notallowed') ||
    lowered.includes('permission denied') ||
    lowered.includes('permission dismissed')
  ) {
    return 'Microphone permission was denied. Please allow microphone access in your browser and try again.';
  }
  if (lowered.includes('notfound') || lowered.includes('device not found')) {
    return 'No microphone was found for this browser.';
  }
  if (lowered.includes('notreadable') || lowered.includes('track start failed')) {
    return 'Your microphone is busy in another app or unavailable right now.';
  }
  return message || 'Microphone access failed.';
}
function detectBrowserFamily() {
  if (typeof navigator === 'undefined') return 'unknown';
  const userAgent = navigator.userAgent || '';
  if (/Edg\//.test(userAgent)) return 'edge';
  if (/Chrome\//.test(userAgent) && !/Edg\//.test(userAgent)) return 'chrome';
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return 'safari';
  if (/Firefox\//.test(userAgent)) return 'firefox';
  return 'unknown';
}
function buildMicrophonePermissionIssue(kind, message) {
  return {
    kind,
    message,
  };
}
function getMicrophonePermissionGuidance(kind) {
  const browser = detectBrowserFamily();
  if (kind === 'denied') {
    if (browser === 'chrome' || browser === 'edge') {
      return {
        title: 'Allow microphone for this site',
        steps: [
          'Click the site icon next to the address bar.',
          'Open site settings.',
          'Set Microphone to Allow, then return here and try again.',
        ],
      };
    }
    if (browser === 'safari') {
      return {
        title: 'Allow microphone in Safari',
        steps: [
          'Open Safari > Settings > Websites.',
          'Choose Microphone.',
          'Set this site to Allow, then return here and try again.',
        ],
      };
    }
    if (browser === 'firefox') {
      return {
        title: 'Allow microphone in Firefox',
        steps: [
          'Click the site permissions icon in the address bar.',
          'Allow microphone access for this site, then return here and try again.',
        ],
      };
    }
  }
  if (kind === 'insecure') {
    return {
      title: 'Use a secure origin',
      steps: ['Open this app on HTTPS or localhost before using voice mode.'],
    };
  }
  if (kind === 'notfound') {
    return {
      title: 'Check audio input devices',
      steps: ['Connect or enable a microphone in your operating system, then try again.'],
    };
  }
  if (kind === 'notreadable') {
    return {
      title: 'Free the microphone',
      steps: ['Close other apps or tabs that are currently using the microphone, then try again.'],
    };
  }
  return {
    title: 'Check microphone access',
    steps: ['Allow microphone access for this site, then try again.'],
  };
}
async function requestBrowserMicrophoneAccess() {
  if (!navigator?.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      stream: null,
      issue: buildMicrophonePermissionIssue('unsupported', 'Voice mode requires microphone support in this browser.'),
    };
  }
  try {
    const liveStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    return {
      granted: true,
      stream: liveStream,
      issue: null,
    };
  } catch (error) {
    const normalizedMessage = describeMicrophonePermissionError(error);
    const lowered = normalizedMessage.toLowerCase();
    const kind = lowered.includes('https or localhost')
      ? 'insecure'
      : lowered.includes('no microphone')
        ? 'notfound'
        : lowered.includes('busy in another app')
          ? 'notreadable'
          : lowered.includes('permission was denied')
            ? 'denied'
            : 'unknown';
    return {
      granted: false,
      stream: null,
      issue: buildMicrophonePermissionIssue(kind, normalizedMessage),
    };
  }
}
function normalizeQuickReplies(quickReplies) {
  if (!Array.isArray(quickReplies)) return [];
  return quickReplies.filter((reply) => reply && typeof reply.label === 'string' && reply.label.trim().length > 0);
}
function withAuthorization(headers, analyticsKey) {
  if (!analyticsKey) return headers;
  const nextHeaders = {
    ...(headers || {}),
  };
  const hasAuthorization = Object.keys(nextHeaders).some((key) => key.toLowerCase() === 'authorization');
  if (!hasAuthorization) {
    nextHeaders.Authorization = `Bearer ${analyticsKey}`;
  }
  return nextHeaders;
}

// AudioWorklet capture processor, shipped inline (the CDN bundle has no separate
// worklet file) via a Blob URL. Buffers ~2048-sample blocks and posts Float32
// frames to the main thread — replaces the deprecated ScriptProcessorNode.
const CAPTURE_WORKLET_SRC = `
class MobileAICaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2048);
    this._n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this._buf[this._n++] = ch[i];
        if (this._n >= this._buf.length) {
          this.port.postMessage(this._buf.slice(0, this._n));
          this._n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('mobileai-capture', MobileAICaptureProcessor);
`;
function createBrowserMicController({ onChunk, onError, consumeInitialStream }) {
  let context = null;
  let stream = null;
  let processor = null;
  let source = null;
  let sink = null;
  let active = false;
  let muted = false;
  let targetSampleRate = 16000;
  let frameCount = 0;
  let consecutiveSilentFrames = 0;
  let restarting = false;
  const SILENT_THRESHOLD = 0.01;
  const SILENT_FRAMES_BEFORE_RESTART = Number.POSITIVE_INFINITY;
  const AudioContextCtor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  const resampleTo16k = (input, inputSampleRate) => {
    if (!input || input.length === 0 || inputSampleRate === 16000) {
      return input;
    }
    const ratio = inputSampleRate / 16000;
    const outputLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(outputLength);
    for (let i = 0; i < output.length; i += 1) {
      const srcIndex = Math.min(input.length - 1, i * ratio);
      const lower = Math.floor(srcIndex);
      const upper = Math.min(input.length - 1, lower + 1);
      const t = srcIndex - lower;
      const lowerValue = input[lower] || 0;
      const upperValue = input[upper] || 0;
      output[i] = lowerValue + (upperValue - lowerValue) * t;
    }
    return output;
  };
  // Shared by both the AudioWorklet and ScriptProcessor paths: amplitude/silence
  // bookkeeping, optional resample to 16k, then emit a base64 PCM16 chunk.
  const processFrame = (channelData) => {
    if (!active || muted || !channelData) return;
    frameCount += 1;
    let maxAmp = 0;
    for (let i = 0; i < channelData.length; i += 1) {
      const abs = Math.abs(channelData[i] || 0);
      if (abs > maxAmp) maxAmp = abs;
    }
    if (frameCount <= 5 || frameCount % 10 === 0) {
      logger.info('AudioInput', `🎤 Frame #${frameCount}: maxAmp=${maxAmp.toFixed(6)}, samples=${channelData.length}`);
    }
    if (maxAmp < SILENT_THRESHOLD) {
      consecutiveSilentFrames += 1;
      if (consecutiveSilentFrames >= SILENT_FRAMES_BEFORE_RESTART && !restarting) {
        consecutiveSilentFrames = 0;
        restarting = true;
        logger.warn('AudioInput', `⚠️ ${SILENT_FRAMES_BEFORE_RESTART} silent frames — restarting stream graph...`);
        void restart()
          .then(() => {
            restarting = false;
            logger.info('AudioInput', '✅ Mic graph restarted');
          })
          .catch((error) => {
            restarting = false;
            onError?.(`Microphone restart failed: ${error?.message || error}`);
          });
        return;
      }
    } else {
      if (consecutiveSilentFrames > 5) {
        logger.info('AudioInput', `🎤 Mic recovered after ${consecutiveSilentFrames} silent frames`);
      }
      consecutiveSilentFrames = 0;
    }
    if (!channelData.length) return;
    const normalizedChannelData =
      targetSampleRate === 16000 ? channelData : resampleTo16k(channelData, targetSampleRate);
    if (!normalizedChannelData.length) return;
    onChunk(float32ToInt16Base64(new Float32Array(normalizedChannelData)));
  };
  const teardown = async () => {
    try {
      processor?.disconnect();
      source?.disconnect();
      sink?.disconnect();
      stream?.getTracks?.().forEach((track) => track.stop());
      if (context && context.state !== 'closed') {
        await context.close();
      }
    } catch {
      // Ignore audio cleanup failures.
    }
    processor = null;
    source = null;
    sink = null;
    stream = null;
    context = null;
    frameCount = 0;
    consecutiveSilentFrames = 0;
    muted = false;
  };
  const getAudioTrack = () => stream?.getAudioTracks?.()?.[0] || null;
  const setTrackEnabled = (enabled) => {
    const track = getAudioTrack();
    if (track) {
      track.enabled = enabled;
    }
    muted = !enabled;
  };
  const ensureGraph = async () => {
    if (!stream) {
      stream =
        consumeInitialStream?.() ||
        (await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        }));
      logger.info('AudioInput', `✅ Microphone access granted (tracks=${stream.getTracks?.().length || 0})`);
    }
    if (!context || context.state === 'closed' || !source || !processor || !sink) {
      context = new AudioContextCtor({
        sampleRate: 16000,
      });
      targetSampleRate = context.sampleRate || 16000;
      source = context.createMediaStreamSource(stream);
      const WorkletNodeCtor = typeof window !== 'undefined' ? window.AudioWorkletNode : undefined;
      sink = context.createGain();
      sink.gain.value = 0;
      if (context.audioWorklet && WorkletNodeCtor) {
        const blobUrl = URL.createObjectURL(
          new Blob([CAPTURE_WORKLET_SRC], {
            type: 'application/javascript',
          }),
        );
        try {
          await context.audioWorklet.addModule(blobUrl);
        } finally {
          URL.revokeObjectURL(blobUrl);
        }
        processor = new WorkletNodeCtor(context, 'mobileai-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
        });
        processor.port.onmessage = (event) => processFrame(event.data);
        logger.info('AudioInput', '🎛️ Capture path: AudioWorklet');
      } else {
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => processFrame(event.inputBuffer.getChannelData(0));
        logger.info('AudioInput', '🎛️ Capture path: ScriptProcessor fallback (AudioWorklet unavailable)');
      }
      source.connect(processor);
      processor.connect(sink);
      sink.connect(context.destination);
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
  };
  const start = async () => {
    if (active) return true;
    if (!AudioContextCtor || !navigator?.mediaDevices?.getUserMedia) {
      onError?.('Voice mode requires microphone support in this browser.');
      return false;
    }
    try {
      await ensureGraph();
      active = true;
      setTrackEnabled(true);
      logger.info('AudioInput', `Streaming started (${context.sampleRate}Hz, requested 16000Hz), frameSize=4096`);
      logger.debug('AudioInput', `🎤 Mic controller state active=${active}, targetSampleRate=${targetSampleRate}`);
      return true;
    } catch (error) {
      const normalizedError = describeMicrophonePermissionError(error);
      onError?.(normalizedError);
      logger.error('AudioInput', `Failed to start microphone controller: ${normalizedError}`);
      await stop();
      return false;
    }
  };
  const restart = async () => {
    active = false;
    await teardown();
    const restarted = await start();
    if (!restarted) throw new Error('Microphone restart failed');
  };
  return {
    start,
    async mute() {
      active = false;
      setTrackEnabled(false);
      logger.info('AudioInput', '🎤 Microphone muted');
    },
    async unmute() {
      return start();
    },
    async destroy() {
      active = false;
      try {
        const trackCount = stream?.getTracks?.().length || 0;
        logger.info(
          'AudioInput',
          `Stopping microphone controller (tracks=${trackCount}, contextState=${context?.state || 'n/a'})`,
        );
        await teardown();
      } catch {
        // Ignore audio cleanup failures.
      }
    },
    async stop() {
      await this.destroy();
    },
  };
}
function createBrowserAudioPlayer({ onSpeakingChange }) {
  let context = null;
  let gainNode = null;
  let nextStartTime = 0;
  let activeSources = 0;
  let muted = false;
  const AudioContextCtor = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  async function ensureContext() {
    if (!AudioContextCtor) return null;
    if (!context || context.state === 'closed') {
      context = new AudioContextCtor({
        sampleRate: 24000,
      });
      gainNode = context.createGain();
      gainNode.gain.value = muted ? 0 : 1;
      gainNode.connect(context.destination);
      nextStartTime = context.currentTime;
    }
    if (context.state === 'suspended') {
      await context.resume();
    }
    return context;
  }
  return {
    async prime() {
      await ensureContext();
    },
    async enqueue(base64Audio) {
      const ctx = await ensureContext();
      if (!ctx || !gainNode) return;
      const float32Data = base64ToFloat32(base64Audio);
      const buffer = ctx.createBuffer(1, float32Data.length, 24000);
      buffer.copyToChannel(float32Data, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      const startTime = Math.max(ctx.currentTime, nextStartTime);
      nextStartTime = startTime + buffer.duration;
      activeSources += 1;
      onSpeakingChange(true);
      source.onended = () => {
        activeSources = Math.max(0, activeSources - 1);
        if (activeSources === 0) {
          onSpeakingChange(false);
          nextStartTime = ctx.currentTime;
        }
      };
      source.start(startTime);
    },
    mute() {
      muted = true;
      if (gainNode) gainNode.gain.value = 0;
    },
    unmute() {
      muted = false;
      if (gainNode) gainNode.gain.value = 1;
    },
    async stop() {
      onSpeakingChange(false);
      activeSources = 0;
      nextStartTime = 0;
      if (context && context.state !== 'closed') {
        await context.close();
      }
      context = null;
      gainNode = null;
    },
  };
}
export function AIAgent({
  children,
  scanRoot,
  provider = 'gemini',
  apiKey,
  proxyUrl,
  proxyHeaders,
  voiceProxyUrl,
  voiceProxyHeaders,
  analyticsKey,
  userContext,
  pushToken,
  pushTokenType,
  supportMode,
  model,
  verifier,
  supportStyle,
  headerTitle,
  maxSteps,
  stepDelay,
  customTools,
  instructions,
  onBeforeStep,
  onAfterStep,
  onBeforeTask,
  onAfterTask,
  onTokenUsage,
  knowledgeBase,
  knowledgeMaxTokens,
  enableUIControl = true,
  enableVoice = false,
  allowedActionNames,
  screenMap,
  maxTokenBudget,
  maxCostUSD,
  interactionMode,
  mcpServerUrl,
  debug = false,
  showChat = true,
  defaultOpen = false,
  inputPlaceholder = 'Ask AI…',
  theme,
  surfaceThemes,
  blockActionHandlers,
  routerAdapter,
  pathname,
  requireConsent = false,
  captureScreenshot,
  ignoreSelectors,
  confirmSelectors,
  persistenceKey = 'twomilia-chat',
  proactiveHelp,
  accentColor,
  privacyPolicyUrl,
  enableWebSearch = false,
  showDiscoveryTooltip = true,
  discoveryTooltipMessage,
}) {
  // U1 — single accent source for the widget's own chrome (FAB, send/approve
  // buttons, user bubbles, active tab, loading dots). Mirrors RN, which threads
  // theme.primaryColor / accentColor (AgentChatBar.tsx). #0D9373 stays as the
  // fallback only.
  const accent = accentColor || theme?.primaryColor || '#0D9373';
  // Translucent accent tint for soft surfaces (active tab, user voice bubble).
  const accentTint = useMemo(() => hexToRgba(accent, 0.22), [accent]);
  // Title for the single-mode header bar (shown when there are no Chat/Voice
  // tabs). Falls back to the support persona/greeting name, then a generic one.
  const resolvedHeaderTitle =
    headerTitle || supportMode?.persona?.agentName || supportMode?.greeting?.agentName || 'AI Assistant';
  const accentGradient = useMemo(() => {
    if (accent === '#0D9373') return 'linear-gradient(135deg, #11A582 0%, #0D9373 100%)';
    return `linear-gradient(135deg, ${accent} 0%, ${accent} 100%)`;
  }, [accent]);
  const persistedState = useMemo(() => loadPersistedChatState(persistenceKey), [persistenceKey]);
  const persistedConversationHistory = useMemo(
    () => loadPersistedConversationHistory(persistenceKey),
    [persistenceKey],
  );
  const [messages, setMessages] = useState(() => persistedState?.messages || []);
  const messagesRef = useRef([]);
  const [conversationId, setConversationId] = useState(() => persistedState?.conversationId || null);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const activeGoalRef = useRef(null);
  const didResumeRef = useRef(false);
  // Tracks whether the user granted a workflow-covering approval in the current
  // task, so it can be carried across an MPA reload+resume (each resume is a fresh
  // server session that otherwise re-asks "May I tap ...?" for the same action).
  const workflowApprovedRef = useRef(false);
  const [statusText, setStatusText] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState([]);
  const fileInputRef = useRef(null);
  const composerInputRef = useRef(null);
  const supportInputRef = useRef(null);
  const [isOpen, setIsOpen] = useState(persistedState?.isOpen ?? defaultOpen);
  const [popupPosition, setPopupPosition] = useState(null);
  const [localConversationKey, setLocalConversationKey] = useState(() => `local-${Date.now()}`);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  // U2 — styled in-panel AI consent (replaces window.confirm). Holds the pending
  // promise resolver so the Allow / Don't-Allow buttons settle the same promise
  // the old window.confirm path returned. Mirrors RN AgentChatBar consentVisible.
  const [consentRequest, setConsentRequest] = useState(null);
  const [guide, setGuide] = useState(null);
  // Minimize-while-executing + proactive help (web ports of the RN UX).
  // `actingOnPage` = the agent is mid-action (collapse trigger + maximize gate).
  // `minimized` = the sticky collapsed state; stays collapsed through the whole
  // action phase and only restores when a message lands (and we're not acting),
  // on run end, on an approval prompt, or when the user taps the pill.
  const [actingOnPage, setActingOnPage] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [forceExpandDuringRun, setForceExpandDuringRun] = useState(false);
  const actingClearTimerRef = useRef(null);
  const pendingMaximizeRef = useRef(false);
  const lastAssistantMsgIdRef = useRef(null);
  const [proactiveStage, setProactiveStage] = useState('hidden');
  const [proactiveText, setProactiveText] = useState('');
  // U4 — one-time discovery tooltip above the FAB (mirrors RN DiscoveryTooltip):
  // spring-in, auto-dismiss after ~6s, shown once per browser session.
  const [discoveryVisible, setDiscoveryVisible] = useState(false);
  const idleDetectorRef = useRef(null);
  const proactiveDismissedRef = useRef(false);
  const [mode, setMode] = useState('text');
  const [isMicActive, setIsMicActive] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState([]);
  const [voicePermissionIssue, setVoicePermissionIssue] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [localUnread, setLocalUnread] = useState(0);
  const [deviceId, setDeviceId] = useState(null);
  const [csatPrompt, setCsatPrompt] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // U3 — when true, the text-mode popup shows the QuickActions self-service panel
  // instead of the chat thread. "Chat with AI" flips this off.
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [conversationHistory, setConversationHistory] = useState(() => persistedConversationHistory);
  const guideTimerRef = useRef(null);
  const appRootRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const supportScrollRef = useRef(null);
  const voiceScrollRef = useRef(null);
  const supportSocketRef = useRef(null);
  const pendingSocketsRef = useRef(new Map());
  const selectedTicketIdRef = useRef(null);
  const popupRef = useRef(null);
  const dragStateRef = useRef(null);
  const suppressLauncherClickRef = useRef(false);
  const voiceServiceRef = useRef(null);
  const micControllerRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const pendingVoiceStreamRef = useRef(null);
  const lastVoiceContextRef = useRef('');
  const toolLockRef = useRef(false);
  const userHasSpokenRef = useRef(false);
  const screenPollIntervalRef = useRef(null);
  const conversationIdRef = useRef(persistedState?.conversationId || null);
  const seenMessageCountRef = useRef(messages.length);
  const syncedMessageCountRef = useRef(Array.isArray(persistedState?.messages) ? persistedState.messages.length : 0);
  const remoteConversationHydratedRef = useRef(false);
  const requestStartedAtRef = useRef(0);
  const lastVoiceTranscriptRef = useRef({
    role: null,
    roleLastAt: 0,
  });
  const voiceTranscriptDraftRef = useRef({
    role: null,
    text: '',
    final: false,
    id: null,
    lastAt: 0,
  });
  const voiceTranscriptSettleTimerRef = useRef(null);
  const shownCsatKeysRef = useRef(new Set());
  const [supportInput, setSupportInput] = useState('');
  const selectedTicket = selectedTicketId ? tickets.find((ticket) => ticket.id === selectedTicketId) || null : null;
  const supportModeEnabled = !!supportMode?.enabled;
  // U3 — self-service QuickActions layer (mirrors RN). Entirely gated behind the
  // config flag: when absent, nothing changes.
  const quickActionsConfig = supportMode?.quickActions;
  const quickActionsEnabled = !!quickActionsConfig?.enabled && (quickActionsConfig?.topics?.length || 0) > 0;
  const csatEnabled = supportModeEnabled && supportMode?.csat?.enabled !== false;
  const showVoiceTab = !!enableVoice;
  const voiceEnabled = showVoiceTab && !!(voiceProxyUrl || analyticsKey || proxyUrl || apiKey);
  const visibleModeCount = 1 + (showVoiceTab ? 1 : 0) + (tickets.length > 0 ? 1 : 0);
  const quickReplies = useMemo(() => normalizeQuickReplies(supportMode?.quickReplies), [supportMode?.quickReplies]);
  const supportPrompt = useMemo(
    () => (supportModeEnabled ? buildSupportPrompt(supportMode) : ''),
    [supportMode, supportModeEnabled],
  );
  const resolvedSupportStyle = supportMode?.persona?.preset || supportStyle;
  const resolvedInstructions = useMemo(() => {
    if (!supportPrompt) return instructions;
    return {
      ...instructions,
      system: [instructions?.system, supportPrompt].filter(Boolean).join('\n\n'),
    };
  }, [instructions, supportPrompt]);
  const flushPendingVoiceTranscript = useCallback(() => {
    const draft = voiceTranscriptDraftRef.current;
    if (!draft.role || !draft.text.trim()) {
      return;
    }
    setVoiceTranscript((prev) => {
      const draftEntry = createModeTranscriptMessage(draft.role, draft.text.trim(), draft.final, draft.lastAt);
      const tail = prev[prev.length - 1];
      // updateVoiceTranscriptDraft already pushes the entry (often final=true) as
      // chunks arrive. The settle-timer flush must update that same tail in place
      // when role + text match — otherwise it appends a duplicate of the message.
      if (
        tail &&
        tail.role === draft.role &&
        normalizeVoiceTranscriptText(tail.text) === normalizeVoiceTranscriptText(draftEntry.text)
      ) {
        return [
          ...prev.slice(0, -1),
          { ...tail, text: draftEntry.text, final: draftEntry.final, timestamp: draftEntry.timestamp },
        ];
      }
      if (tail && tail.role === draft.role && tail.final === false && tail.id === draft.id) {
        return [...prev.slice(0, -1), draftEntry];
      }
      if (tail && tail.role === draft.role && tail.final === false) {
        return [...prev.slice(0, -1), draftEntry];
      }
      return [...prev, draftEntry];
    });
    voiceTranscriptDraftRef.current = {
      role: null,
      text: '',
      final: false,
      id: null,
      lastAt: 0,
    };
  }, []);
  const updateVoiceTranscriptDraft = useCallback(
    (text, isFinal, role, now) => {
      const trimmed = normalizeVoiceTranscriptText(text);
      if (!trimmed) return;
      const current = voiceTranscriptDraftRef.current;
      if (current.id && current.lastAt && now - current.lastAt > VOICE_TRANSCRIPT_SETTLE_MS && current.role === role) {
        flushPendingVoiceTranscript();
        current.text = '';
        current.final = false;
        current.id = null;
      }
      if (current.role !== role) {
        flushPendingVoiceTranscript();
        current.role = role;
        current.id = `${role}-draft-${now}-${Math.random()}`;
        current.text = trimmed;
        current.lastAt = now;
        current.final = isFinal;
      } else {
        current.text = shouldReplaceVoiceTranscript(current.text, trimmed)
          ? trimmed
          : current.text
            ? `${current.text} ${trimmed}`.trim()
            : trimmed;
        current.lastAt = now;
        if (isFinal) {
          current.final = true;
        }
      }
      setVoiceTranscript((prev) => {
        const draftEntry = createModeTranscriptMessage(role, current.text, Boolean(current.final), now);
        const tail = prev[prev.length - 1];
        if (
          tail &&
          tail.role === role &&
          normalizeVoiceTranscriptText(tail.text) === normalizeVoiceTranscriptText(draftEntry.text)
        ) {
          return [
            ...prev.slice(0, -1),
            {
              ...tail,
              text: draftEntry.text,
              final: draftEntry.final,
              timestamp: draftEntry.timestamp,
            },
          ];
        }
        if (tail && tail.role === role && tail.final === false && tail.id === current.id) {
          return [...prev.slice(0, -1), draftEntry];
        }
        if (tail && tail.role === role && tail.final === false) {
          return [...prev.slice(0, -1), draftEntry];
        }
        return [...prev, draftEntry];
      });
      if (voiceTranscriptSettleTimerRef.current) {
        clearTimeout(voiceTranscriptSettleTimerRef.current);
      }
      voiceTranscriptSettleTimerRef.current = setTimeout(() => {
        flushPendingVoiceTranscript();
        voiceTranscriptSettleTimerRef.current = null;
      }, VOICE_TRANSCRIPT_SETTLE_MS);
    },
    [flushPendingVoiceTranscript],
  );
  useEffect(() => {
    logger.setEnabled(debug);
    if (debug) {
      logger.info('AIAgent', '🔧 Debug logging enabled');
      logger.info(
        'AIAgent',
        `⚙️ Initial config: interactionMode=${interactionMode || 'copilot(default)'} showVoiceTab=${showVoiceTab} enableVoice=${voiceEnabled} analytics=${!!analyticsKey} provider=${provider}`,
      );
    }
  }, [analyticsKey, debug, interactionMode, provider, showVoiceTab, voiceEnabled]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    const seenCount = seenMessageCountRef.current;
    if (messages.length > seenCount) {
      const newAssistantMessages = messages.slice(seenCount).filter((message) => message.role !== 'user').length;
      if (newAssistantMessages > 0 && !isOpen) {
        setLocalUnread((count) => count + newAssistantMessages);
      }
      seenMessageCountRef.current = messages.length;
    } else if (messages.length < seenCount) {
      seenMessageCountRef.current = messages.length;
      setLocalUnread(0);
    }
  }, [isOpen, messages]);
  useEffect(() => {
    if (isOpen && localUnread > 0) {
      setLocalUnread(0);
    }
  }, [isOpen, localUnread]);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  useEffect(() => {
    selectedTicketIdRef.current = selectedTicketId;
  }, [selectedTicketId]);
  // Route conversation history, telemetry, flags and escalation to the host's
  // OWN backend (the proxyUrl origin) instead of the Twomilia cloud default —
  // so self-hosted / local setups capture their own data. No proxyUrl → cloud.
  useEffect(() => {
    if (!proxyUrl || typeof window === 'undefined') return;
    try {
      setTwomiliaBase(new URL(proxyUrl, window.location.href).origin);
    } catch {
      /* invalid proxyUrl → keep cloud default */
    }
  }, [proxyUrl]);
  useEffect(() => {
    let cancelled = false;
    void initDeviceId()
      .then((id) => {
        if (!cancelled) {
          setDeviceId(id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const availableModes = useMemo(() => {
    const nextModes = ['text'];
    if (showVoiceTab) nextModes.push('voice');
    if (tickets.length > 0) nextModes.push('human');
    return nextModes;
  }, [showVoiceTab, tickets.length]);
  useEffect(() => {
    if (!availableModes.includes(mode)) {
      setMode(availableModes[availableModes.length - 1] || 'text');
    }
  }, [availableModes, mode]);
  useEffect(
    () => () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handleWindowPointerUp);
      }
    },
    [],
  );
  const appendUserMessage = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const userMessage = createAIMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    });
    setMessages((prev) => [...prev, userMessage]);
    return userMessage;
  }, []);
  const resolveApprovalPrompt = useCallback(
    (token, visibleReply) => {
      const pending = pendingPrompt;
      if (!pending || pending.kind !== 'approval') return;
      if (visibleReply) {
        appendUserMessage(visibleReply);
      }
      // Remember a granted approval so it survives an MPA reload+resume.
      if (token === APPROVAL_GRANTED_TOKEN) {
        workflowApprovedRef.current = true;
      }
      setPendingPrompt(null);
      pending.resolve(token);
    },
    [appendUserMessage, pendingPrompt],
  );
  // U2 — request AI consent via the styled in-panel card. Returns a promise that
  // resolves true/false (same contract the old window.confirm path had). If
  // consent was already granted this origin, resolves true immediately. The card
  // is rendered inside the chat popup; its buttons call resolveConsent().
  const requestConsent = useCallback(() => {
    if (!requireConsent || typeof window === 'undefined') return Promise.resolve(true);
    const key = makeStorageKey(provider);
    try {
      if (window.localStorage.getItem(key) === 'granted') return Promise.resolve(true);
    } catch {
      // Ignore storage failures.
    }
    setIsOpen(true);
    setMode('text');
    setShowHistory(false);
    return new Promise((resolve) => {
      setConsentRequest({ resolve, storageKey: key });
    });
  }, [provider, requireConsent]);
  const resolveConsent = useCallback((approved) => {
    setConsentRequest((current) => {
      if (current) {
        if (approved) {
          try {
            window.localStorage.setItem(current.storageKey, 'granted');
          } catch {
            // Ignore storage failures.
          }
        }
        current.resolve(approved);
      }
      return null;
    });
  }, []);
  const handleWindowPointerMove = useCallback((event) => {
    const dragState = dragStateRef.current;
    if (!dragState || typeof window === 'undefined') return;
    if (!dragState.moved) {
      const deltaX = Math.abs(event.clientX - dragState.startX);
      const deltaY = Math.abs(event.clientY - dragState.startY);
      if (deltaX >= 6 || deltaY >= 6) {
        dragState.moved = true;
      }
    }
    const panelWidth = dragState.width;
    const panelHeight = dragState.height;
    setPopupPosition(
      clampFloatingPosition(
        event.clientX - dragState.offsetX,
        event.clientY - dragState.offsetY,
        panelWidth,
        panelHeight,
      ),
    );
  }, []);
  const handleWindowPointerUp = useCallback(() => {
    const dragState = dragStateRef.current;
    if (dragState?.source === 'launcher' && dragState.moved) {
      suppressLauncherClickRef.current = true;
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          suppressLauncherClickRef.current = false;
        }, 0);
      }
    }
    dragStateRef.current = null;
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    }
  }, [handleWindowPointerMove]);
  const startDragFromRect = useCallback(
    (rect, clientX, clientY, source = 'popup') => {
      if (typeof window === 'undefined') return;
      dragStateRef.current = {
        source,
        startX: clientX,
        startY: clientY,
        moved: false,
        offsetX: clientX - rect.left,
        offsetY: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', handleWindowPointerUp);
    },
    [handleWindowPointerMove, handleWindowPointerUp],
  );
  const handlePopupPointerDown = useCallback(
    (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('button,input,textarea,select,a,[role="button"]')
      ) {
        return;
      }
      const popupEl = popupRef.current;
      if (!popupEl || typeof window === 'undefined') return;
      const rect = popupEl.getBoundingClientRect();
      startDragFromRect(rect, event.clientX, event.clientY, 'popup');
    },
    [startDragFromRect],
  );
  const handleLauncherPointerDown = useCallback(
    (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (!event.currentTarget || typeof event.currentTarget.getBoundingClientRect !== 'function') return;
      const rect = event.currentTarget.getBoundingClientRect();
      startDragFromRect(rect, event.clientX, event.clientY, 'launcher');
    },
    [startDragFromRect],
  );
  const openFromLauncher = useCallback(
    (event) => {
      if (suppressLauncherClickRef.current) {
        event?.preventDefault();
        event?.stopPropagation();
        return;
      }
      if (
        popupPosition &&
        event?.currentTarget &&
        typeof event.currentTarget.getBoundingClientRect === 'function' &&
        typeof window !== 'undefined'
      ) {
        const rect = event.currentTarget.getBoundingClientRect();
        const popupSize = getEstimatedPopupSize();
        setPopupPosition(
          clampFloatingPosition(
            rect.right - popupSize.width,
            rect.bottom - popupSize.height,
            popupSize.width,
            popupSize.height,
          ),
        );
      }
      setLocalUnread(0);
      // U3 — open straight into the QuickActions self-service panel when enabled
      // and the user has no in-progress chat thread. Gated entirely behind the
      // config flag so nothing changes when it's absent.
      if (quickActionsEnabled && messagesRef.current.length === 0) {
        setMode('text');
        setShowHistory(false);
        setShowQuickActions(true);
      }
      setIsOpen(true);
    },
    [popupPosition, quickActionsEnabled],
  );
  const minimizePopup = useCallback(() => {
    if (popupPosition && popupRef.current && typeof window !== 'undefined') {
      const rect = popupRef.current.getBoundingClientRect();
      setPopupPosition(
        clampFloatingPosition(
          rect.right - WEB_LAUNCHER_SIZE,
          rect.bottom - WEB_LAUNCHER_SIZE,
          WEB_LAUNCHER_SIZE,
          WEB_LAUNCHER_SIZE,
        ),
      );
    }
    setIsOpen(false);
  }, [popupPosition]);
  useEffect(() => {
    persistChatState(persistenceKey, {
      conversationId,
      isOpen,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        previewText: message.previewText,
        timestamp: message.timestamp,
        promptKind: message.promptKind,
      })),
    });
  }, [conversationId, isOpen, messages, persistenceKey]);
  useEffect(() => {
    const activeConversationId = conversationId || localConversationKey;
    if (!messages.length || !activeConversationId) return;
    setConversationHistory((prev) => {
      const nextEntry = buildConversationSummary(activeConversationId, messages);
      const next = [nextEntry, ...prev.filter((entry) => entry.id !== activeConversationId)]
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 20);
      persistConversationHistory(persistenceKey, next);
      return next;
    });
  }, [conversationId, localConversationKey, messages, persistenceKey]);
  const lastMessageText = messages.length > 0 ? messages[messages.length - 1].text : '';
  useEffect(() => {
    const target =
      mode === 'text'
        ? messagesScrollRef.current
        : mode === 'human'
          ? supportScrollRef.current
          : voiceScrollRef.current;
    if (!isOpen || !target) return;
    const timer = setTimeout(() => {
      target.scrollTop = target.scrollHeight;
    }, 30);
    return () => clearTimeout(timer);
  }, [
    isLoading,
    isOpen,
    isAgentTyping,
    mode,
    messages.length,
    lastMessageText,
    pendingPrompt,
    supportMessages.length,
    voiceTranscript.length,
  ]);
  useEffect(() => {
    if (!isOpen || !popupPosition || !popupRef.current || typeof window === 'undefined') return;
    const rect = popupRef.current.getBoundingClientRect();
    const { left: nextLeft, top: nextTop } = clampFloatingPosition(rect.left, rect.top, rect.width, rect.height);
    if (Math.abs(nextLeft - rect.left) > 1 || Math.abs(nextTop - rect.top) > 1) {
      setPopupPosition({
        left: nextLeft,
        top: nextTop,
      });
    }
  }, [isOpen, popupPosition, mode, showHistory]);
  const platformAdapter = useMemo(
    () =>
      new WebPlatformAdapter({
        getRoot: () => scanRoot || appRootRef.current,
        router: routerAdapter,
        pathname,
        captureScreenshot,
        ignoreSelectors,
        confirmSelectors,
        onGuide: (payload) => {
          if (guideTimerRef.current) {
            clearTimeout(guideTimerRef.current);
            guideTimerRef.current = null;
          }
          if (!payload) {
            setGuide(null);
            return;
          }
          setGuide({
            rect: payload.targetRect,
            node: payload.targetNode || null,
            message: payload.message,
            action: payload.action || null,
          });
          // A per-action highlight means the agent is acting on the page — collapse the
          // panel (sticky) so the user can watch. It stays collapsed through the whole
          // action phase; a landed message / run end restores it (handled elsewhere).
          if (payload.action) {
            setActingOnPage(true);
            setMinimized(true);
            if (actingClearTimerRef.current) clearTimeout(actingClearTimerRef.current);
            actingClearTimerRef.current = setTimeout(() => setActingOnPage(false), 1500);
          }
          if (payload.autoRemoveAfterMs && payload.autoRemoveAfterMs > 0) {
            guideTimerRef.current = setTimeout(() => {
              setGuide(null);
            }, payload.autoRemoveAfterMs);
          }
        },
      }),
    [captureScreenshot, confirmSelectors, ignoreSelectors, pathname, routerAdapter, scanRoot],
  );
  // Keep the highlight glued to its target while it is visible. The rect is captured
  // once when the guide is shown; without this, scrolling (page or any nested scroll
  // container) or a resize leaves the fixed-position border behind at stale viewport
  // coords. We re-read the live node's rect on scroll/resize, coalesced via rAF.
  const guideNode = guide?.node || null;
  useEffect(() => {
    if (!guideNode) return undefined;
    const view = guideNode.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!view) return undefined;
    let rafId = 0;
    const sync = () => {
      rafId = 0;
      const next = platformAdapter.getViewportRect(guideNode);
      if (!next) return; // node detached / no layout — keep last known rect
      setGuide((prev) => {
        if (!prev || prev.node !== guideNode) return prev;
        const r = prev.rect;
        if (
          r &&
          Math.abs(r.left - next.left) < 0.5 &&
          Math.abs(r.top - next.top) < 0.5 &&
          Math.abs(r.width - next.width) < 0.5 &&
          Math.abs(r.height - next.height) < 0.5
        ) {
          return prev;
        }
        return { ...prev, rect: next };
      });
    };
    const schedule = () => {
      if (rafId) return;
      rafId = view.requestAnimationFrame ? view.requestAnimationFrame(sync) : setTimeout(sync, 16);
    };
    // capture:true so scrolls inside any nested scroll container reach us (scroll does not bubble).
    view.addEventListener('scroll', schedule, true);
    view.addEventListener('resize', schedule);
    schedule(); // reconcile once in case the captured rect was already stale
    return () => {
      view.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      if (rafId) {
        if (view.cancelAnimationFrame) view.cancelAnimationFrame(rafId);
        else clearTimeout(rafId);
      }
    };
  }, [guideNode, platformAdapter]);
  const appendIncomingSupportReply = useCallback((ticketId, reply) => {
    const timestamp = Date.now();
    const assistantMessage = toSupportMessage(ticketId, 'assistant', reply, timestamp);
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId
          ? {
              ...ticket,
              history: [
                ...(ticket.history || []),
                {
                  role: 'live_agent',
                  content: reply,
                  timestamp: new Date(timestamp).toISOString(),
                },
              ],
            }
          : ticket,
      ),
    );
    if (selectedTicketIdRef.current === ticketId) {
      setSupportMessages((prev) => [...prev, assistantMessage]);
      setUnreadCounts((prev) => {
        if (!prev[ticketId]) return prev;
        const next = {
          ...prev,
        };
        delete next[ticketId];
        return next;
      });
    } else {
      setUnreadCounts((prev) => ({
        ...prev,
        [ticketId]: (prev[ticketId] || 0) + 1,
      }));
    }
  }, []);
  const handleTicketSelect = useCallback(
    async (ticketId) => {
      const ticket = tickets.find((entry) => entry.id === ticketId);
      if (!ticket) return;
      setSelectedTicketId(ticketId);
      setMode('human');
      setSupportInput('');
      setUnreadCounts((prev) => {
        if (!prev[ticketId]) return prev;
        const next = {
          ...prev,
        };
        delete next[ticketId];
        return next;
      });
      if (analyticsKey) {
        void fetch(
          `${ENDPOINTS.escalation}/api/v1/escalations/${ticketId}/read?analyticsKey=${encodeURIComponent(analyticsKey)}`,
          {
            method: 'POST',
          },
        ).catch(() => {});
      }
      let nextHistory = ticket.history || [];
      let nextWsUrl = ticket.wsUrl;
      if (analyticsKey) {
        try {
          const response = await fetch(
            `${ENDPOINTS.escalation}/api/v1/escalations/${ticketId}?analyticsKey=${encodeURIComponent(analyticsKey)}`,
          );
          if (response.ok) {
            const data = await response.json();
            nextHistory = Array.isArray(data.history) ? data.history : nextHistory;
            nextWsUrl = data.wsUrl || nextWsUrl;
            setTickets((prev) =>
              prev.map((entry) =>
                entry.id === ticketId
                  ? {
                      ...entry,
                      history: nextHistory,
                      wsUrl: nextWsUrl,
                      status: data.status || entry.status,
                    }
                  : entry,
              ),
            );
          }
        } catch {
          // Ignore fetch failures and fall back to local state.
        }
      }
      setSupportMessages(historyToSupportMessages(ticketId, nextHistory));
      const cachedSocket = pendingSocketsRef.current.get(ticketId);
      if (cachedSocket && !cachedSocket.hasErrored) {
        pendingSocketsRef.current.delete(ticketId);
        if (!cachedSocket.isConnected && nextWsUrl) {
          cachedSocket.connect(nextWsUrl);
        }
        supportSocketRef.current = cachedSocket;
        return;
      }
      if (cachedSocket) {
        cachedSocket.disconnect();
        pendingSocketsRef.current.delete(ticketId);
      }
      if (!nextWsUrl) return;
      const socket = new EscalationSocket({
        onReply: (reply) => appendIncomingSupportReply(ticketId, reply),
        onTypingChange: setIsAgentTyping,
        onTicketClosed: (closedTicketId) => {
          const resolvedTicketId = closedTicketId || ticketId;
          setTickets((prev) =>
            prev.map((entry) =>
              entry.id === resolvedTicketId
                ? {
                    ...entry,
                    status: 'closed',
                  }
                : entry,
            ),
          );
          setUnreadCounts((prev) => {
            const next = {
              ...prev,
            };
            delete next[resolvedTicketId];
            return next;
          });
        },
        onError: () => {},
      });
      socket.connect(nextWsUrl);
      supportSocketRef.current = socket;
    },
    [analyticsKey, appendIncomingSupportReply, tickets],
  );
  const handleBackToTickets = useCallback(() => {
    if (supportSocketRef.current && selectedTicketIdRef.current) {
      pendingSocketsRef.current.set(selectedTicketIdRef.current, supportSocketRef.current);
    }
    supportSocketRef.current = null;
    setSelectedTicketId(null);
    setSupportMessages([]);
    setIsAgentTyping(false);
  }, []);
  useEffect(() => {
    if (!analyticsKey || remoteConversationHydratedRef.current) return;
    if (messagesRef.current.length > 0) {
      remoteConversationHydratedRef.current = true;
      return;
    }
    if (!userContext?.userId && !deviceId) return;
    let cancelled = false;
    void (async () => {
      const conversations = await fetchConversations({
        analyticsKey,
        userId: userContext?.userId,
        deviceId,
        limit: 1,
      });
      if (cancelled || conversations.length === 0) {
        remoteConversationHydratedRef.current = true;
        return;
      }
      const latestConversation = conversations[0];
      const history = await fetchConversation({
        analyticsKey,
        conversationId: latestConversation.id,
      });
      if (cancelled) return;
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history);
        setConversationId(latestConversation.id);
        syncedMessageCountRef.current = history.length;
      }
      remoteConversationHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [analyticsKey, deviceId, userContext?.userId]);
  useEffect(() => {
    if (!analyticsKey || (!userContext?.userId && !deviceId)) return;
    const eligibleMessages = messages.filter((message) => message.role === 'user' || message.role === 'assistant');
    if (eligibleMessages.length === 0) return;
    if (!eligibleMessages.some((message) => message.role === 'assistant')) return;
    let cancelled = false;
    void (async () => {
      if (!conversationIdRef.current) {
        const startedConversationId = await startConversation({
          analyticsKey,
          userId: userContext?.userId,
          deviceId: deviceId || undefined,
          messages: eligibleMessages,
        });
        if (cancelled || !startedConversationId) return;
        setConversationId(startedConversationId);
        syncedMessageCountRef.current = eligibleMessages.length;
        return;
      }
      if (eligibleMessages.length <= syncedMessageCountRef.current) return;
      const unsyncedMessages = eligibleMessages.slice(syncedMessageCountRef.current);
      await appendMessages({
        analyticsKey,
        conversationId: conversationIdRef.current,
        messages: unsyncedMessages,
      });
      if (!cancelled) {
        syncedMessageCountRef.current = eligibleMessages.length;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyticsKey, conversationId, deviceId, messages, userContext?.userId]);
  useEffect(() => {
    if (!analyticsKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const query = new URLSearchParams({
          analyticsKey,
        });
        if (userContext?.userId) query.append('userId', userContext.userId);
        if (pushToken) query.append('pushToken', pushToken);
        const response = await fetch(`${ENDPOINTS.escalation}/api/v1/escalations/mine?${query.toString()}`);
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const restoredTickets = Array.isArray(data.tickets) ? data.tickets : [];
        if (restoredTickets.length === 0) return;
        setTickets(restoredTickets);
        setMode('human');
        setLocalUnread(0);
        setIsOpen(true);
        setUnreadCounts(
          restoredTickets.reduce((acc, ticket) => {
            if ((ticket.unreadCount || 0) > 0) {
              acc[ticket.id] = ticket.unreadCount;
            }
            return acc;
          }, {}),
        );
      } catch {
        // Ignore restore failures.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyticsKey, pushToken, userContext?.userId]);
  useEffect(() => {
    if (!csatEnabled || !selectedTicket) return;
    if (!CLOSED_TICKET_STATUSES.has(selectedTicket.status)) return;
    const surveyKey = `ticket:${selectedTicket.id}`;
    if (shownCsatKeysRef.current.has(surveyKey)) return;
    shownCsatKeysRef.current.add(surveyKey);
    setCsatPrompt({
      key: surveyKey,
      metadata: {
        conversationDuration: Math.max(
          1,
          Math.round((Date.now() - new Date(selectedTicket.createdAt).getTime()) / 1000),
        ),
        stepsCount: supportMessages.length,
        wasEscalated: true,
        screen: selectedTicket.screen || pathname || '/',
        ticketId: selectedTicket.id,
      },
    });
  }, [csatEnabled, pathname, selectedTicket, supportMessages.length]);
  useEffect(() => {
    if (!csatEnabled || !lastResult?.success || mode !== 'text') return;
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!latestAssistantMessage) return;
    const surveyKey = `chat:${latestAssistantMessage.id}`;
    if (shownCsatKeysRef.current.has(surveyKey)) return;
    shownCsatKeysRef.current.add(surveyKey);
    setCsatPrompt({
      key: surveyKey,
      metadata: {
        conversationDuration: 0,
        stepsCount: messages.length,
        wasEscalated: false,
        screen: pathname || '/',
      },
    });
  }, [csatEnabled, lastResult, messages, mode, pathname]);
  const autoEscalateTool = useMemo(() => {
    if (customTools?.['escalate_to_human']) return null;
    const escalationConfig = supportMode?.escalation
      ? {
          ...supportMode.escalation,
        }
      : analyticsKey
        ? {
            provider: 'mobileai',
          }
        : null;
    if (!escalationConfig) return null;
    if (escalationConfig.provider === 'mobileai' && !analyticsKey) return null;
    if (escalationConfig.provider === 'custom' && typeof escalationConfig.onEscalate !== 'function') return null;
    return createEscalateTool({
      config: escalationConfig,
      analyticsKey,
      getContext: () => ({
        currentScreen: pathname || routerAdapter?.getCurrentScreenName?.() || '/',
        originalQuery: '',
        stepsBeforeEscalation: 0,
      }),
      getHistory: () => toUserHistory(messagesRef.current),
      userContext,
      pushToken,
      pushTokenType,
      onEscalationStarted: (ticketId, socket) => {
        pendingSocketsRef.current.set(ticketId, socket);
        setTickets((prev) => {
          if (prev.some((ticket) => ticket.id === ticketId)) return prev;
          return [
            {
              id: ticketId,
              reason: 'Connecting to a human agent...',
              screen: pathname || '/',
              status: 'open',
              history: [],
              createdAt: new Date().toISOString(),
              wsUrl: '',
              unreadCount: 0,
            },
            ...prev,
          ];
        });
        setMode('human');
        setIsOpen(true);
      },
      onHumanReply: (reply, ticketId) => {
        if (ticketId) {
          appendIncomingSupportReply(ticketId, reply);
          setMode('human');
          setIsOpen(true);
        }
      },
      onTypingChange: setIsAgentTyping,
      onTicketClosed: (ticketId) => {
        if (!ticketId) return;
        setTickets((prev) =>
          prev.map((ticket) =>
            ticket.id === ticketId
              ? {
                  ...ticket,
                  status: 'closed',
                }
              : ticket,
          ),
        );
      },
    });
  }, [
    analyticsKey,
    appendIncomingSupportReply,
    customTools,
    pathname,
    pushToken,
    pushTokenType,
    routerAdapter,
    supportMode?.escalation,
    userContext,
  ]);
  const mergedCustomTools = useMemo(() => {
    const merged = {
      ...(customTools || {}),
    };
    if (autoEscalateTool) {
      merged[autoEscalateTool.name] = autoEscalateTool;
    }
    return merged;
  }, [autoEscalateTool, customTools]);
  // Derive the proxy Authorization from analyticsKey when the host didn't pass
  // an explicit one — so a single `analyticsKey` covers text-proxy auth, voice,
  // and telemetry (no need to repeat the key in proxyHeaders).
  const resolvedProxyHeaders = useMemo(
    () => withAuthorization(proxyHeaders, analyticsKey),
    [proxyHeaders, analyticsKey],
  );
  const serverConfig = useMemo(() => ({
    interactionMode,
    maxSteps,
    enableScreenshots: !!captureScreenshot,
    enableKnowledge: !!knowledgeBase,
    enableWebSearch,
    customTools: mergedCustomTools,
    screenMap,
    supportStyle: resolvedSupportStyle,
    language: getBrowserLanguage?.() || undefined,
  }), [interactionMode, maxSteps, captureScreenshot, knowledgeBase, enableWebSearch, mergedCustomTools, screenMap, resolvedSupportStyle]);
  const serverClient = useMemo(
    () =>
      new ServerAgentClient(proxyUrl, analyticsKey, platformAdapter, {
        onStatusUpdate: setStatusText,
        onActingOnPage: (acting) => {
          setActingOnPage(acting);
          if (acting) setMinimized(true);
        },
        onTokenUsage,
        onAskUser: (request) =>
          new Promise((resolve) => {
            const normalized =
              typeof request === 'string'
                ? { question: request, kind: 'freeform' }
                : request;
            const question = normalized.question;
            const kind = normalized.kind || 'freeform';
            const promptMessage = createAIMessage({
              id: `assistant-ask-${Date.now()}`,
              role: 'assistant',
              content: question,
              previewText: question,
              timestamp: Date.now(),
              promptKind: kind === 'approval' ? 'approval' : undefined,
            });
            setMessages((prev) => [...prev, promptMessage]);
            setPendingPrompt({ question, kind, resolve });
            setMode('text');
            setLocalUnread(0);
            setIsOpen(true);
          }),
      }),
    [analyticsKey, onTokenUsage, platformAdapter, proxyUrl],
  );
  const serverClientRef = useRef(serverClient);
  useEffect(() => {
    serverClientRef.current = serverClient;
  }, [serverClient]);

  // Restore the panel once a run finishes (clears minimize-on-execute state).
  useEffect(() => {
    if (isLoading) return;
    setActingOnPage(false);
    setMinimized(false);
    setForceExpandDuringRun(false);
    pendingMaximizeRef.current = false;
    if (actingClearTimerRef.current) {
      clearTimeout(actingClearTimerRef.current);
      actingClearTimerRef.current = null;
    }
  }, [isLoading]);

  // Maximize when a NEW assistant message lands — but not while the agent is
  // mid-action (then the message rides in the collapsed pill; we restore as soon
  // as the action finishes). Mirrors the RN behavior of surfacing replies.
  useEffect(() => {
    let latest = null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'assistant') {
        latest = messages[i];
        break;
      }
    }
    if (!latest || lastAssistantMsgIdRef.current === latest.id) return;
    lastAssistantMsgIdRef.current = latest.id;
    if (actingOnPage) {
      pendingMaximizeRef.current = true;
    } else {
      setMinimized(false);
    }
  }, [messages, actingOnPage]);

  // Deferred restore: once the agent stops acting, honor any message that landed
  // during the action phase.
  useEffect(() => {
    if (!actingOnPage && pendingMaximizeRef.current) {
      pendingMaximizeRef.current = false;
      setMinimized(false);
    }
  }, [actingOnPage]);

  // Hide any proactive nudge while the panel is open.
  useEffect(() => {
    if (isOpen) setProactiveStage('hidden');
  }, [isOpen]);

  // Proactive help: after a stretch of inactivity, nudge the user with a friendly
  // bubble near the launcher (web port of the RN IdleDetector + ProactiveHint).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (proactiveHelp?.enabled === false || proactiveDismissedRef.current) return undefined;
    const detector = idleDetectorRef.current || (idleDetectorRef.current = new IdleDetector());
    const defaultText = proactiveHelp?.badgeText || 'Need help with this screen?';
    detector.start({
      pulseAfterMs: (proactiveHelp?.pulseAfterMinutes ?? 0.5) * 60000,
      badgeAfterMs: (proactiveHelp?.badgeAfterMinutes ?? 1) * 60000,
      onPulse: () => setProactiveStage((prev) => (prev === 'badge' ? prev : 'pulse')),
      onBadge: (suggestion) => {
        setProactiveText(suggestion || defaultText);
        setProactiveStage('badge');
      },
      onReset: () => setProactiveStage('hidden'),
      generateSuggestion: () => defaultText,
      behaviorTriggers: proactiveHelp?.behaviorTriggers,
    });
    const onActivity = () => {
      if (!proactiveDismissedRef.current) detector.reset();
    };
    window.addEventListener('pointerdown', onActivity, {
      passive: true,
    });
    window.addEventListener('keydown', onActivity, {
      passive: true,
    });
    window.addEventListener('scroll', onActivity, {
      passive: true,
    });
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('scroll', onActivity);
      detector.destroy();
    };
  }, [proactiveHelp]);
  const dismissProactive = useCallback(() => {
    proactiveDismissedRef.current = true;
    setProactiveStage('hidden');
    idleDetectorRef.current?.dismiss();
  }, []);
  const dismissDiscoveryTooltip = useCallback(() => {
    setDiscoveryVisible(false);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(DISCOVERY_TOOLTIP_SESSION_KEY, '1');
      } catch {
        // Ignore storage failures.
      }
    }
  }, []);
  // U4 — show the discovery tooltip once per session, only while the panel is
  // closed. Auto-dismiss after ~6s (mirrors RN DiscoveryTooltip AUTO_DISMISS_MS).
  useEffect(() => {
    if (!showDiscoveryTooltip || isOpen || typeof window === 'undefined') return undefined;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(DISCOVERY_TOOLTIP_SESSION_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return undefined;
    setDiscoveryVisible(true);
    const timer = window.setTimeout(() => {
      dismissDiscoveryTooltip();
    }, DISCOVERY_TOOLTIP_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
    // Only run when the tooltip prop or open state changes.
  }, [showDiscoveryTooltip, isOpen, dismissDiscoveryTooltip]);
  // Hide the tooltip as soon as the panel opens.
  useEffect(() => {
    if (isOpen && discoveryVisible) {
      dismissDiscoveryTooltip();
    }
  }, [isOpen, discoveryVisible, dismissDiscoveryTooltip]);
  const send = useCallback(
    async (message, options) => {
      // Extract images — options can be an images array (from chat bar) or object
      const userImages = Array.isArray(options) ? options : options?.images || undefined;
      const hasImages = userImages && userImages.length > 0;
      const trimmed = message.trim();

      // When images are present and agent is loading: cancel current execution, start fresh
      if (hasImages && isLoading) {
        logger.info('AIAgent', 'User sent images while loading — cancelling current execution');
        serverClientRef.current?.abort();
        setIsLoading(false);
        setStatusText('');
      } else if (!trimmed && !hasImages) {
        return;
      } else if (isLoading && !hasImages) {
        return;
      }
      const consentGranted = await requestConsent();
      if (!consentGranted) {
        const denied = {
          success: false,
          message: 'AI request was cancelled because consent was declined.',
          steps: [],
        };
        setLastResult(denied);
        options?.onResult?.(denied);
        return;
      }

      // Build user content nodes with images if present
      const displayText = trimmed || (hasImages ? `[${userImages.length} image(s)]` : '');
      const userContentNodes = [];
      if (trimmed) {
        userContentNodes.push({
          type: 'text',
          content: trimmed,
        });
      }
      if (hasImages) {
        for (const img of userImages) {
          userContentNodes.push({
            type: 'image',
            uri: `data:${img.mimeType};base64,${img.base64}`,
          });
        }
      }
      const userMessage = appendUserMessage(displayText);
      if (!userMessage) return;
      // Replace content with rich nodes if images present
      if (hasImages && userMessage) {
        userMessage.content = userContentNodes;
      }
      setInput('');
      requestStartedAtRef.current = Date.now();
      setIsLoading(true);
      isLoadingRef.current = true;
      activeGoalRef.current = trimmed || displayText;
      // A fresh user goal supersedes any pending resume from a prior navigation,
      // and re-gates approvals (the prior task's "Allow" must not carry over).
      clearResumeTask(persistenceKey);
      workflowApprovedRef.current = false;
      setStatusText('Thinking...');
      setLocalUnread(0);
      setIsOpen(true);
      logger.info(
        'AIAgent',
        `📨 Sending message in ${mode} mode: "${displayText}"${hasImages ? ` with ${userImages.length} image(s)` : ''}`,
      );
      const history = messagesRef.current.concat(userMessage);
      try {
        const rawResult = await serverClientRef.current.execute(trimmed || displayText, toUserHistory(history), userImages, serverConfig);
        const result = normalizeExecutionResult(rawResult);
        const assistantMessage = createAIMessage({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.reply || result.message,
          timestamp: Date.now(),
          result,
          previewText: result.previewText,
        });
        setMessages((prev) => [...prev, assistantMessage]);
        setLastResult(result);
        options?.onResult?.(result);
      } catch (err) {
        // A newer request superseded this one (or the socket failed). Unwind quietly —
        // the superseding request renders its own reply; don't surface a broken bubble.
        logger.warn('AIAgent', `Send did not complete: ${err?.message || err}`);
      } finally {
        requestStartedAtRef.current = 0;
        setIsLoading(false);
        isLoadingRef.current = false;
        activeGoalRef.current = null;
        // The run completed in-page (no reload happened), so no resume is needed.
        clearResumeTask(persistenceKey);
        setStatusText('');
      }
    },
    [appendUserMessage, isLoading, mode, persistenceKey, requestConsent, serverClient, serverConfig],
  );
  // Re-run the active goal on a freshly-loaded page (after an MPA navigation),
  // continuing the task with the restored conversation as context. No new user
  // message is appended — the original goal already lives in the restored history.
  const resumeTask = useCallback(
    async (goal, options) => {
      if (!goal || isLoadingRef.current) return;
      setIsOpen(true);
      setIsLoading(true);
      isLoadingRef.current = true;
      activeGoalRef.current = goal;
      // Restore the carried approval so this resumed run doesn't re-ask, and so it
      // carries again if this run also reloads.
      workflowApprovedRef.current = options?.workflowApproved === true;
      setStatusText('Resuming…');
      try {
        // Frame the resume as a CONTINUATION so the agent re-checks state and
        // doesn't redo finished steps (the navigation may have completed part of
        // the task already). If it's already done, confirm instead of repeating.
        const resumeGoal =
          `[Resuming after a page navigation] Original request: "${goal}". ` +
          `The page just reloaded, so part of this task may already be complete. ` +
          `First inspect the CURRENT page and the conversation above to see what is already done, ` +
          `then perform ONLY the remaining steps. If the request is already fully satisfied, ` +
          `briefly confirm that to the user and stop — do not repeat actions that are already done.`;
        const rawResult = await serverClientRef.current.execute(
          resumeGoal,
          toUserHistory(messagesRef.current),
          undefined,
          { ...serverConfig, workflowApproved: workflowApprovedRef.current },
        );
        const result = normalizeExecutionResult(rawResult);
        const assistantMessage = createAIMessage({
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.reply || result.message,
          timestamp: Date.now(),
          result,
          previewText: result.previewText,
        });
        setMessages((prev) => [...prev, assistantMessage]);
        setLastResult(result);
      } catch (error) {
        logger.warn('AIAgent', `Resume failed: ${error?.message || error}`);
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
        activeGoalRef.current = null;
        clearResumeTask(persistenceKey);
        setStatusText('');
      }
    },
    [persistenceKey, serverClient, serverConfig],
  );
  // Before a full reload during an active run (the agent navigated on an MPA),
  // stash the goal so the next page can resume it. Capped to avoid nav loops.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onBeforeUnload = () => {
      if (!isLoadingRef.current || !activeGoalRef.current) return;
      const prev = loadResumeTask(persistenceKey);
      const count = prev ? prev.count : 0;
      if (count >= RESUME_CAP) return;
      saveResumeTask(persistenceKey, {
        goal: activeGoalRef.current,
        count: count + 1,
        ts: Date.now(),
        // Carry a granted approval across the reload so the resumed run doesn't
        // re-ask for the same action the user already allowed.
        workflowApproved: workflowApprovedRef.current === true,
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persistenceKey]);
  // On a fresh page load, resume a stashed task once (if fresh + under the cap).
  useEffect(() => {
    if (didResumeRef.current) return undefined;
    const record = loadResumeTask(persistenceKey);
    if (!record || !record.goal) return undefined;
    if (Date.now() - record.ts > RESUME_TTL_MS || record.count > RESUME_CAP) {
      clearResumeTask(persistenceKey);
      return undefined;
    }
    didResumeRef.current = true;
    const timer = setTimeout(() => {
      void resumeTask(record.goal, { workflowApproved: record.workflowApproved });
    }, 900);
    return () => clearTimeout(timer);
  }, [persistenceKey, resumeTask]);
  const sendSupportMessage = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed || !selectedTicketIdRef.current || !supportSocketRef.current) return;
    const activeTicketId = selectedTicketIdRef.current;
    const message = toSupportMessage(activeTicketId, 'user', trimmed, Date.now());
    supportSocketRef.current.sendText(trimmed);
    setSupportMessages((prev) => [...prev, message]);
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === activeTicketId
          ? {
              ...ticket,
              history: [
                ...(ticket.history || []),
                {
                  role: 'user',
                  content: trimmed,
                  timestamp: new Date(message.timestamp).toISOString(),
                },
              ],
            }
          : ticket,
      ),
    );
    setSupportInput('');
  }, []);
  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastResult(null);
    setConversationId(null);
    setLocalConversationKey(`local-${Date.now()}`);
    setShowHistory(false);
    syncedMessageCountRef.current = 0;
    remoteConversationHydratedRef.current = true;
  }, []);
  // U3 — handoff from the QuickActions panel into normal chat. Mirrors RN: if the
  // user came from a topic/article, prefill+send a contextual message; otherwise
  // just drop them into the empty chat composer.
  const handleQuickActionsChatWithAI = useCallback(
    (context) => {
      setShowQuickActions(false);
      setMode('text');
      setShowHistory(false);
      const topic = context?.topicId
        ? (quickActionsConfig?.topics || []).find((t) => t.id === context.topicId)
        : null;
      if (topic) {
        const prefill = `I was browsing help topic "${topic.label}"${
          context?.articleQuestion ? ` — specifically "${context.articleQuestion}"` : ''
        }. I need more help.`;
        void send(prefill);
      }
    },
    [quickActionsConfig?.topics, send],
  );
  const deleteConversationHistoryEntry = useCallback(
    (conversation) => {
      if (!conversation?.id) return;
      const id = String(conversation.id);
      setConversationHistory((prev) => {
        const next = prev.filter((entry) => String(entry.id) !== id);
        persistConversationHistory(persistenceKey, next);
        return next;
      });
      const isActiveConversation = conversationId === id || localConversationKey === id;
      if (isActiveConversation) {
        clearMessages();
      }
    },
    [clearMessages, conversationId, localConversationKey, persistenceKey],
  );
  const cancel = useCallback(
    (options) => {
      if (options?.source === 'composer') {
        const elapsed = Date.now() - requestStartedAtRef.current;
        if (requestStartedAtRef.current && elapsed < COMPOSER_CANCEL_ARM_MS) {
          logger.warn('AIAgent', `Ignoring early composer cancel ${elapsed}ms after send`);
          return;
        }
      }
      serverClientRef.current?.abort();
      setStatusText('Stopping...');
      // If the run is parked on an ask-user prompt, the server client is awaiting
      // its resolve — abort() alone won't unblock it, so resolve it with the cancel
      // token so execute() can unwind. (Otherwise Stop sticks forever.)
      if (pendingPrompt) {
        const pending = pendingPrompt;
        setPendingPrompt(null);
        setInput('');
        try {
          pending.resolve?.(ASK_USER_CANCELLED_TOKEN);
        } catch {
          // resolve may already be settled — ignore.
        }
      }
      // Force UI out of loading state shortly after abort.
      if (typeof window !== 'undefined') {
        window.setTimeout(() => {
          setIsLoading(false);
          setStatusText('');
        }, 500);
      }
    },
    [serverClient, pendingPrompt],
  );
  const enterVoiceMode = useCallback(async () => {
    setShowHistory(false);
    setIsOpen(true);
    setVoicePermissionIssue(null);
    if (pendingVoiceStreamRef.current) {
      pendingVoiceStreamRef.current.getTracks?.().forEach((track) => track.stop());
      pendingVoiceStreamRef.current = null;
    }
    setStatusText('Requesting microphone access...');
    logger.info('AIAgent', '🎙️ Voice tab clicked — requesting microphone access from direct user gesture');
    const permission = await requestBrowserMicrophoneAccess();
    if (!permission.granted) {
      logger.warn(
        'AIAgent',
        `🎙️ Browser microphone permission denied/unavailable: ${permission.issue?.message || 'Unknown microphone error'}`,
      );
      setStatusText(permission.issue?.message || 'Microphone access failed.');
      setVoicePermissionIssue(permission.issue);
      setMode('voice');
      return;
    }
    pendingVoiceStreamRef.current = permission.stream;
    logger.info(
      'AIAgent',
      `🎙️ Microphone stream primed from user gesture (tracks=${permission.stream?.getTracks?.().length || 0})`,
    );
    setStatusText('Connecting voice...');
    setMode('voice');
  }, []);
  const cancelPendingFreeformPrompt = useCallback(() => {
    if (pendingPrompt?.kind !== 'freeform') return;
    const pending = pendingPrompt;
    setInput('');
    setPendingPrompt(null);
    pending.resolve(ASK_USER_CANCELLED_TOKEN);
  }, [pendingPrompt]);
  const stopVoiceSession = useCallback(() => {
    if (voiceTranscriptSettleTimerRef.current) {
      clearTimeout(voiceTranscriptSettleTimerRef.current);
      voiceTranscriptSettleTimerRef.current = null;
    }
    flushPendingVoiceTranscript();
    voiceTranscriptDraftRef.current = {
      role: null,
      text: '',
      final: false,
      id: null,
      lastAt: 0,
    };
    setIsMicActive(false);
    setIsVoiceConnected(false);
    setIsAISpeaking(false);
    setStatusText('');
    setVoicePermissionIssue(null);
    if (pendingVoiceStreamRef.current) {
      pendingVoiceStreamRef.current.getTracks?.().forEach((track) => track.stop());
      pendingVoiceStreamRef.current = null;
    }
    void micControllerRef.current?.destroy?.();
    void audioPlayerRef.current?.stop?.();
    voiceServiceRef.current?.disconnect?.();
    toolLockRef.current = false;
    userHasSpokenRef.current = false;
    if (screenPollIntervalRef.current) {
      clearInterval(screenPollIntervalRef.current);
      screenPollIntervalRef.current = null;
    }
  }, [flushPendingVoiceTranscript]);
  const resolvedVoiceProxyUrl = useMemo(() => {
    if (voiceProxyUrl) return voiceProxyUrl;
    if (analyticsKey) return ENDPOINTS.hostedVoiceProxy;
    return proxyUrl;
  }, [analyticsKey, proxyUrl, voiceProxyUrl]);
  const resolvedVoiceProxyHeaders = useMemo(
    () => withAuthorization(voiceProxyHeaders || proxyHeaders, analyticsKey),
    [analyticsKey, proxyHeaders, voiceProxyHeaders],
  );
  const resolvedVoiceModel = useMemo(() => {
    if (provider === 'gemini') {
      if (typeof model === 'string' && model.includes('native-audio')) {
        return model;
      }
      return DEFAULT_WEB_VOICE_MODEL;
    }
    return model;
  }, [model, provider]);
  useEffect(() => {
    if (!voiceEnabled || mode !== 'voice' || !isOpen) return undefined;
    if (!resolvedVoiceProxyUrl && !apiKey) {
      logger.warn('AIAgent', '🎙️ Voice mode enabled but no voice transport config found (proxy or API key)');
      setStatusText('Voice is unavailable without a configured voice proxy or API key.');
      setIsVoiceConnected(false);
      return undefined;
    }
    logger.info(
      'AIAgent',
      `🎙️ Starting voice effect: mode=${mode} open=${isOpen} voiceEnabled=${voiceEnabled} proxy=${resolvedVoiceProxyUrl}`,
    );
    let didConnect = false;
    const connectionTimeout = setTimeout(() => {
      if (didConnect) return;
      logger.warn('AIAgent', `🎙️ Voice connect watchdog fired after 8s (proxy=${resolvedVoiceProxyUrl})`);
      setStatusText('Voice is unavailable right now.');
      setIsVoiceConnected(false);
      setIsMicActive(false);
      setIsAISpeaking(false);
    }, 8000);
    if (screenPollIntervalRef.current) {
      clearInterval(screenPollIntervalRef.current);
      screenPollIntervalRef.current = null;
    }
    userHasSpokenRef.current = false;
    const voice = new VoiceService({
      apiKey: analyticsKey ? undefined : apiKey,
      proxyUrl: resolvedVoiceProxyUrl,
      proxyHeaders: resolvedVoiceProxyHeaders,
      model: resolvedVoiceModel,
      systemPrompt: '',
      tools: [],
      language: getBrowserLanguage(),
    });
    const audioPlayer = createBrowserAudioPlayer({
      onSpeakingChange: setIsAISpeaking,
    });
    const micController = createBrowserMicController({
      onChunk: (chunk) => {
        voice.sendAudio(chunk);
      },
      onError: (message) => {
        setStatusText(message);
        setVoicePermissionIssue(buildMicrophonePermissionIssue('unknown', message));
        setIsMicActive(false);
      },
      consumeInitialStream: () => {
        const stream = pendingVoiceStreamRef.current;
        pendingVoiceStreamRef.current = null;
        return stream;
      },
    });
    voiceServiceRef.current = voice;
    audioPlayerRef.current = audioPlayer;
    micControllerRef.current = micController;
    setVoiceTranscript([]);
    logger.info('AIAgent', '🎙️ Calling VoiceService.connect()');
    void voice.connect({
      onAudioResponse: (audio) => {
        void audioPlayer.enqueue(audio);
      },
      onToolCall: async (toolCall) => {
        logger.info(
          'AIAgent',
          `🔧 Voice tool call: ${toolCall.name}(${JSON.stringify(toolCall.args || {})}) [id=${toolCall.id}]`,
        );
        if (!userHasSpokenRef.current) {
          logger.warn('AIAgent', `🚫 Rejected tool call ${toolCall.name} — waiting for user speech`);
          voice.sendFunctionResponse(toolCall.name, toolCall.id, {
            result: 'Action rejected: wait for user speech before performing any actions.',
          });
          return;
        }
        await micController.mute?.();
        logger.info('AIAgent', `🔇 Mic paused for tool execution: ${toolCall.name}`);
        if (toolLockRef.current) {
          logger.warn('AIAgent', `⏳ Tool locked — waiting before ${toolCall.name}`);
          while (toolLockRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        toolLockRef.current = true;
        setStatusText(`Executing ${toolCall.name.replace(/_/g, ' ')}...`);
        try {
          // Voice tools are not available in server-only mode (tools: []).
          // If a tool call arrives anyway, return a static message.
          const output = `Tool "${toolCall.name}" is not available in server-only mode.`;
          await new Promise((resolve) => setTimeout(resolve, 300));
          const snapshot = platformAdapter.getScreenSnapshot?.();
          const screenContext = snapshot?.elementsText || '';
          lastVoiceContextRef.current = screenContext || '';
          const enrichedResult = `${output}\n\n<updated_screen>\n${screenContext || ''}\n</updated_screen>`;
          logger.info('AIAgent', `📡 Tool result for ${toolCall.name}: ${enrichedResult}`);
          voice.sendFunctionResponse(toolCall.name, toolCall.id, {
            result: enrichedResult,
          });
        } catch (error) {
          logger.error('AIAgent', `🔧 Tool call ${toolCall.name} failed: ${error?.message || error}`);
          voice.sendFunctionResponse(toolCall.name, toolCall.id, {
            result: `Tool execution failed: ${error?.message || error}`,
          });
        } finally {
          toolLockRef.current = false;
          setStatusText('');
          if (voice.isConnected && isVoiceConnected) {
            void micController.unmute?.().then((ok) => {
              if (ok) {
                setIsMicActive(true);
                logger.info('AIAgent', `🔊 Mic resumed after tool execution: ${toolCall.name}`);
              }
            });
          }
        }
      },
      onTranscript: (text, isFinal, role) => {
        logger.info('AIAgent', `🎙️ Transcript [${role}] (final=${isFinal}): "${text}"`);
        if (role === 'user' && text?.trim()) {
          userHasSpokenRef.current = true;
        }
        lastVoiceTranscriptRef.current = {
          role,
          roleLastAt: Date.now(),
        };
        if (text?.trim()) {
          updateVoiceTranscriptDraft(text, isFinal, role, Date.now());
        }
      },
      onTurnComplete: () => {
        setIsAISpeaking(false);
      },
      onStatusChange: (nextStatus) => {
        logger.info('AIAgent', `🎙️ Voice status → ${nextStatus}`);
        setIsVoiceConnected(nextStatus === 'connected');
        if (nextStatus === 'connecting') {
          setStatusText('Connecting voice...');
        } else if (nextStatus === 'connected') {
          setVoicePermissionIssue(null);
          didConnect = true;
          clearTimeout(connectionTimeout);
          setStatusText('Voice connected');
          logger.info('AIAgent', '🎙️ Voice connected — preparing browser audio output');
          void audioPlayer
            .prime()
            .then(() => {
              logger.info('AIAgent', '🔊 Audio output ready');
            })
            .catch((error) => {
              logger.error('AIAgent', `🎙️ Failed to prepare voice output: ${error?.message || error}`);
              setStatusText('Voice output unavailable, microphone will keep running');
            })
            .finally(() => {
              logger.info('AIAgent', '🎙️ Enabling microphone capture after voice connection');
              setIsMicActive(true);
            });
        } else if (nextStatus === 'disconnected') {
          setStatusText('');
          setIsMicActive(false);
          setIsAISpeaking(false);
          void micController.mute?.();
          void audioPlayer.stop();
          if (!voice.intentionalDisconnect) {
            setTimeout(() => {
              if (mode === 'voice' && voice.lastCallbacks && !voice.intentionalDisconnect) {
                logger.info('AIAgent', '🔄 Reconnecting VoiceService...');
                void voice.connect(voice.lastCallbacks);
              }
            }, 2000);
          }
        }
      },
      onError: (error) => {
        logger.error('AIAgent', `🎙️ Voice error → ${error}`);
        clearTimeout(connectionTimeout);
        setStatusText(error);
        setIsVoiceConnected(false);
        setIsMicActive(false);
        setIsAISpeaking(false);
      },
      onSetupComplete: () => {
        didConnect = true;
        clearTimeout(connectionTimeout);
        setIsVoiceConnected(true);
        setStatusText('Voice connected');
        userHasSpokenRef.current = false;
        const snapshot = platformAdapter.getScreenSnapshot?.();
        const screenContext = snapshot?.elementsText || '';
        if (screenContext) {
          lastVoiceContextRef.current = screenContext;
          const passiveContext = `[SYSTEM CONTEXT — THIS IS NOT A USER REQUEST. DO NOT RESPOND. DO NOT NAVIGATE. DO NOT CALL ANY TOOLS. DO NOT SPEAK. Just silently read and memorize this screen layout. You will use it when the user speaks their first voice command.]\n\n${screenContext}`;
          voice.sendScreenContext(passiveContext);
        }
      },
    });
    return () => {
      clearTimeout(connectionTimeout);
      if (screenPollIntervalRef.current) {
        clearInterval(screenPollIntervalRef.current);
        screenPollIntervalRef.current = null;
      }
      if (voiceTranscriptSettleTimerRef.current) {
        clearTimeout(voiceTranscriptSettleTimerRef.current);
        voiceTranscriptSettleTimerRef.current = null;
      }
      flushPendingVoiceTranscript();
      voiceTranscriptDraftRef.current = {
        role: null,
        text: '',
        final: false,
        id: null,
        lastAt: 0,
      };
      setIsMicActive(false);
      setIsVoiceConnected(false);
      setIsAISpeaking(false);
      void micController.destroy?.();
      void audioPlayer.stop();
      voice.disconnect();
      if (pendingVoiceStreamRef.current) {
        pendingVoiceStreamRef.current.getTracks?.().forEach((track) => track.stop());
        pendingVoiceStreamRef.current = null;
      }
      micControllerRef.current = null;
      audioPlayerRef.current = null;
      voiceServiceRef.current = null;
    };
  }, [
    analyticsKey,
    apiKey,
    isOpen,
    knowledgeBase,
    mode,
    model,
    proxyHeaders,
    proxyUrl,
    resolvedInstructions?.system,
    resolvedSupportStyle,
    resolvedVoiceProxyHeaders,
    resolvedVoiceProxyUrl,
    voiceEnabled,
  ]);
  useEffect(() => {
    if (mode !== 'voice' || !isVoiceConnected || !voiceServiceRef.current) return undefined;
    const SCREEN_POLL_INTERVAL = 5000;
    const MIN_DIFF_RATIO = 0.05;
    const syncScreenContext = () => {
      if (toolLockRef.current) {
        logger.debug('AIAgent', '🔄 Screen poll skipped — tool lock active');
        return;
      }
      const snapshot = platformAdapter.getScreenSnapshot?.();
      const screenContext = snapshot?.elementsText || '';
      if (!screenContext || screenContext === lastVoiceContextRef.current) return;
      const previousLength = lastVoiceContextRef.current.length;
      const nextLength = screenContext.length;
      const diff = Math.abs(nextLength - previousLength);
      const diffRatio = previousLength > 0 ? diff / previousLength : 1;
      if (diffRatio < MIN_DIFF_RATIO) {
        logger.debug(
          'AIAgent',
          `🔄 Screen poll: minor change ignored (${diff} chars, ${(diffRatio * 100).toFixed(1)}% < ${MIN_DIFF_RATIO * 100}%)`,
        );
        return;
      }
      lastVoiceContextRef.current = screenContext;
      const passiveUpdate = `[SCREEN UPDATE — The UI has changed. Here is the current screen layout. This is not a user request — do not act unless the user asks.]\n\n${screenContext}`;
      voiceServiceRef.current?.sendScreenContext(passiveUpdate);
      logger.info('AIAgent', '🔄 Updated screen context sent to voice model');
    };
    syncScreenContext();
    screenPollIntervalRef.current = setInterval(syncScreenContext, SCREEN_POLL_INTERVAL);
    const interval = screenPollIntervalRef.current;
    return () => clearInterval(interval);
  }, [isVoiceConnected, mode]);
  useEffect(() => {
    if (mode !== 'voice' || !isVoiceConnected || !voiceServiceRef.current) return;
    const frame =
      typeof window !== 'undefined'
        ? window.requestAnimationFrame(() => {
            const snapshot = platformAdapter.getScreenSnapshot?.();
            const screenContext = snapshot?.elementsText || '';
            if (!screenContext || screenContext === lastVoiceContextRef.current) return;
            lastVoiceContextRef.current = screenContext;
            const passiveUpdate = `[SCREEN UPDATE — The UI has changed. Here is the current screen layout. This is not a user request — do not act unless the user asks.]\n\n${screenContext}`;
            voiceServiceRef.current?.sendScreenContext(passiveUpdate);
            logger.info('AIAgent', `🔄 Navigation context synced for voice session: ${pathname || 'unknown-path'}`);
          })
        : null;
    return () => {
      if (frame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [isVoiceConnected, mode, pathname]);
  useEffect(() => {
    if (!isMicActive) {
      logger.info('AIAgent', '🎙️ Mic state -> inactive, stopping browser mic controller');
      void micControllerRef.current?.mute?.();
      return undefined;
    }
    logger.info('AIAgent', '🎙️ Mic state -> active, starting browser mic controller');
    void micControllerRef.current?.start?.().then((ok) => {
      logger.info('AIAgent', `🎙️ Browser mic controller start result: ${ok ? 'ok' : 'failed'}`);
      if (ok) {
        setVoicePermissionIssue(null);
        setStatusText((current) => (isVoiceConnected ? 'Voice connected' : current));
      } else {
        setIsMicActive(false);
      }
    });
    return () => {
      logger.info('AIAgent', '🎙️ Mic effect cleanup, muting browser mic controller');
      void micControllerRef.current?.mute?.();
    };
  }, [isMicActive, isVoiceConnected]);
  useEffect(() => {
    if (isSpeakerMuted) {
      audioPlayerRef.current?.mute?.();
    } else {
      audioPlayerRef.current?.unmute?.();
    }
  }, [isSpeakerMuted]);
  useEffect(
    () => () => {
      pendingSocketsRef.current.forEach((socket) => socket.disconnect());
      supportSocketRef.current?.disconnect?.();
      voiceServiceRef.current?.disconnect?.();
      if (pendingVoiceStreamRef.current) {
        pendingVoiceStreamRef.current.getTracks?.().forEach((track) => track.stop());
        pendingVoiceStreamRef.current = null;
      }
      void micControllerRef.current?.destroy?.();
      void audioPlayerRef.current?.stop?.();
    },
    [],
  );
  const contextValue = useMemo(
    () => ({
      send: (message, options) => {
        void send(message, options);
      },
      isLoading,
      status: statusText,
      lastResult,
      messages,
      clearMessages,
      cancel,
    }),
    [cancel, clearMessages, isLoading, lastResult, messages, send, statusText],
  );
  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + (count || 0), 0);
  const displayUnread = totalUnread + localUnread;
  // Collapse the open panel to a status pill while the agent acts on the page,
  // unless the user re-expanded it or an approval/question is pending.
  const renderMinimized = isOpen && minimized && !forceExpandDuringRun && !pendingPrompt;
  // The collapsed pill surfaces the agent's latest reply (RN-style), so the user
  // can follow along without re-expanding; falls back to the live status text.
  const minimizedPillText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message?.role === 'assistant') {
        const text = message.previewText || richContentToPlainText(message.content) || '';
        if (text) return text;
      }
    }
    return statusText || 'Working on it…';
  }, [messages, statusText]);
  const showProactive = !isOpen && !renderMinimized && proactiveStage !== 'hidden' && !proactiveDismissedRef.current;
  const latestClosedPreview = useMemo(() => {
    const latestAssistantMessage = [...messages].reverse().find((message) => message.role !== 'user');
    if (!latestAssistantMessage) return 'New message';
    const content = latestAssistantMessage.previewText || latestAssistantMessage.content;
    const preview = Array.isArray(content)
      ? richContentToPlainText(content, '')
      : markdownToPlainText(String(content || '')).trim();
    return preview || 'New message';
  }, [messages]);
  const closedPreviewPlacement = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        right: 0,
        borderBottomRightRadius: 4,
      };
    }
    const launcherLeft = popupPosition?.left ?? window.innerWidth - 20 - WEB_LAUNCHER_SIZE;
    return launcherLeft < window.innerWidth / 2
      ? {
          left: 0,
          borderBottomLeftRadius: 4,
        }
      : {
          right: 0,
          borderBottomRightRadius: 4,
        };
  }, [popupPosition]);
  const greetingMessage = supportModeEnabled
    ? supportMode?.greeting?.message || 'Hi there. How can I help you today?'
    : null;
  const greetingAgentName = supportMode?.greeting?.agentName || 'Support';
  const modeButtonStyle = (selected) => ({
    flex: 1,
    border: 'none',
    background: selected ? accentTint : 'transparent',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 14,
    padding: '10px 12px',
    cursor: 'pointer',
  });
  // U2 — styled in-panel consent card (replaces window.confirm). Shows a
  // "What we'll share with the assistant" bulleted summary, an optional
  // privacy-policy / Learn-more link, and accent-styled Allow / Don't-Allow
  // buttons. Mirrors RN AgentChatBar consentVisible path.
  const renderConsentCard = () => {
    if (!consentRequest) return null;
    const providerInfo = CONSENT_PROVIDER_INFO[provider] || CONSENT_PROVIDER_INFO.gemini;
    const learnMoreUrl = privacyPolicyUrl || providerInfo.url;
    const learnMoreLabel = privacyPolicyUrl ? 'Privacy Policy' : 'Learn more';
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          marginTop: 12,
          borderRadius: 18,
          padding: '16px',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          {"What we'll share with the assistant:"}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {CONSENT_SHARED_DATA_ITEMS.map((item) => (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                color: 'rgba(255,255,255,0.82)',
                fontSize: 13,
                lineHeight: 1.45,
              }}
              key={item}
            >
              <span
                style={{
                  color: accent,
                  fontWeight: 800,
                  lineHeight: 1.45,
                }}
              >
                {'•'}
              </span>
              <span>{item}</span>
            </div>
          ))}
        </div>
        {learnMoreUrl ? (
          <a
            href={learnMoreUrl}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: accent,
              textDecoration: 'none',
              alignSelf: 'flex-start',
            }}
          >
            {learnMoreLabel}
          </a>
        ) : null}
        <div
          style={{
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => resolveConsent(false)}
            style={{
              flex: 1,
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontWeight: 700,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            {"Don't Allow"}
          </button>
          <button
            type="button"
            onClick={() => resolveConsent(true)}
            style={{
              flex: 1,
              border: 'none',
              borderRadius: 999,
              background: accent,
              color: '#fff',
              fontWeight: 700,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
          >
            {'Allow'}
          </button>
        </div>
      </div>
    );
  };
  const renderChatMessages = () => (
    <div
      ref={messagesScrollRef}
      style={{
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 'calc(min(65vh, 520px) - 178px)',
        flexShrink: 1,
        paddingRight: 4,
      }}
    >
      {!supportModeEnabled && messages.length === 0 && !isLoading && !pendingPrompt ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 10,
            padding: '20px 8px 10px',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 999,
              background: accent === '#0D9373' ? 'linear-gradient(145deg, #11A582 0%, #0B7D63 100%)' : accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 8px 22px ${hexToRgba(accent, 0.45)}`,
            }}
          >
            <WebAIBadge size={24} />
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {'How can I help?'}
          </div>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: 'rgba(255,255,255,0.58)',
              maxWidth: 248,
            }}
          >
            {'Ask me anything about this page — I can find things, fill forms, and take actions for you.'}
          </div>
        </div>
      ) : null}
      {supportModeEnabled && messages.length === 0 && !isLoading ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: quickReplies.length > 0 ? 4 : 0,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.72)',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {greetingAgentName}
          </div>
          <div
            style={{
              alignSelf: 'stretch',
              borderRadius: 22,
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontSize: 14,
              lineHeight: 1.45,
            }}
          >
            {greetingMessage}
          </div>
          {quickReplies.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {quickReplies.map((reply) => (
                <button
                  type="button"
                  onClick={() => {
                    void send(reply.message || reply.label);
                  }}
                  style={{
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  key={reply.label}
                >{`${reply.icon ? `${reply.icon} ` : ''}${reply.label}`}</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <div
            className="mobileai-web-chat-bubble"
            style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              minWidth: 0,
              flexShrink: 0,
              borderRadius: 18,
              padding: '11px 14px',
              background: isUser ? accentGradient : 'rgba(255,255,255,0.07)',
              border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
              boxShadow: isUser ? `0 4px 14px ${hexToRgba(accent, 0.32)}` : 'none',
              color: '#fff',
              borderBottomRightRadius: isUser ? 5 : 18,
              borderBottomLeftRadius: isUser ? 18 : 5,
              marginBottom: 8,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
            key={message.id}
          >
            <RichContentRendererWeb content={message.content} surface="chat" isUser={isUser} />
          </div>
        );
      })}
      {isLoading && !pendingPrompt ? <WebTypingBubble /> : null}
      {pendingPrompt?.kind === 'approval' ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            paddingTop: 2,
          }}
        >
          <button
            type="button"
            style={{
              border: 'none',
              borderRadius: 999,
              background: accent,
              color: '#fff',
              fontWeight: 700,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
            onClick={() => {
              resolveApprovalPrompt(APPROVAL_GRANTED_TOKEN, 'Allow');
            }}
          >
            {'Approve'}
          </button>
          <button
            type="button"
            style={{
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              fontWeight: 700,
              padding: '10px 14px',
              cursor: 'pointer',
            }}
            onClick={() => {
              resolveApprovalPrompt(APPROVAL_REJECTED_TOKEN, "Don't allow");
            }}
          >
            {'Not now'}
          </button>
        </div>
      ) : null}
    </div>
  );
  const renderHistoryPanel = () => (
    <div
      style={{
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setShowHistory(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            border: '1px solid rgba(13,147,115,0.18)',
            borderRadius: 999,
            background: 'rgba(13,147,115,0.08)',
            color: '#0D9373',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <WebCloseIcon size={13} color="#0D9373" />
          <span>{'Back'}</span>
        </button>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <WebHistoryIcon size={15} color="rgba(255,255,255,0.7)" />
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.86)',
            }}
          >
            {'History'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            clearMessages();
            setIsOpen(true);
            setShowHistory(false);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 10px',
            border: '1px solid rgba(13,147,115,0.18)',
            borderRadius: 999,
            background: 'rgba(13,147,115,0.08)',
            color: '#0D9373',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <WebNewChatIcon size={14} color="#0D9373" />
          <span>{'New'}</span>
        </button>
      </div>
      {conversationHistory.length === 0 ? (
        <div
          style={{
            minHeight: 180,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            color: 'rgba(255,255,255,0.72)',
          }}
        >
          <>
            <WebHistoryIcon size={36} color="rgba(255,255,255,0.25)" />
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {'No previous conversations'}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              {'Your AI conversations will appear here'}
            </div>
          </>
        </div>
      ) : (
        <div
          style={{
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            paddingRight: 4,
          }}
        >
          {conversationHistory.map((conversation) => (
            <div
              style={{
                position: 'relative',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 16,
                color: '#fff',
                overflow: 'hidden',
              }}
              key={conversation.id}
            >
              <button
                type="button"
                onClick={() => {
                  setMessages(Array.isArray(conversation.messages) ? conversation.messages : []);
                  setConversationId(
                    conversation.id && !String(conversation.id).startsWith('local-') ? conversation.id : null,
                  );
                  setLocalConversationKey(String(conversation.id || `local-${Date.now()}`));
                  setLastResult(null);
                  setMode('text');
                  setShowHistory(false);
                  setIsOpen(true);
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  padding: '12px 48px 12px 14px',
                  color: '#fff',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#fff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {conversation.title || 'Conversation'}
                  </div>
                  <div
                    style={{
                      minWidth: 18,
                      height: 18,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.12)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 6px',
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {Array.isArray(conversation.messages) ? conversation.messages.length : 0}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: 'rgba(255,255,255,0.72)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {conversation.preview || 'No preview available'}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.56)',
                  }}
                >
                  {formatRelativeTimestamp(conversation.updatedAt)}
                </div>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  deleteConversationHistoryEntry(conversation);
                }}
                title="Delete conversation"
                aria-label="Delete conversation"
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 12,
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <WebTrashIcon size={14} color="rgba(255,255,255,0.62)" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  const renderVoiceMode = () => (
    <>
      {!voiceEnabled ? (
        <div
          style={{
            borderRadius: 18,
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {'Voice is enabled for this surface, but the live voice connection is not ready yet.'}
        </div>
      ) : (
        <>
          {statusText && !isVoiceConnected ? (
            <div
              style={{
                borderRadius: 18,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.06)',
                color: '#fff',
                fontSize: 13,
                lineHeight: 1.5,
                marginBottom: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  color: 'rgba(255,255,255,0.86)',
                }}
              >
                {statusText}
              </div>
              <button
                type="button"
                onClick={() => {
                  void enterVoiceMode();
                }}
                style={{
                  alignSelf: 'flex-start',
                  border: 'none',
                  borderRadius: 999,
                  background: accent,
                  color: '#fff',
                  fontWeight: 700,
                  padding: '10px 14px',
                  cursor: 'pointer',
                }}
              >
                {'Retry microphone access'}
              </button>
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <button
              type="button"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: isSpeakerMuted ? 'rgba(13, 147, 115, 0.22)' : 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => setIsSpeakerMuted((value) => !value)}
              title={isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker'}
            >
              <WebSpeakerIcon size={18} color="#fff" muted={isSpeakerMuted} />
            </button>
            {/* U6(a) — Talk/Stop/Speaking semantics (mirrors RN VoiceControlsRow).
               Connecting (dots) → Talk (accent, idle) → Stop (red, recording) →
               Speaking (blue). Pressing while recording ends the whole session;
               pressing while idle-but-connected starts the mic again. */}
            <button
              type="button"
              disabled={!isVoiceConnected}
              style={{
                flex: 1,
                minHeight: 56,
                borderRadius: 999,
                border: 'none',
                background: !isVoiceConnected
                  ? 'rgba(255,255,255,0.08)'
                  : isAISpeaking
                    ? '#5aa8ff'
                    : isMicActive
                      ? '#ff6b6b'
                      : accent,
                color: '#fff',
                cursor: !isVoiceConnected ? 'default' : 'pointer',
                opacity: !isVoiceConnected ? 0.72 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '8px 16px',
              }}
              onClick={() => {
                if (!isVoiceConnected) return;
                if (isMicActive) {
                  // Stop button: full session cleanup (matches RN onStopSession).
                  stopVoiceSession();
                } else {
                  // Talk button: (re)start the mic.
                  setIsMicActive(true);
                }
              }}
              title={
                !isVoiceConnected
                  ? 'Connecting voice'
                  : isAISpeaking
                    ? 'Assistant speaking'
                    : isMicActive
                      ? 'Stop voice session'
                      : 'Start talking'
              }
            >
              {!isVoiceConnected ? (
                <WebLoadingDots size={18} color="#fff" />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 18,
                  }}
                >
                  {isAISpeaking ? (
                    <WebSpeakerIcon size={18} color="#fff" />
                  ) : isMicActive ? (
                    <WebStopIcon size={18} color="#fff" />
                  ) : (
                    <WebMicIcon size={18} color="#fff" />
                  )}
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {!isVoiceConnected ? 'Connecting...' : isAISpeaking ? 'Speaking...' : isMicActive ? 'Stop' : 'Talk'}
              </div>
            </button>
            <button
              type="button"
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => {
                stopVoiceSession();
              }}
              title="End voice session"
            >
              <WebCloseIcon size={14} color="#fff" />
            </button>
            <button
              type="button"
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                border: 'none',
                background: isVoiceConnected ? '#34C759' : '#f5a623',
                flexShrink: 0,
              }}
              title={isVoiceConnected ? 'Voice connected' : 'Voice connecting'}
            >
              {null}
            </button>
          </div>
          <div
            ref={voiceScrollRef}
            style={{
              overflowY: 'auto',
              minHeight: 220,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingRight: 4,
            }}
          >
            {voiceTranscript.length === 0 ? (
              <div
                style={{
                  borderRadius: 18,
                  padding: '14px 16px',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.72)',
                  fontSize: 13,
                }}
              >
                {isVoiceConnected
                  ? isMicActive
                    ? 'Voice is live. Speak naturally.'
                    : 'Voice is connected. Tap Talk to resume the mic.'
                  : 'Voice mode is ready. Connecting...'}
              </div>
            ) : (
              voiceTranscript.map((entry) => (
                <div
                  style={{
                    alignSelf: entry.role === 'user' ? 'flex-end' : 'stretch',
                    maxWidth: entry.role === 'user' ? '82%' : '100%',
                    minWidth: 0,
                    borderRadius: 20,
                    padding: '12px 14px',
                    background: entry.role === 'user' ? accentTint : 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    opacity: entry.final ? 1 : 0.72,
                    flexShrink: 0,
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                  key={entry.id}
                >
                  <RichContentRendererWeb content={entry.text} surface="chat" isUser={entry.role === 'user'} />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
  const renderHumanMode = () => {
    if (!selectedTicket) {
      return (
        <div
          ref={supportScrollRef}
          style={{
            overflowY: 'auto',
            minHeight: 220,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingRight: 4,
          }}
        >
          {tickets.length === 0 ? (
            <div
              style={{
                borderRadius: 18,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.72)',
                fontSize: 13,
              }}
            >
              {'No active human support conversations yet.'}
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                type="button"
                onClick={() => void handleTicketSelect(ticket.id)}
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: 18,
                  padding: '14px 16px',
                  textAlign: 'left',
                  color: '#fff',
                  cursor: 'pointer',
                }}
                key={ticket.id}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                    }}
                  >
                    {markdownToPlainText(ticket.reason || 'Human support')}
                  </div>
                  {unreadCounts[ticket.id] ? (
                    <div
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 999,
                        background: '#ff9f43',
                        color: '#111',
                        fontSize: 11,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 6px',
                      }}
                    >
                      {unreadCounts[ticket.id]}
                    </div>
                  ) : null}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.72)',
                  }}
                >
                  {ticket.screen || '/'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: CLOSED_TICKET_STATUSES.has(ticket.status) ? '#f8c291' : '#7ef0b8',
                    marginTop: 6,
                  }}
                >
                  {ticket.status || 'open'}
                </div>
              </button>
            ))
          )}
        </div>
      );
    }
    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <button
            type="button"
            onClick={handleBackToTickets}
            style={{
              ...modeButtonStyle(false),
              flex: '0 0 auto',
              padding: '8px 12px',
            }}
          >
            {'Back'}
          </button>
          <div
            style={{
              fontSize: 12,
              color: CLOSED_TICKET_STATUSES.has(selectedTicket.status) ? '#f8c291' : 'rgba(255,255,255,0.72)',
            }}
          >
            {selectedTicket.status || 'open'}
          </div>
        </div>
        <div
          ref={supportScrollRef}
          style={{
            overflowY: 'auto',
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            paddingRight: 4,
          }}
        >
          {/* U5 — human chat polish: date separators (Today/Yesterday), agent
             avatars, message timestamps, animated typing dots. Mirrors RN
             SupportChatModal. */}
          {supportMessages.map((message, index) => {
            const isUser = message.role === 'user';
            const prev = supportMessages[index - 1];
            const showDateSeparator =
              !prev || formatDateSeparator(prev.timestamp) !== formatDateSeparator(message.timestamp);
            const clock = formatMessageClock(message.timestamp);
            return (
              <div key={message.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {showDateSeparator && formatDateSeparator(message.timestamp) ? (
                  <div
                    style={{
                      alignSelf: 'center',
                      margin: '4px 0',
                      padding: '3px 12px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.06)',
                      color: 'rgba(255,255,255,0.5)',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {formatDateSeparator(message.timestamp)}
                  </div>
                ) : null}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isUser ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  {!isUser ? (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        flexShrink: 0,
                        background: accentGradient,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                      aria-hidden="true"
                    >
                      {(greetingAgentName || 'S').trim().charAt(0).toUpperCase() || 'S'}
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      gap: 3,
                      minWidth: 0,
                      maxWidth: '82%',
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        borderRadius: 20,
                        padding: '12px 14px',
                        background: isUser ? accentTint : 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      <RichContentRendererWeb content={message.content} surface="support" isUser={isUser} />
                    </div>
                    {clock ? (
                      <div
                        style={{
                          fontSize: 10.5,
                          color: 'rgba(255,255,255,0.42)',
                          padding: '0 4px',
                        }}
                      >
                        {clock}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          {isAgentTyping ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  flexShrink: 0,
                  background: accentGradient,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 800,
                }}
                aria-hidden="true"
              >
                {(greetingAgentName || 'S').trim().charAt(0).toUpperCase() || 'S'}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  borderRadius: 18,
                  borderBottomLeftRadius: 5,
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.08)',
                }}
                aria-label="Human agent is typing"
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="tw-typing-dot"
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.75)',
                      animation: `tw-typing 1.3s ${i * 0.16}s ease-in-out infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
        {CLOSED_TICKET_STATUSES.has(selectedTicket.status) ? (
          <div
            style={{
              marginTop: 12,
              borderRadius: 16,
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.72)',
              fontSize: 13,
            }}
          >
            {'This conversation is closed. Start a new request if you need more help.'}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 8,
              paddingTop: 14,
              marginTop: 14,
              borderTop: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <textarea
              ref={supportInputRef}
              value={supportInput}
              placeholder="Message the human agent…"
              onChange={(event) => setSupportInput(event.target.value)}
              onInput={(event) => autoGrowTextarea(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                sendSupportMessage(supportInput);
                autoGrowTextarea(event.currentTarget, true);
              }}
              style={{
                flex: 1,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                padding: '12px 14px',
                outline: 'none',
                minHeight: 44,
                maxHeight: 120,
                lineHeight: 1.35,
                resize: 'none',
                overflowY: 'auto',
                font: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => {
                sendSupportMessage(supportInput);
                autoGrowTextarea(supportInputRef.current, true);
              }}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                border: 'none',
                background: accent,
                color: '#fff',
                fontSize: 16,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {'\u25B6'}
            </button>
          </div>
        )}
      </>
    );
  };
  const voicePermissionGuidance = voicePermissionIssue
    ? getMicrophonePermissionGuidance(voicePermissionIssue.kind)
    : null;
  const voicePermissionPrimaryLabel =
    voicePermissionIssue?.kind === 'denied' ? "I've enabled it, check again" : 'Try microphone access again';
  return (
    <RichUIProvider blocks={webBlockDefinitions} theme={theme} surfaceThemes={surfaceThemes}>
      <ActionBridgeProvider handlers={blockActionHandlers}>
        <AgentContext.Provider value={contextValue}>
          <div ref={appRootRef}>{children}</div>
          <style>{`
            /* Reset the widget's typography baseline on the shadow host so the
               host page's theme (large fluid fonts, custom families, line-height)
               can't leak in through inherited CSS — keeps the UI consistent on
               any site (WordPress, etc.). */
            :host {
              font-size: 14px !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
              line-height: 1.4 !important;
              font-weight: 400 !important;
              letter-spacing: normal !important;
              font-style: normal !important;
              text-transform: none !important;
              -webkit-text-size-adjust: 100%;
              text-size-adjust: 100%;
            }
            .mobileai-web-chat-bubble,
            .mobileai-web-chat-bubble * {
              -webkit-user-select: text;
              user-select: text;
              overflow-wrap: anywhere;
              word-break: break-word;
              min-width: 0;
              max-width: 100%;
            }
            .mobileai-web-chat-bubble::selection,
            .mobileai-web-chat-bubble *::selection {
              color: #ffffff;
              background: rgba(13, 147, 115, 0.68);
              text-shadow: none;
            }
            .mobileai-web-chat-bubble::-moz-selection,
            .mobileai-web-chat-bubble *::-moz-selection {
              color: #ffffff;
              background: rgba(13, 147, 115, 0.68);
              text-shadow: none;
            }
            .tw-fab {
              transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.3, 1.2), box-shadow 0.18s ease;
              will-change: transform;
            }
            .tw-fab:hover {
              transform: translateY(-2px) scale(1.04);
              box-shadow: 0 16px 34px rgba(11, 125, 99, 0.5), 0 3px 8px rgba(0,0,0,0.2);
            }
            .tw-fab:active { transform: scale(0.95); }
            .tw-pulse-ring { animation: tw-pulse 1.6s ease-out infinite; }
            @keyframes tw-pulse {
              0% { transform: scale(1); opacity: 0.55; }
              70% { transform: scale(1.85); opacity: 0; }
              100% { transform: scale(1.85); opacity: 0; }
            }
            @keyframes tw-pop-in {
              0% { opacity: 0; transform: translateY(8px) scale(0.96); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes tw-badge-pop {
              0% { opacity: 0; transform: scale(0); }
              60% { opacity: 1; transform: scale(1.25); }
              100% { opacity: 1; transform: scale(1); }
            }
            @keyframes tw-ping {
              0% { transform: scale(1); opacity: 0.55; }
              75%, 100% { transform: scale(2.1); opacity: 0; }
            }
            @keyframes tw-panel-in {
              0% { opacity: 0; transform: translateY(14px) scale(0.985); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes tw-typing {
              0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
              30% { transform: translateY(-5px); opacity: 1; }
            }
            @keyframes tw-discovery-in {
              0% { opacity: 0; transform: translateY(6px) scale(0.7); }
              60% { opacity: 1; transform: translateY(0) scale(1.06); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            @media (prefers-reduced-motion: reduce) {
              .tw-fab, .tw-pulse-ring, .tw-typing-dot, .tw-discovery { animation: none !important; transition: none !important; }
            }
          `}</style>
          {guide ? (
            <div
              data-mobileai-ignore="true"
              style={{
                position: 'fixed',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 9998,
              }}
            >
              <div
                style={{
                  position: 'fixed',
                  left: guide.rect.left - 6,
                  top: guide.rect.top - 6,
                  width: guide.rect.width + 12,
                  height: guide.rect.height + 12,
                  borderRadius: 16,
                  border: '2px solid #0D9373',
                  background: guide.action ? 'rgba(124, 104, 245, 0.14)' : 'transparent',
                  boxShadow: guide.action
                    ? '0 0 0 4px rgba(124, 104, 245, 0.22), 0 10px 30px rgba(124, 104, 245, 0.32)'
                    : '0 0 0 9999px rgba(10, 12, 18, 0.24)',
                  transition: 'width 0.12s ease, height 0.12s ease',
                }}
              />
              {guide.action ? (
                <div
                  style={{
                    position: 'fixed',
                    left: guide.rect.left,
                    top: guide.rect.top - 38 >= 8 ? guide.rect.top - 38 : guide.rect.bottom + 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#0D9373',
                    color: '#fff',
                    borderRadius: 999,
                    padding: '6px 12px 6px 7px',
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: '0 12px 30px rgba(124, 104, 245, 0.42)',
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.22)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      lineHeight: '16px',
                    }}
                  >
                    {ACTION_GLYPH_WEB[guide.action] || '›'}
                  </span>
                  <span>{guide.message || ACTION_LABEL_WEB[guide.action] || ''}</span>
                </div>
              ) : guide.message ? (
                <div
                  style={{
                    position: 'fixed',
                    left: guide.rect.left,
                    top: Math.max(16, guide.rect.bottom + 10),
                    background: '#1f2330',
                    color: '#fff',
                    borderRadius: 14,
                    padding: '10px 12px',
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: '0 14px 36px rgba(15, 18, 24, 0.28)',
                    maxWidth: 280,
                  }}
                >
                  {guide.message}
                </div>
              ) : null}
            </div>
          ) : null}
          {voicePermissionIssue ? (
            <div
              data-mobileai-ignore="true"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                background: 'rgba(8, 10, 16, 0.48)',
              }}
            >
              <div
                style={{
                  width: 392,
                  maxWidth: 'calc(100vw - 32px)',
                  borderRadius: 28,
                  padding: 22,
                  background: 'linear-gradient(180deg, rgba(16,18,32,0.98) 0%, rgba(26,26,46,0.98) 100%)',
                  color: '#fff',
                  boxShadow: '0 24px 56px rgba(0, 0, 0, 0.42)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 10px',
                    borderRadius: 999,
                    background: 'rgba(110,118,255,0.16)',
                    color: '#b8c0ff',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  {'Voice setup'}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    lineHeight: 1.1,
                    fontWeight: 800,
                  }}
                >
                  {'Microphone Access Needed'}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: 'rgba(255,255,255,0.84)',
                  }}
                >
                  {voicePermissionIssue.message}
                </div>
                {voicePermissionGuidance ? (
                  <div
                    style={{
                      borderRadius: 20,
                      padding: '14px 16px',
                      background: 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#fff',
                      }}
                    >
                      {voicePermissionGuidance.title}
                    </div>
                    {voicePermissionGuidance.steps.map((step, index) => (
                      <div
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          color: 'rgba(255,255,255,0.76)',
                          fontSize: 13,
                          lineHeight: 1.45,
                        }}
                        key={`${voicePermissionIssue.kind}-${index}`}
                      >
                        <div
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            background: 'rgba(110,118,255,0.18)',
                            color: '#d6dbff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 11,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {index + 1}
                        </div>
                        <div>{step}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: 'rgba(255,255,255,0.56)',
                  }}
                >
                  {voicePermissionIssue.kind === 'denied'
                    ? 'The browser will only show the native microphone prompt again after you change the site permission.'
                    : 'Once the browser is ready, try the microphone action again from here.'}
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void enterVoiceMode();
                    }}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      background: '#0D9373',
                      color: '#fff',
                      fontWeight: 700,
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    {voicePermissionPrimaryLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoicePermissionIssue(null)}
                    style={{
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fff',
                      fontWeight: 700,
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    {'Close'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {csatPrompt && supportMode?.csat ? (
            <div
              data-mobileai-ignore="true"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 20,
                background: 'rgba(8, 10, 16, 0.48)',
              }}
            >
              <CSATSurvey
                config={supportMode.csat}
                metadata={csatPrompt.metadata}
                onDismiss={() => setCsatPrompt(null)}
                theme={{
                  primaryColor: '#0D9373',
                  textColor: '#ffffff',
                  backgroundColor: 'rgba(26, 26, 46, 0.98)',
                }}
              />
            </div>
          ) : null}
          {showChat ? (
            isOpen && !renderMinimized ? (
              <div
                data-mobileai-ignore="true"
                ref={popupRef}
                style={{
                  position: 'fixed',
                  right: popupPosition ? 'auto' : 20,
                  bottom: popupPosition ? 'auto' : 20,
                  left: popupPosition?.left,
                  top: popupPosition?.top,
                  width: WEB_POPUP_WIDTH,
                  maxWidth: 'calc(100vw - 32px)',
                  maxHeight: 'min(65vh, 520px)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 24,
                  padding: 16,
                  paddingTop: 8,
                  background: 'linear-gradient(180deg, rgba(28, 30, 50, 0.97) 0%, rgba(20, 22, 38, 0.97) 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 24px 60px rgba(0, 0, 0, 0.46), 0 2px 10px rgba(0,0,0,0.3)',
                  backdropFilter: 'blur(16px)',
                  color: '#fff',
                  animation: 'tw-panel-in 0.22s ease-out',
                }}
              >
                <WebAgentOverlay
                  visible={
                    isLoading &&
                    !pendingPrompt &&
                    !!statusText &&
                    statusText !== 'Thinking...' &&
                    statusText !== 'Working on it…'
                  }
                  statusText={statusText}
                  onCancel={
                    isLoading
                      ? () =>
                          cancel({
                            source: 'overlay',
                          })
                      : undefined
                  }
                />
                <div
                  style={{
                    width: '100%',
                    height: 30,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                    cursor: 'grab',
                    touchAction: 'none',
                  }}
                  onPointerDown={handlePopupPointerDown}
                >
                  <div
                    style={{
                      width: 40,
                      height: 5,
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.3)',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={minimizePopup}
                  aria-label="Minimize AI chat"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    padding: 12,
                    border: 'none',
                    background: 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 18,
                    fontWeight: 700,
                    lineHeight: 1,
                    zIndex: 2,
                  }}
                >
                  {'−'}
                </button>
                {!showHistory ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      left: 16,
                      zIndex: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowHistory(true);
                        setMode('text');
                      }}
                      title="View conversation history"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      <WebHistoryIcon size={18} color="rgba(255,255,255,0.55)" />
                    </button>
                    {conversationHistory.length > 0 ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: 14,
                          top: -8,
                          minWidth: 18,
                          height: 18,
                          borderRadius: 999,
                          background: '#0D9373',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 5px',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {conversationHistory.length > 9 ? '9+' : conversationHistory.length}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        clearMessages();
                        setShowQuickActions(false);
                        setMode('text');
                      }}
                      title="Start new conversation"
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        border: 'none',
                        background: 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      <WebNewChatIcon size={16} color="rgba(255,255,255,0.78)" />
                    </button>
                  </div>
                ) : null}
                {visibleModeCount === 1 && !showHistory ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      marginTop: 0,
                      marginBottom: 12,
                      minHeight: 46,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.08)',
                      padding: '0 56px',
                      cursor: 'grab',
                      touchAction: 'none',
                    }}
                    onPointerDown={handlePopupPointerDown}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        background:
                          accent === '#0D9373'
                            ? 'linear-gradient(145deg, #11A582 0%, #0B7D63 100%)'
                            : accent,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                      }}
                    >
                      <WebAIBadge size={13} />
                    </div>
                    <span
                      style={{
                        color: '#fff',
                        fontSize: 14,
                        fontWeight: 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {resolvedHeaderTitle}
                    </span>
                  </div>
                ) : null}
                {visibleModeCount > 1 && !showHistory ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'row',
                      marginTop: 0,
                      marginBottom: 12,
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.08)',
                      padding: 3,
                      cursor: 'grab',
                      touchAction: 'none',
                      minHeight: 46,
                    }}
                    onPointerDown={handlePopupPointerDown}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowHistory(false);
                        setShowQuickActions(false);
                        setMode('text');
                      }}
                      style={{
                        flex: 1,
                        border: 'none',
                        background: mode === 'text' && !showHistory ? accentTint : 'transparent',
                        color: mode === 'text' && !showHistory ? '#fff' : 'rgba(255,255,255,0.5)',
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 10,
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      {'Chat'}
                    </button>
                    {showVoiceTab ? (
                      <button
                        type="button"
                        onClick={() => {
                          void enterVoiceMode();
                        }}
                        style={{
                          flex: 1,
                          border: 'none',
                          background: mode === 'voice' ? accentTint : 'transparent',
                          color: mode === 'voice' ? '#fff' : 'rgba(255,255,255,0.5)',
                          fontSize: 13,
                          fontWeight: 700,
                          borderRadius: 10,
                          padding: '10px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        {'Voice'}
                      </button>
                    ) : null}
                    {tickets.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowHistory(false);
                          setMode('human');
                        }}
                        style={{
                          flex: 1,
                          border: 'none',
                          background: mode === 'human' ? accentTint : 'transparent',
                          color: mode === 'human' ? '#fff' : 'rgba(255,255,255,0.5)',
                          fontSize: 13,
                          fontWeight: 700,
                          borderRadius: 10,
                          padding: '10px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        {'Human'}
                        {totalUnread > 0 ? (
                          <span
                            style={{
                              marginLeft: 3,
                              minWidth: 14,
                              height: 14,
                              borderRadius: 999,
                              background: '#FF3B30',
                              color: '#fff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '0 3px',
                              fontSize: 8,
                              fontWeight: 700,
                            }}
                          >
                            {totalUnread > 99 ? '99+' : totalUnread}
                          </span>
                        ) : null}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {mode === 'text'
                  ? showHistory
                    ? renderHistoryPanel()
                    : quickActionsEnabled && showQuickActions
                      ? (
                        <QuickActionsPanelWeb
                          config={quickActionsConfig}
                          currentScreen={pathname || routerAdapter?.getCurrentScreenName?.() || '/'}
                          accent={accent}
                          onChatWithAI={handleQuickActionsChatWithAI}
                        />
                      )
                      : renderChatMessages()
                  : mode === 'voice'
                    ? renderVoiceMode()
                    : renderHumanMode()}
                {mode === 'text' && !showHistory && !(quickActionsEnabled && showQuickActions)
                  ? renderConsentCard()
                  : null}
                {mode === 'text' &&
                !showHistory &&
                !consentRequest &&
                !(quickActionsEnabled && showQuickActions) ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      paddingTop: 0,
                      marginTop: messages.length > 0 || pendingPrompt ? 12 : 0,
                      minWidth: 0,
                    }}
                  >
                    {pendingImages.length > 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 8,
                          flexWrap: 'wrap',
                          paddingLeft: 4,
                        }}
                      >
                        {pendingImages.map((img, idx) => (
                          <div
                            style={{
                              position: 'relative',
                              width: 56,
                              height: 56,
                            }}
                            key={`pending-img-${idx}`}
                          >
                            <img
                              src={`data:${img.mimeType};base64,${img.base64}`}
                              alt="pending"
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 8,
                                objectFit: 'cover',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setPendingImages((prev) => prev.filter((_, i) => i !== idx))}
                              aria-label="Remove image"
                              style={{
                                position: 'absolute',
                                top: -6,
                                right: -6,
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                border: 'none',
                                background: 'rgba(220,53,69,0.9)',
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 0,
                              }}
                            >
                              {'×'}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple={true}
                        style={{
                          display: 'none',
                        }}
                        onChange={async (event) => {
                          const files = event?.target?.files;
                          if (!files) return;
                          for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            if (!file.type.startsWith('image/')) continue;
                            const reader = new FileReader();
                            reader.onload = async (e) => {
                              const dataUrl = e.target?.result;
                              if (typeof dataUrl !== 'string') return;
                              const rawBase64 = dataUrl.split(',')[1] || '';
                              // Compress via canvas
                              const img = new Image();
                              img.onload = () => {
                                const MAX_DIM = 1024;
                                let w = img.width,
                                  h = img.height;
                                if (w > MAX_DIM || h > MAX_DIM) {
                                  const scale = MAX_DIM / Math.max(w, h);
                                  w = Math.round(w * scale);
                                  h = Math.round(h * scale);
                                }
                                const canvas = document.createElement('canvas');
                                canvas.width = w;
                                canvas.height = h;
                                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                                const compressed = canvas.toDataURL('image/jpeg', 0.3).split(',')[1] || '';
                                setPendingImages((prev) => [
                                  ...prev,
                                  {
                                    base64: compressed,
                                    mimeType: 'image/jpeg',
                                  },
                                ]);
                              };
                              img.src = `data:${file.type};base64,${rawBase64}`;
                            };
                            reader.readAsDataURL(file);
                          }
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Attach image"
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          border: 'none',
                          background: 'rgba(255,255,255,0.15)',
                          color: '#fff',
                          cursor: 'pointer',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      >
                        <svg
                          width={18}
                          height={18}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                      </button>
                      <textarea
                        ref={composerInputRef}
                        value={input}
                        placeholder={inputPlaceholder}
                        onChange={(event) => setInput(event.target.value)}
                        onInput={(event) => autoGrowTextarea(event.currentTarget)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' || event.shiftKey) return;
                          event.preventDefault();
                          const el = event.currentTarget;
                          // Any pending prompt — freeform OR approval — is resolved by
                          // typing. Never block the user from answering. Mirrors RN: a
                          // typed reply to an approval prompt is passed back to the agent
                          // as the answer (not a rejection). The Approve/Not-now buttons
                          // remain available for users who'd rather tap.
                          if (pendingPrompt) {
                            const pending = pendingPrompt;
                            const answer = input.trim();
                            if (!answer) return;
                            appendUserMessage(answer);
                            setInput('');
                            autoGrowTextarea(el, true);
                            setPendingPrompt(null);
                            pending.resolve(answer);
                            return;
                          }
                          if (pendingImages.length > 0) {
                            void send(input, pendingImages);
                            setPendingImages([]);
                          } else {
                            void send(input);
                          }
                          autoGrowTextarea(el, true);
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          borderRadius: 24,
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          padding: '13px 18px',
                          outline: 'none',
                          boxShadow: 'none',
                          fontSize: 15,
                          fontFamily: 'inherit',
                          fontWeight: 400,
                          minHeight: 48,
                          maxHeight: 140,
                          lineHeight: 1.35,
                          resize: 'none',
                          overflowY: 'auto',
                        }}
                      />
                      {isLoading && pendingImages.length === 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            cancel({
                              source: 'composer',
                            })
                          }
                          aria-label="Stop AI request"
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 999,
                            border: '1px solid rgba(255,255,255,0.14)',
                            background: 'rgba(255,255,255,0.1)',
                            color: '#fff',
                            cursor: 'pointer',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        >
                          <WebStopIcon size={18} color="#fff" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={
                          pendingPrompt
                            ? !input.trim()
                            : (isLoading && pendingImages.length === 0) || (!input.trim() && pendingImages.length === 0)
                        }
                        aria-label="Send message"
                        onClick={() => {
                          if (pendingPrompt) {
                            const pending = pendingPrompt;
                            const answer = input.trim();
                            if (!answer) return;
                            appendUserMessage(answer);
                            setInput('');
                            autoGrowTextarea(composerInputRef.current, true);
                            setPendingPrompt(null);
                            pending.resolve(answer);
                            return;
                          }
                          if (pendingImages.length > 0) {
                            void send(input, pendingImages);
                            setPendingImages([]);
                          } else {
                            void send(input);
                          }
                          autoGrowTextarea(composerInputRef.current, true);
                        }}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          border: 'none',
                          background: accent,
                          color: '#fff',
                          fontSize: 13,
                          fontWeight: 800,
                          lineHeight: 1,
                          cursor: (
                            pendingPrompt
                              ? !input.trim()
                              : (isLoading && pendingImages.length === 0) ||
                                (!input.trim() && pendingImages.length === 0)
                          )
                            ? 'default'
                            : 'pointer',
                          opacity: (
                            pendingPrompt
                              ? !input.trim()
                              : (isLoading && pendingImages.length === 0) ||
                                (!input.trim() && pendingImages.length === 0)
                          )
                            ? 0.5
                            : 1,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                        }}
                      >
                        <WebSendArrowIcon size={18} color="#fff" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                data-mobileai-ignore="true"
                style={{
                  position: 'fixed',
                  right: popupPosition ? 'auto' : 20,
                  bottom: popupPosition ? 'auto' : 20,
                  left: popupPosition?.left,
                  top: popupPosition?.top,
                  zIndex: 9999,
                }}
              >
                {discoveryVisible && !renderMinimized && !isLoading && !showProactive ? (
                  <div
                    className="tw-discovery"
                    data-mobileai-ignore="true"
                    role="button"
                    tabIndex={0}
                    onClick={dismissDiscoveryTooltip}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') dismissDiscoveryTooltip();
                    }}
                    style={{
                      position: 'absolute',
                      bottom: WEB_LAUNCHER_SIZE + 12,
                      ...closedPreviewPlacement,
                      width: 220,
                      maxWidth: 260,
                      borderRadius: 16,
                      padding: '10px 14px',
                      background: accent === '#0D9373' ? '#1a1a2e' : accent,
                      color: '#fff',
                      boxShadow: '0 8px 22px rgba(0,0,0,0.3)',
                      cursor: 'pointer',
                      transformOrigin: 'bottom right',
                      animation: 'tw-discovery-in 0.32s cubic-bezier(0.18, 0.9, 0.32, 1.25)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        lineHeight: '19px',
                        fontWeight: 500,
                        color: '#fff',
                      }}
                    >
                      {discoveryTooltipMessage || DISCOVERY_TOOLTIP_DEFAULT_MESSAGE}
                    </span>
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        bottom: -8,
                        right: 22,
                        width: 0,
                        height: 0,
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderTop: `8px solid ${accent === '#0D9373' ? '#1a1a2e' : accent}`,
                      }}
                    />
                  </div>
                ) : null}
                {renderMinimized ? (
                  <button
                    type="button"
                    onClick={() => setForceExpandDuringRun(true)}
                    aria-label="Expand AI chat"
                    style={{
                      position: 'absolute',
                      bottom: WEB_LAUNCHER_SIZE + 12,
                      ...closedPreviewPlacement,
                      width: 230,
                      minHeight: 50,
                      border: 'none',
                      borderRadius: 18,
                      background: 'rgba(20, 24, 38, 0.96)',
                      backdropFilter: 'blur(12px)',
                      color: '#fff',
                      boxShadow: '0 14px 34px rgba(0,0,0,0.34)',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      animation: 'tw-pop-in 0.18s ease-out',
                    }}
                  >
                    <WebLoadingDots size={18} color={accent} />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        color: 'rgba(255,255,255,0.92)',
                        flex: 1,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {minimizedPillText}
                    </span>
                  </button>
                ) : null}
                {showProactive && proactiveStage === 'badge' ? (
                  <div
                    data-mobileai-ignore="true"
                    style={{
                      position: 'absolute',
                      bottom: WEB_LAUNCHER_SIZE + 12,
                      ...closedPreviewPlacement,
                      maxWidth: 244,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#fff',
                      color: '#0F172A',
                      borderRadius: 16,
                      padding: '11px 12px 11px 15px',
                      boxShadow: '0 16px 36px rgba(0,0,0,0.20)',
                      animation: 'tw-pop-in 0.24s cubic-bezier(0.18, 0.9, 0.32, 1.25)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        dismissProactive();
                        openFromLauncher();
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'inherit',
                        font: 'inherit',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1.35,
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: 0,
                        flex: 1,
                      }}
                    >
                      {proactiveText || 'Need help with this screen?'}
                    </button>
                    <button
                      type="button"
                      onClick={dismissProactive}
                      aria-label="Dismiss"
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        border: 'none',
                        background: 'rgba(15,23,42,0.06)',
                        color: '#64748B',
                        fontSize: 15,
                        fontWeight: 700,
                        lineHeight: 1,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      {'×'}
                    </button>
                  </div>
                ) : null}
                {showProactive && proactiveStage === 'pulse' ? (
                  <span
                    className="tw-pulse-ring"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: WEB_LAUNCHER_SIZE,
                      height: WEB_LAUNCHER_SIZE,
                      borderRadius: 999,
                      background: 'rgba(13, 147, 115, 0.5)',
                      pointerEvents: 'none',
                    }}
                  />
                ) : null}
                {isLoading ? (
                  <div
                    data-mobileai-ignore="true"
                    style={{
                      position: 'absolute',
                      bottom: WEB_LAUNCHER_SIZE + 12,
                      ...closedPreviewPlacement,
                      width: 204,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'rgba(20, 24, 38, 0.96)',
                      backdropFilter: 'blur(12px)',
                      color: '#fff',
                      borderRadius: 18,
                      padding: '12px 15px',
                      boxShadow: '0 14px 34px rgba(0,0,0,0.32)',
                      animation: 'tw-pop-in 0.2s ease-out',
                    }}
                  >
                    <WebLoadingDots size={18} color={accent} />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        color: 'rgba(255,255,255,0.92)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusText || 'Thinking…'}
                    </span>
                  </div>
                ) : localUnread > 0 && messages.length > 0 ? (
                  <button
                    type="button"
                    onClick={openFromLauncher}
                    style={{
                      position: 'absolute',
                      bottom: WEB_LAUNCHER_SIZE + 12,
                      ...closedPreviewPlacement,
                      width: 250,
                      border: 'none',
                      borderRadius: 18,
                      background: '#fff',
                      color: '#0F172A',
                      boxShadow: '0 16px 38px rgba(15, 23, 42, 0.18)',
                      padding: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      animation: 'tw-pop-in 0.22s cubic-bezier(0.18, 0.9, 0.32, 1.2)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          background: 'linear-gradient(145deg, #11A582, #0B7D63)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <WebAIBadge size={12} />
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          color: '#0D9373',
                        }}
                      >
                        {'Twomilia'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 13.5,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        color: '#1E293B',
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {latestClosedPreview}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="tw-fab"
                  onClick={(event) => {
                    dismissProactive();
                    if (renderMinimized) {
                      setForceExpandDuringRun(true);
                    } else {
                      openFromLauncher(event);
                    }
                  }}
                  onPointerDown={handleLauncherPointerDown}
                  aria-label={displayUnread > 0 ? `Open AI chat - ${displayUnread} unread messages` : 'Open AI chat'}
                  style={{
                    width: WEB_LAUNCHER_SIZE,
                    height: WEB_LAUNCHER_SIZE,
                    borderRadius: 999,
                    border: 'none',
                    background:
                      accent === '#0D9373'
                        ? 'linear-gradient(145deg, #11A582 0%, #0D9373 55%, #0B7D63 100%)'
                        : accent,
                    color: '#fff',
                    boxShadow: '0 10px 26px rgba(11, 125, 99, 0.42), 0 2px 6px rgba(0,0,0,0.18)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {isLoading ? <WebLoadingDots size={28} color="#fff" /> : <WebAIBadge size={28} />}
                  {displayUnread > 0 ? (
                    <span
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: -3,
                        right: -3,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: 999,
                          background: '#FF3B47',
                          animation: 'tw-ping 1.9s cubic-bezier(0, 0, 0.2, 1) 2',
                        }}
                      />
                      <span
                        style={{
                          position: 'relative',
                          minWidth: 18,
                          height: 18,
                          borderRadius: 999,
                          background: '#FF3B47',
                          color: '#fff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '0 5px',
                          fontSize: 10.5,
                          fontWeight: 700,
                          lineHeight: 1,
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '0.01em',
                          boxShadow: '0 1px 4px rgba(15, 23, 42, 0.28)',
                          outline: '1.5px solid rgba(255,255,255,0.95)',
                          animation: 'tw-badge-pop 0.3s cubic-bezier(0.18, 0.9, 0.32, 1.4)',
                        }}
                      >
                        {displayUnread > 99 ? '99+' : displayUnread}
                      </span>
                    </span>
                  ) : null}
                </button>
              </div>
            )
          ) : null}
        </AgentContext.Provider>
      </ActionBridgeProvider>
    </RichUIProvider>
  );
}
