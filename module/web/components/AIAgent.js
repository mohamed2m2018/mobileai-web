"use strict";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBridgeProvider } from "../../core/ActionBridge.js";
import { AgentRuntime } from "../../core/AgentRuntime.js";
import { buildVoiceSystemPrompt } from "../../core/systemPrompt.js";
import { createAIMessage, markdownToPlainText, normalizeExecutionResult, richContentToPlainText } from "../../core/richContent.js";
import { createProvider } from "../../providers/ProviderFactory.js";
import { startConversation, appendMessages, fetchConversations, fetchConversation } from "../../services/ConversationService.js";
import { VoiceService } from "../../services/VoiceService.js";
import { initDeviceId } from "../../services/telemetry/device.js";
import { AgentContext } from "../../hooks/useAction.js";
import { RichUIProvider } from "../../components/rich-content/RichUIContext.js";
import { CSATSurvey } from "../../support/CSATSurvey.js";
import { createEscalateTool } from "../../support/escalateTool.js";
import { buildSupportPrompt } from "../../support/supportPrompt.js";
import { EscalationSocket } from "../../support/EscalationSocket.js";
import { ENDPOINTS } from "../../config/endpoints.js";
import { float32ToInt16Base64, base64ToFloat32 } from "../../utils/audioUtils.js";
import { logger } from "../../utils/logger.js";
import { WebPlatformAdapter } from "../core/WebPlatformAdapter.js";
import { webBlockDefinitions } from "../blocks.js";
import { RichContentRendererWeb } from "./RichContentRendererWeb.js";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";

const APPROVAL_GRANTED_TOKEN = '__APPROVAL_GRANTED__';
const APPROVAL_REJECTED_TOKEN = '__APPROVAL_REJECTED__';
const ASK_USER_CANCELLED_TOKEN = '__ASK_USER_CANCELLED__';
const CLOSED_TICKET_STATUSES = new Set(['closed', 'resolved']);
const DEFAULT_WEB_VOICE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const TRANSCRIPT_MERGE_WINDOW_MS = 3200;
const VOICE_TRANSCRIPT_SETTLE_MS = 650;
const COMPOSER_CANCEL_ARM_MS = 900;
const WEB_POPUP_WIDTH = 340;
const WEB_LAUNCHER_SIZE = 60;
const WEB_FLOATING_EDGE_PADDING = 12;

function clampFloatingPosition(left, top, width, height) {
  if (typeof window === 'undefined') {
    return {
      left,
      top
    };
  }
  const maxLeft = Math.max(WEB_FLOATING_EDGE_PADDING, window.innerWidth - width - WEB_FLOATING_EDGE_PADDING);
  const maxTop = Math.max(WEB_FLOATING_EDGE_PADDING, window.innerHeight - height - WEB_FLOATING_EDGE_PADDING);
  return {
    left: Math.min(Math.max(WEB_FLOATING_EDGE_PADDING, left), maxLeft),
    top: Math.min(Math.max(WEB_FLOATING_EDGE_PADDING, top), maxTop)
  };
}

function getEstimatedPopupSize() {
  if (typeof window === 'undefined') {
    return {
      width: WEB_POPUP_WIDTH,
      height: 180
    };
  }
  return {
    width: Math.min(WEB_POPUP_WIDTH, window.innerWidth - 32),
    height: Math.min(220, window.innerHeight * 0.65)
  };
}

function WebAIBadge({
  size = 28
}) {
  const bubbleWidth = size * 0.6;
  const bubbleHeight = size * 0.45;
  const tailSize = size * 0.12;
  return /*#__PURE__*/_jsxs("div", {
    style: {
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    children: [/*#__PURE__*/_jsx("div", {
      style: {
        width: bubbleWidth,
        height: bubbleHeight,
        background: '#fff',
        borderRadius: size * 0.12,
        marginBottom: tailSize * 0.5
      }
    }), /*#__PURE__*/_jsx("div", {
      style: {
        position: 'absolute',
        bottom: size * 0.18,
        left: size * 0.22,
        width: 0,
        height: 0,
        borderTop: `${tailSize}px solid #fff`,
        borderRight: `${tailSize}px solid transparent`
      }
    })]
  });
}

function WebLoadingDots({
  size = 28,
  color = '#fff'
}) {
  const dotSize = size * 0.15;
  return /*#__PURE__*/_jsx("div", {
    style: {
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: dotSize * 0.8
    },
    children: [0.4, 0.7, 1].map((opacity, index) => /*#__PURE__*/_jsx("div", {
      style: {
        width: dotSize,
        height: dotSize,
        borderRadius: dotSize / 2,
        background: color,
        opacity
      }
    }, index))
  });
}

function WebAgentOverlay({
  visible,
  statusText,
  onCancel
}) {
  if (!visible) return null;
  return /*#__PURE__*/_jsx("div", {
    style: {
      position: 'absolute',
      top: 58,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 6
    },
    children: /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: '85%',
        padding: '10px 14px',
        borderRadius: 999,
        background: 'rgba(26, 26, 46, 0.92)',
        color: '#fff',
        boxShadow: '0 16px 36px rgba(0, 0, 0, 0.28)',
        pointerEvents: 'auto'
      },
      children: [/*#__PURE__*/_jsx(WebLoadingDots, {
        size: 18,
        color: "#fff"
      }), /*#__PURE__*/_jsx("div", {
        style: {
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.3,
          flexShrink: 1
        },
        children: statusText || 'Thinking...'
      }), onCancel ? /*#__PURE__*/_jsx("button", {
        type: "button",
        onClick: onCancel,
        "aria-label": "Cancel AI request",
        style: {
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
          flexShrink: 0
        },
        children: /*#__PURE__*/_jsx(WebCloseIcon, {
          size: 12,
          color: "#fff"
        })
      }) : null]
    })
  });
}

function WebCloseIcon({
  size = 14,
  color = 'rgba(255,255,255,0.6)'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }, React.createElement('path', {
    d: 'M6 6L18 18'
  }), React.createElement('path', {
    d: 'M18 6L6 18'
  }));
}

function WebTrashIcon({
  size = 14,
  color = 'rgba(255,255,255,0.62)'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }, React.createElement('path', {
    d: 'M3 6h18'
  }), React.createElement('path', {
    d: 'M8 6V4h8v2'
  }), React.createElement('path', {
    d: 'M19 6l-1 14H6L5 6'
  }), React.createElement('path', {
    d: 'M10 11v5'
  }), React.createElement('path', {
    d: 'M14 11v5'
  }));
}

function WebHistoryIcon({
  size = 18,
  color = '#fff'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }, React.createElement('path', {
    d: 'M3 12a9 9 0 1 0 3-6.7'
  }), React.createElement('path', {
    d: 'M3 4v5h5'
  }), React.createElement('path', {
    d: 'M12 7v5l3 2'
  }));
}

function WebNewChatIcon({
  size = 14,
  color = '#7B68EE'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }, React.createElement('path', {
    d: 'M12 5v14'
  }), React.createElement('path', {
    d: 'M5 12h14'
  }));
}

function WebMicIcon({
  size = 18,
  color = '#fff'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }, React.createElement('rect', {
    x: '9',
    y: '3',
    width: '6',
    height: '11',
    rx: '3',
    fill: color,
    stroke: 'none'
  }), React.createElement('path', {
    d: 'M7 11a5 5 0 0 0 10 0'
  }), React.createElement('path', {
    d: 'M12 16v5'
  }), React.createElement('path', {
    d: 'M9 21h6'
  }));
}

function WebSpeakerIcon({
  size = 18,
  color = '#fff',
  muted = false
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true
  }, React.createElement('polygon', {
    points: '5,10 9,10 14,6 14,18 9,14 5,14',
    fill: color,
    stroke: 'none'
  }), muted ? React.createElement('path', {
    d: 'M18 8l-6 8'
  }) : React.createElement('path', {
    d: 'M18 9a4 4 0 0 1 0 6'
  }));
}

function WebStopIcon({
  size = 18,
  color = '#fff'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true
  }, React.createElement('rect', {
    x: '7',
    y: '7',
    width: '10',
    height: '10',
    rx: '1.8',
    fill: color
  }));
}

function WebSendArrowIcon({
  size = 18,
  color = '#fff'
}) {
  return React.createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true
  }, React.createElement('polygon', {
    points: '8,6 18,12 8,18',
    fill: color
  }));
}

function makeStorageKey(provider) {
  return `@mobileai_web_ai_consent_${provider || 'default'}`;
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
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : null
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
  const firstUserMessage = safeMessages.find(message => message.role === 'user');
  const lastMessage = safeMessages[safeMessages.length - 1];
  const titleSource = firstUserMessage?.previewText || firstUserMessage?.content || lastMessage?.previewText || 'Conversation';
  const previewSource = lastMessage?.previewText || lastMessage?.content || '';
  const titleText = Array.isArray(titleSource) ? richContentToPlainText(titleSource, 'Conversation') : markdownToPlainText(String(titleSource || 'Conversation')).trim();
  const previewText = Array.isArray(previewSource) ? richContentToPlainText(previewSource, '') : markdownToPlainText(String(previewSource || '')).trim();
  return {
    id,
    title: titleText.slice(0, 60) || 'Conversation',
    preview: previewText.slice(0, 120),
    updatedAt: lastMessage?.timestamp || Date.now(),
    messageCount: safeMessages.length,
    messages: safeMessages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      previewText: message.previewText,
      timestamp: message.timestamp,
      promptKind: message.promptKind
    }))
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

async function ensureConsent(requireConsent, providerName) {
  if (!requireConsent || typeof window === 'undefined') return true;
  const key = makeStorageKey(providerName);
  try {
    if (window.localStorage.getItem(key) === 'granted') return true;
  } catch {
    // Ignore storage failures.
  }
  const approved = window.confirm('Allow this app to send your message and relevant page context to the configured AI provider?');
  if (approved) {
    try {
      window.localStorage.setItem(key, 'granted');
    } catch {
      // Ignore storage failures.
    }
  }
  return approved;
}

function toUserHistory(messages) {
  return messages.map(entry => ({
    role: entry.role,
    content: entry.previewText
  }));
}

function createModeTranscriptMessage(role, text, final = true, timestamp = Date.now()) {
  return {
    id: `${role}-${Date.now()}-${Math.random()}`,
    role,
    text,
    final,
    timestamp
  };
}

function normalizeVoiceTranscriptText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/<noise>/gi, ' ').replace(/\s+/g, ' ').trim();
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
  const previewText = typeof content === 'string' ? markdownToPlainText(content).trim() : richContentToPlainText(content, '');
  return createAIMessage({
    id: `${ticketId}-${role}-${timestamp || Date.now()}-${Math.random()}`,
    role: role === 'user' ? 'user' : 'assistant',
    content,
    previewText,
    timestamp: timestamp || Date.now()
  });
}

function historyToSupportMessages(ticketId, history) {
  return history.map((entry, index) => toSupportMessage(ticketId, entry.role === 'live_agent' ? 'assistant' : entry.role, entry.content, entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now() + index));
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
  if (lowered.includes('notallowed') || lowered.includes('permission denied') || lowered.includes('permission dismissed')) {
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
    message
  };
}

function getMicrophonePermissionGuidance(kind) {
  const browser = detectBrowserFamily();
  if (kind === 'denied') {
    if (browser === 'chrome' || browser === 'edge') {
      return {
        title: 'Allow microphone for this site',
        steps: ['Click the site icon next to the address bar.', 'Open site settings.', 'Set Microphone to Allow, then return here and try again.']
      };
    }
    if (browser === 'safari') {
      return {
        title: 'Allow microphone in Safari',
        steps: ['Open Safari > Settings > Websites.', 'Choose Microphone.', 'Set this site to Allow, then return here and try again.']
      };
    }
    if (browser === 'firefox') {
      return {
        title: 'Allow microphone in Firefox',
        steps: ['Click the site permissions icon in the address bar.', 'Allow microphone access for this site, then return here and try again.']
      };
    }
  }
  if (kind === 'insecure') {
    return {
      title: 'Use a secure origin',
      steps: ['Open this app on HTTPS or localhost before using voice mode.']
    };
  }
  if (kind === 'notfound') {
    return {
      title: 'Check audio input devices',
      steps: ['Connect or enable a microphone in your operating system, then try again.']
    };
  }
  if (kind === 'notreadable') {
    return {
      title: 'Free the microphone',
      steps: ['Close other apps or tabs that are currently using the microphone, then try again.']
    };
  }
  return {
    title: 'Check microphone access',
    steps: ['Allow microphone access for this site, then try again.']
  };
}

async function requestBrowserMicrophoneAccess() {
  if (!navigator?.mediaDevices?.getUserMedia) {
    return {
      granted: false,
      stream: null,
      issue: buildMicrophonePermissionIssue('unsupported', 'Voice mode requires microphone support in this browser.')
    };
  }
  try {
    const liveStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    return {
      granted: true,
      stream: liveStream,
      issue: null
    };
  } catch (error) {
    const normalizedMessage = describeMicrophonePermissionError(error);
    const lowered = normalizedMessage.toLowerCase();
    const kind = lowered.includes('https or localhost') ? 'insecure' : lowered.includes('no microphone') ? 'notfound' : lowered.includes('busy in another app') ? 'notreadable' : lowered.includes('permission was denied') ? 'denied' : 'unknown';
    return {
      granted: false,
      stream: null,
      issue: buildMicrophonePermissionIssue(kind, normalizedMessage)
    };
  }
}

function normalizeQuickReplies(quickReplies) {
  if (!Array.isArray(quickReplies)) return [];
  return quickReplies.filter(reply => reply && typeof reply.label === 'string' && reply.label.trim().length > 0);
}

function withAuthorization(headers, analyticsKey) {
  if (!analyticsKey) return headers;
  const nextHeaders = {
    ...(headers || {})
  };
  const hasAuthorization = Object.keys(nextHeaders).some(key => key.toLowerCase() === 'authorization');
  if (!hasAuthorization) {
    nextHeaders.Authorization = `Bearer ${analyticsKey}`;
  }
  return nextHeaders;
}

function createBrowserMicController({
  onChunk,
  onError,
  consumeInitialStream
}) {
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
  const teardown = async () => {
    try {
      processor?.disconnect();
      source?.disconnect();
      sink?.disconnect();
      stream?.getTracks?.().forEach(track => track.stop());
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
  const setTrackEnabled = enabled => {
    const track = getAudioTrack();
    if (track) {
      track.enabled = enabled;
    }
    muted = !enabled;
  };
  const ensureGraph = async () => {
    if (!stream) {
      stream = consumeInitialStream?.() || await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      logger.info('AudioInput', `✅ Microphone access granted (tracks=${stream.getTracks?.().length || 0})`);
    }
    if (!context || context.state === 'closed' || !source || !processor || !sink) {
      context = new AudioContextCtor({
        sampleRate: 16000
      });
      targetSampleRate = context.sampleRate || 16000;
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      sink = context.createGain();
      sink.gain.value = 0;
      processor.onaudioprocess = event => {
        if (!active || muted) return;
        const channelData = event.inputBuffer.getChannelData(0);
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
            void restart().then(() => {
              restarting = false;
              logger.info('AudioInput', '✅ Mic graph restarted');
            }).catch(error => {
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
        const normalizedChannelData = targetSampleRate === 16000 ? channelData : resampleTo16k(channelData, targetSampleRate);
        if (!normalizedChannelData.length) return;
        onChunk(float32ToInt16Base64(new Float32Array(normalizedChannelData)));
      };
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
        logger.info('AudioInput', `Stopping microphone controller (tracks=${trackCount}, contextState=${context?.state || 'n/a'})`);
        await teardown();
      } catch {
        // Ignore audio cleanup failures.
      }
    },
    async stop() {
      await this.destroy();
    }
  };
}

function createBrowserAudioPlayer({
  onSpeakingChange
}) {
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
        sampleRate: 24000
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
    }
  };
}

export function AIAgent({
  children,
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
  persistenceKey
}) {
  const persistedState = useMemo(() => loadPersistedChatState(persistenceKey), [persistenceKey]);
  const persistedConversationHistory = useMemo(() => loadPersistedConversationHistory(persistenceKey), [persistenceKey]);
  const [messages, setMessages] = useState(() => persistedState?.messages || []);
  const messagesRef = useRef([]);
  const [conversationId, setConversationId] = useState(() => persistedState?.conversationId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [input, setInput] = useState('');
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [popupPosition, setPopupPosition] = useState(null);
  const [localConversationKey, setLocalConversationKey] = useState(() => `local-${Date.now()}`);
  const [pendingPrompt, setPendingPrompt] = useState(null);
  const [guide, setGuide] = useState(null);
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
  const [deviceId, setDeviceId] = useState(null);
  const [csatPrompt, setCsatPrompt] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
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
  const syncedMessageCountRef = useRef(Array.isArray(persistedState?.messages) ? persistedState.messages.length : 0);
  const remoteConversationHydratedRef = useRef(false);
  const requestStartedAtRef = useRef(0);
  const lastVoiceTranscriptRef = useRef({ role: null, roleLastAt: 0 });
  const voiceTranscriptDraftRef = useRef({ role: null, text: '', final: false, id: null, lastAt: 0 });
  const voiceTranscriptSettleTimerRef = useRef(null);
  const shownCsatKeysRef = useRef(new Set());
  const [supportInput, setSupportInput] = useState('');
  const selectedTicket = selectedTicketId ? tickets.find(ticket => ticket.id === selectedTicketId) || null : null;
  const supportModeEnabled = !!supportMode?.enabled;
  const csatEnabled = supportModeEnabled && supportMode?.csat?.enabled !== false;
  const showVoiceTab = !!enableVoice;
  const voiceEnabled = showVoiceTab && !!(voiceProxyUrl || analyticsKey || proxyUrl || apiKey);
  const visibleModeCount = 1 + (showVoiceTab ? 1 : 0) + (tickets.length > 0 ? 1 : 0);
  const quickReplies = useMemo(() => normalizeQuickReplies(supportMode?.quickReplies), [supportMode?.quickReplies]);
  const supportPrompt = useMemo(() => supportModeEnabled ? buildSupportPrompt(supportMode) : '', [supportMode, supportModeEnabled]);
  const resolvedSupportStyle = supportMode?.persona?.preset || supportStyle;
  const resolvedInstructions = useMemo(() => {
    if (!supportPrompt) return instructions;
    return {
      ...instructions,
      system: [instructions?.system, supportPrompt].filter(Boolean).join('\n\n')
    };
  }, [instructions, supportPrompt]);

  const flushPendingVoiceTranscript = useCallback(() => {
    const draft = voiceTranscriptDraftRef.current;
    if (!draft.role || !draft.text.trim()) {
      return;
    }
    setVoiceTranscript(prev => {
      const draftEntry = createModeTranscriptMessage(draft.role, draft.text.trim(), draft.final, draft.lastAt);
      const tail = prev[prev.length - 1];
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
      lastAt: 0
    };
  }, []);

  const updateVoiceTranscriptDraft = useCallback((text, isFinal, role, now) => {
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
      current.text = shouldReplaceVoiceTranscript(current.text, trimmed) ? trimmed : current.text ? `${current.text} ${trimmed}`.trim() : trimmed;
      current.lastAt = now;
      if (isFinal) {
        current.final = true;
      }
    }

    setVoiceTranscript(prev => {
      const draftEntry = createModeTranscriptMessage(role, current.text, Boolean(current.final), now);
      const tail = prev[prev.length - 1];
      if (tail && tail.role === role && normalizeVoiceTranscriptText(tail.text) === normalizeVoiceTranscriptText(draftEntry.text)) {
        return [...prev.slice(0, -1), {
          ...tail,
          text: draftEntry.text,
          final: draftEntry.final,
          timestamp: draftEntry.timestamp
        }];
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
  }, [flushPendingVoiceTranscript]);

  useEffect(() => {
    logger.setEnabled(debug);
    if (debug) {
      logger.info('AIAgent', '🔧 Debug logging enabled');
      logger.info('AIAgent', `⚙️ Initial config: interactionMode=${interactionMode || 'copilot(default)'} showVoiceTab=${showVoiceTab} enableVoice=${voiceEnabled} analytics=${!!analyticsKey} provider=${provider}`);
    }
  }, [analyticsKey, debug, interactionMode, provider, showVoiceTab, voiceEnabled]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    selectedTicketIdRef.current = selectedTicketId;
  }, [selectedTicketId]);

  useEffect(() => {
    let cancelled = false;
    void initDeviceId().then(id => {
      if (!cancelled) {
        setDeviceId(id);
      }
    }).catch(() => {});
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

  useEffect(() => () => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    }
  }, []);

  const appendUserMessage = useCallback(text => {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const userMessage = createAIMessage({
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    });
    setMessages(prev => [...prev, userMessage]);
    return userMessage;
  }, []);

  const resolveApprovalPrompt = useCallback((token, visibleReply) => {
    const pending = pendingPrompt;
    if (!pending || pending.kind !== 'approval') return;
    if (visibleReply) {
      appendUserMessage(visibleReply);
    }
    setPendingPrompt(null);
    pending.resolve(token);
  }, [appendUserMessage, pendingPrompt]);

  const handleWindowPointerMove = useCallback(event => {
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
    setPopupPosition(clampFloatingPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY, panelWidth, panelHeight));
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

  const startDragFromRect = useCallback((rect, clientX, clientY, source = 'popup') => {
    if (typeof window === 'undefined') return;
    dragStateRef.current = {
      source,
      startX: clientX,
      startY: clientY,
      moved: false,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  const handlePopupPointerDown = useCallback(event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target instanceof HTMLElement && event.target.closest('button,input,textarea,select,a,[role="button"]')) {
      return;
    }
    const popupEl = popupRef.current;
    if (!popupEl || typeof window === 'undefined') return;
    const rect = popupEl.getBoundingClientRect();
    startDragFromRect(rect, event.clientX, event.clientY, 'popup');
  }, [startDragFromRect]);

  const handleLauncherPointerDown = useCallback(event => {
    if (event.button !== undefined && event.button !== 0) return;
    if (!event.currentTarget || typeof event.currentTarget.getBoundingClientRect !== 'function') return;
    const rect = event.currentTarget.getBoundingClientRect();
    startDragFromRect(rect, event.clientX, event.clientY, 'launcher');
  }, [startDragFromRect]);

  const openFromLauncher = useCallback(event => {
    if (suppressLauncherClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (popupPosition && event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function' && typeof window !== 'undefined') {
      const rect = event.currentTarget.getBoundingClientRect();
      const popupSize = getEstimatedPopupSize();
      setPopupPosition(clampFloatingPosition(rect.right - popupSize.width, rect.bottom - popupSize.height, popupSize.width, popupSize.height));
    }
    setIsOpen(true);
  }, [popupPosition]);

  const minimizePopup = useCallback(() => {
    if (popupPosition && popupRef.current && typeof window !== 'undefined') {
      const rect = popupRef.current.getBoundingClientRect();
      setPopupPosition(clampFloatingPosition(rect.right - WEB_LAUNCHER_SIZE, rect.bottom - WEB_LAUNCHER_SIZE, WEB_LAUNCHER_SIZE, WEB_LAUNCHER_SIZE));
    }
    setIsOpen(false);
  }, [popupPosition]);

  useEffect(() => {
    persistChatState(persistenceKey, {
      conversationId,
      messages: messages.map(message => ({
        id: message.id,
        role: message.role,
        content: message.content,
        previewText: message.previewText,
        timestamp: message.timestamp,
        promptKind: message.promptKind
      }))
    });
  }, [conversationId, messages, persistenceKey]);

  useEffect(() => {
    const activeConversationId = conversationId || localConversationKey;
    if (!messages.length || !activeConversationId) return;
    setConversationHistory(prev => {
      const nextEntry = buildConversationSummary(activeConversationId, messages);
      const next = [nextEntry, ...prev.filter(entry => entry.id !== activeConversationId)].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 20);
      persistConversationHistory(persistenceKey, next);
      return next;
    });
  }, [conversationId, localConversationKey, messages, persistenceKey]);

  useEffect(() => {
    const target = mode === 'text' ? messagesScrollRef.current : mode === 'human' ? supportScrollRef.current : voiceScrollRef.current;
    if (!isOpen || !target) return;
    const frame = typeof window !== 'undefined' ? window.requestAnimationFrame(() => {
      target.scrollTop = target.scrollHeight;
    }) : null;
    return () => {
      if (frame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [isLoading, isOpen, isAgentTyping, mode, messages.length, pendingPrompt, supportMessages.length, voiceTranscript.length]);

  useEffect(() => {
    if (!isOpen || !popupPosition || !popupRef.current || typeof window === 'undefined') return;
    const rect = popupRef.current.getBoundingClientRect();
    const {
      left: nextLeft,
      top: nextTop
    } = clampFloatingPosition(rect.left, rect.top, rect.width, rect.height);
    if (Math.abs(nextLeft - rect.left) > 1 || Math.abs(nextTop - rect.top) > 1) {
      setPopupPosition({
        left: nextLeft,
        top: nextTop
      });
    }
  }, [isOpen, popupPosition, mode, showHistory]);

  const platformAdapter = useMemo(() => new WebPlatformAdapter({
    getRoot: () => appRootRef.current,
    router: routerAdapter,
    pathname,
    captureScreenshot,
    onGuide: payload => {
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
        message: payload.message
      });
      if (payload.autoRemoveAfterMs && payload.autoRemoveAfterMs > 0) {
        guideTimerRef.current = setTimeout(() => {
          setGuide(null);
        }, payload.autoRemoveAfterMs);
      }
    }
  }), [captureScreenshot, pathname, routerAdapter]);

  const appendIncomingSupportReply = useCallback((ticketId, reply) => {
    const timestamp = Date.now();
    const assistantMessage = toSupportMessage(ticketId, 'assistant', reply, timestamp);
    setTickets(prev => prev.map(ticket => ticket.id === ticketId ? {
      ...ticket,
      history: [...(ticket.history || []), {
        role: 'live_agent',
        content: reply,
        timestamp: new Date(timestamp).toISOString()
      }]
    } : ticket));
    if (selectedTicketIdRef.current === ticketId) {
      setSupportMessages(prev => [...prev, assistantMessage]);
      setUnreadCounts(prev => {
        if (!prev[ticketId]) return prev;
        const next = {
          ...prev
        };
        delete next[ticketId];
        return next;
      });
    } else {
      setUnreadCounts(prev => ({
        ...prev,
        [ticketId]: (prev[ticketId] || 0) + 1
      }));
    }
  }, []);

  const handleTicketSelect = useCallback(async ticketId => {
    const ticket = tickets.find(entry => entry.id === ticketId);
    if (!ticket) return;
    setSelectedTicketId(ticketId);
    setMode('human');
    setSupportInput('');
    setUnreadCounts(prev => {
      if (!prev[ticketId]) return prev;
      const next = {
        ...prev
      };
      delete next[ticketId];
      return next;
    });
    if (analyticsKey) {
      void fetch(`${ENDPOINTS.escalation}/api/v1/escalations/${ticketId}/read?analyticsKey=${encodeURIComponent(analyticsKey)}`, {
        method: 'POST'
      }).catch(() => {});
    }
    let nextHistory = ticket.history || [];
    let nextWsUrl = ticket.wsUrl;
    if (analyticsKey) {
      try {
        const response = await fetch(`${ENDPOINTS.escalation}/api/v1/escalations/${ticketId}?analyticsKey=${encodeURIComponent(analyticsKey)}`);
        if (response.ok) {
          const data = await response.json();
          nextHistory = Array.isArray(data.history) ? data.history : nextHistory;
          nextWsUrl = data.wsUrl || nextWsUrl;
          setTickets(prev => prev.map(entry => entry.id === ticketId ? {
            ...entry,
            history: nextHistory,
            wsUrl: nextWsUrl,
            status: data.status || entry.status
          } : entry));
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
      onReply: reply => appendIncomingSupportReply(ticketId, reply),
      onTypingChange: setIsAgentTyping,
      onTicketClosed: closedTicketId => {
        const resolvedTicketId = closedTicketId || ticketId;
        setTickets(prev => prev.map(entry => entry.id === resolvedTicketId ? {
          ...entry,
          status: 'closed'
        } : entry));
        setUnreadCounts(prev => {
          const next = {
            ...prev
          };
          delete next[resolvedTicketId];
          return next;
        });
      },
      onError: () => {}
    });
    socket.connect(nextWsUrl);
    supportSocketRef.current = socket;
  }, [analyticsKey, appendIncomingSupportReply, tickets]);

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
        limit: 1
      });
      if (cancelled || conversations.length === 0) {
        remoteConversationHydratedRef.current = true;
        return;
      }
      const latestConversation = conversations[0];
      const history = await fetchConversation({
        analyticsKey,
        conversationId: latestConversation.id
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
    const eligibleMessages = messages.filter(message => message.role === 'user' || message.role === 'assistant');
    if (eligibleMessages.length === 0) return;
    if (!eligibleMessages.some(message => message.role === 'assistant')) return;
    let cancelled = false;
    void (async () => {
      if (!conversationIdRef.current) {
        const startedConversationId = await startConversation({
          analyticsKey,
          userId: userContext?.userId,
          deviceId: deviceId || undefined,
          messages: eligibleMessages
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
        messages: unsyncedMessages
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
          analyticsKey
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
        setIsOpen(true);
        setUnreadCounts(restoredTickets.reduce((acc, ticket) => {
          if ((ticket.unreadCount || 0) > 0) {
            acc[ticket.id] = ticket.unreadCount;
          }
          return acc;
        }, {}));
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
        conversationDuration: Math.max(1, Math.round((Date.now() - new Date(selectedTicket.createdAt).getTime()) / 1000)),
        stepsCount: supportMessages.length,
        wasEscalated: true,
        screen: selectedTicket.screen || pathname || '/',
        ticketId: selectedTicket.id
      }
    });
  }, [csatEnabled, pathname, selectedTicket, supportMessages.length]);

  useEffect(() => {
    if (!csatEnabled || !lastResult?.success || mode !== 'text') return;
    const latestAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant');
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
        screen: pathname || '/'
      }
    });
  }, [csatEnabled, lastResult, messages, mode, pathname]);

  const autoEscalateTool = useMemo(() => {
    if (customTools?.['escalate_to_human']) return null;
    const escalationConfig = supportMode?.escalation ? {
      ...supportMode.escalation
    } : analyticsKey ? {
      provider: 'mobileai'
    } : null;
    if (!escalationConfig) return null;
    if (escalationConfig.provider === 'mobileai' && !analyticsKey) return null;
    if (escalationConfig.provider === 'custom' && typeof escalationConfig.onEscalate !== 'function') return null;
    return createEscalateTool({
      config: escalationConfig,
      analyticsKey,
      getContext: () => ({
        currentScreen: pathname || routerAdapter?.getCurrentScreenName?.() || '/',
        originalQuery: '',
        stepsBeforeEscalation: 0
      }),
      getHistory: () => toUserHistory(messagesRef.current),
      userContext,
      pushToken,
      pushTokenType,
      onEscalationStarted: (ticketId, socket) => {
        pendingSocketsRef.current.set(ticketId, socket);
        setTickets(prev => {
          if (prev.some(ticket => ticket.id === ticketId)) return prev;
          return [{
            id: ticketId,
            reason: 'Connecting to a human agent...',
            screen: pathname || '/',
            status: 'open',
            history: [],
            createdAt: new Date().toISOString(),
            wsUrl: '',
            unreadCount: 0
          }, ...prev];
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
      onTicketClosed: ticketId => {
        if (!ticketId) return;
        setTickets(prev => prev.map(ticket => ticket.id === ticketId ? {
          ...ticket,
          status: 'closed'
        } : ticket));
      }
    });
  }, [analyticsKey, appendIncomingSupportReply, customTools, pathname, pushToken, pushTokenType, routerAdapter, supportMode?.escalation, userContext]);

  const mergedCustomTools = useMemo(() => {
    const merged = {
      ...(customTools || {})
    };
    if (autoEscalateTool) {
      merged[autoEscalateTool.name] = autoEscalateTool;
    }
    return merged;
  }, [autoEscalateTool, customTools]);

  const runtimeConfig = useMemo(() => ({
    provider,
    apiKey,
    proxyUrl,
    proxyHeaders,
    voiceProxyUrl,
    voiceProxyHeaders,
    model,
    verifier,
    supportStyle: resolvedSupportStyle,
    maxSteps,
    stepDelay,
    customTools: mode === 'voice' ? {
      ...mergedCustomTools,
      ask_user: null
    } : mergedCustomTools,
    instructions: resolvedInstructions,
    onBeforeStep,
    onAfterStep,
    onBeforeTask,
    onAfterTask,
    onTokenUsage,
    knowledgeBase,
    knowledgeMaxTokens,
    enableUIControl,
    allowedActionNames,
    screenMap,
    maxTokenBudget,
    maxCostUSD,
    interactionMode,
    mcpServerUrl,
    platformAdapter,
    onStatusUpdate: setStatusText,
    onAskUser: mode === 'voice' ? undefined : request => new Promise(resolve => {
      const normalized = typeof request === 'string' ? {
        question: request,
        kind: 'freeform'
      } : request;
      const question = normalized.question;
      const kind = normalized.kind || 'freeform';
      const promptMessage = createAIMessage({
        id: `assistant-ask-${Date.now()}`,
        role: 'assistant',
        content: question,
        previewText: question,
        timestamp: Date.now(),
        promptKind: kind === 'approval' ? 'approval' : undefined
      });
      setMessages(prev => [...prev, promptMessage]);
      setPendingPrompt({
        question,
        kind,
        resolve
      });
      setMode('text');
      setIsOpen(true);
    })
  }), [allowedActionNames, apiKey, enableUIControl, interactionMode, knowledgeBase, knowledgeMaxTokens, maxCostUSD, maxSteps, maxTokenBudget, mcpServerUrl, mergedCustomTools, mode, model, onAfterStep, onAfterTask, onBeforeStep, onBeforeTask, onTokenUsage, platformAdapter, provider, proxyHeaders, proxyUrl, resolvedInstructions, resolvedSupportStyle, screenMap, stepDelay, verifier, voiceProxyHeaders, voiceProxyUrl]);

  const runtime = useMemo(() => new AgentRuntime(createProvider(provider, apiKey, model, proxyUrl, proxyHeaders), runtimeConfig, null, null), [apiKey, model, provider, proxyHeaders, proxyUrl, runtimeConfig]);
  const runtimeRef = useRef(runtime);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  const send = useCallback(async (message, options) => {
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;
    const consentGranted = await ensureConsent(requireConsent, provider);
    if (!consentGranted) {
      const denied = {
        success: false,
        message: 'AI request was cancelled because consent was declined.',
        steps: []
      };
      setLastResult(denied);
      options?.onResult?.(denied);
      return;
    }
    const userMessage = appendUserMessage(trimmed);
    if (!userMessage) return;
    setInput('');
    requestStartedAtRef.current = Date.now();
    setIsLoading(true);
    setStatusText('Thinking...');
    setIsOpen(true);
    logger.info('AIAgent', `📨 Sending message in ${mode} mode: "${trimmed}"`);
    const history = messagesRef.current.concat(userMessage);
    try {
      const rawResult = await runtime.execute(trimmed, toUserHistory(history));
      const result = normalizeExecutionResult(rawResult);
      const assistantMessage = createAIMessage({
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.reply || result.message,
        timestamp: Date.now(),
        result,
        previewText: result.previewText
      });
      setMessages(prev => [...prev, assistantMessage]);
      setLastResult(result);
      options?.onResult?.(result);
    } finally {
      requestStartedAtRef.current = 0;
      setIsLoading(false);
      setStatusText('');
    }
  }, [appendUserMessage, isLoading, mode, provider, requireConsent, runtime]);

  const sendSupportMessage = useCallback(text => {
    const trimmed = text.trim();
    if (!trimmed || !selectedTicketIdRef.current || !supportSocketRef.current) return;
    const activeTicketId = selectedTicketIdRef.current;
    const message = toSupportMessage(activeTicketId, 'user', trimmed, Date.now());
    supportSocketRef.current.sendText(trimmed);
    setSupportMessages(prev => [...prev, message]);
    setTickets(prev => prev.map(ticket => ticket.id === activeTicketId ? {
      ...ticket,
      history: [...(ticket.history || []), {
        role: 'user',
        content: trimmed,
        timestamp: new Date(message.timestamp).toISOString()
      }]
    } : ticket));
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

  const deleteConversationHistoryEntry = useCallback(conversation => {
    if (!conversation?.id) return;
    const id = String(conversation.id);
    setConversationHistory(prev => {
      const next = prev.filter(entry => String(entry.id) !== id);
      persistConversationHistory(persistenceKey, next);
      return next;
    });
    const isActiveConversation = conversationId === id || localConversationKey === id;
    if (isActiveConversation) {
      clearMessages();
    }
  }, [clearMessages, conversationId, localConversationKey, persistenceKey]);

  const cancel = useCallback(options => {
    if (options?.source === 'composer') {
      const elapsed = Date.now() - requestStartedAtRef.current;
      if (requestStartedAtRef.current && elapsed < COMPOSER_CANCEL_ARM_MS) {
        logger.warn('AIAgent', `Ignoring early composer cancel ${elapsed}ms after send`);
        return;
      }
    }
    runtime.cancel();
    setIsLoading(false);
    setStatusText('');
  }, [runtime]);

  const enterVoiceMode = useCallback(async () => {
    setShowHistory(false);
    setIsOpen(true);
    setVoicePermissionIssue(null);
    if (pendingVoiceStreamRef.current) {
      pendingVoiceStreamRef.current.getTracks?.().forEach(track => track.stop());
      pendingVoiceStreamRef.current = null;
    }
    setStatusText('Requesting microphone access...');
    logger.info('AIAgent', '🎙️ Voice tab clicked — requesting microphone access from direct user gesture');
    const permission = await requestBrowserMicrophoneAccess();
    if (!permission.granted) {
      logger.warn('AIAgent', `🎙️ Browser microphone permission denied/unavailable: ${permission.issue?.message || 'Unknown microphone error'}`);
      setStatusText(permission.issue?.message || 'Microphone access failed.');
      setVoicePermissionIssue(permission.issue);
      setMode('voice');
      return;
    }
    pendingVoiceStreamRef.current = permission.stream;
    logger.info('AIAgent', `🎙️ Microphone stream primed from user gesture (tracks=${permission.stream?.getTracks?.().length || 0})`);
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
      lastAt: 0
    };
    setIsMicActive(false);
    setIsVoiceConnected(false);
    setIsAISpeaking(false);
    setStatusText('');
    setVoicePermissionIssue(null);
    if (pendingVoiceStreamRef.current) {
      pendingVoiceStreamRef.current.getTracks?.().forEach(track => track.stop());
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

  const resolvedVoiceProxyHeaders = useMemo(() => withAuthorization(voiceProxyHeaders || proxyHeaders, analyticsKey), [analyticsKey, proxyHeaders, voiceProxyHeaders]);
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
    logger.info('AIAgent', `🎙️ Starting voice effect: mode=${mode} open=${isOpen} voiceEnabled=${voiceEnabled} proxy=${resolvedVoiceProxyUrl}`);
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
      systemPrompt: buildVoiceSystemPrompt(getBrowserLanguage(), resolvedInstructions?.system, !!knowledgeBase, resolvedSupportStyle),
      tools: runtimeRef.current.getTools(),
      language: getBrowserLanguage()
    });
    const audioPlayer = createBrowserAudioPlayer({
      onSpeakingChange: setIsAISpeaking
    });
    const micController = createBrowserMicController({
      onChunk: chunk => {
        voice.sendAudio(chunk);
      },
      onError: message => {
        setStatusText(message);
        setVoicePermissionIssue(buildMicrophonePermissionIssue('unknown', message));
        setIsMicActive(false);
      },
      consumeInitialStream: () => {
        const stream = pendingVoiceStreamRef.current;
        pendingVoiceStreamRef.current = null;
        return stream;
      }
    });
    voiceServiceRef.current = voice;
    audioPlayerRef.current = audioPlayer;
    micControllerRef.current = micController;
    setVoiceTranscript([]);
    logger.info('AIAgent', '🎙️ Calling VoiceService.connect()');
    void voice.connect({
      onAudioResponse: audio => {
        void audioPlayer.enqueue(audio);
      },
      onToolCall: async toolCall => {
        logger.info('AIAgent', `🔧 Voice tool call: ${toolCall.name}(${JSON.stringify(toolCall.args || {})}) [id=${toolCall.id}]`);
        if (!userHasSpokenRef.current) {
          logger.warn('AIAgent', `🚫 Rejected tool call ${toolCall.name} — waiting for user speech`);
          voice.sendFunctionResponse(toolCall.name, toolCall.id, {
            result: 'Action rejected: wait for user speech before performing any actions.'
          });
          return;
        }
        await micController.mute?.();
        logger.info('AIAgent', `🔇 Mic paused for tool execution: ${toolCall.name}`);

        if (toolLockRef.current) {
          logger.warn('AIAgent', `⏳ Tool locked — waiting before ${toolCall.name}`);
          while (toolLockRef.current) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        toolLockRef.current = true;
        setStatusText(`Executing ${toolCall.name.replace(/_/g, ' ')}...`);
        try {
          const output = await runtimeRef.current.executeTool(toolCall.name, toolCall.args || {});
          await new Promise(resolve => setTimeout(resolve, 300));
          const screenContext = runtimeRef.current.getScreenContext();
          lastVoiceContextRef.current = screenContext || '';
          const enrichedResult = `${output}\n\n<updated_screen>\n${screenContext || ''}\n</updated_screen>`;
          logger.info('AIAgent', `📡 Tool result for ${toolCall.name}: ${enrichedResult}`);
          voice.sendFunctionResponse(toolCall.name, toolCall.id, {
            result: enrichedResult
          });
        } catch (error) {
          logger.error('AIAgent', `🔧 Tool call ${toolCall.name} failed: ${error?.message || error}`);
          voice.sendFunctionResponse(toolCall.name, toolCall.id, {
            result: `Tool execution failed: ${error?.message || error}`
          });
        } finally {
          toolLockRef.current = false;
          setStatusText('');
          if (voice.isConnected && isVoiceConnected) {
            void micController.unmute?.().then(ok => {
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
          roleLastAt: Date.now()
        };
        if (text?.trim()) {
          updateVoiceTranscriptDraft(text, isFinal, role, Date.now());
        }
      },
      onTurnComplete: () => {
        setIsAISpeaking(false);
      },
      onStatusChange: nextStatus => {
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
          void audioPlayer.prime().then(() => {
            logger.info('AIAgent', '🔊 Audio output ready');
          }).catch(error => {
            logger.error('AIAgent', `🎙️ Failed to prepare voice output: ${error?.message || error}`);
            setStatusText('Voice output unavailable, microphone will keep running');
          }).finally(() => {
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
      onError: error => {
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
        const screenContext = runtimeRef.current.getScreenContext();
        if (screenContext) {
          lastVoiceContextRef.current = screenContext;
          const passiveContext = `[SYSTEM CONTEXT — THIS IS NOT A USER REQUEST. DO NOT RESPOND. DO NOT NAVIGATE. DO NOT CALL ANY TOOLS. DO NOT SPEAK. Just silently read and memorize this screen layout. You will use it when the user speaks their first voice command.]\n\n${screenContext}`;
          voice.sendScreenContext(passiveContext);
        }
      }
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
        lastAt: 0
      };
      setIsMicActive(false);
      setIsVoiceConnected(false);
      setIsAISpeaking(false);
      void micController.destroy?.();
      void audioPlayer.stop();
      voice.disconnect();
      if (pendingVoiceStreamRef.current) {
        pendingVoiceStreamRef.current.getTracks?.().forEach(track => track.stop());
        pendingVoiceStreamRef.current = null;
      }
      micControllerRef.current = null;
      audioPlayerRef.current = null;
      voiceServiceRef.current = null;
    };
  }, [analyticsKey, apiKey, isOpen, knowledgeBase, mode, model, proxyHeaders, proxyUrl, resolvedInstructions?.system, resolvedSupportStyle, resolvedVoiceProxyHeaders, resolvedVoiceProxyUrl, voiceEnabled]);

  useEffect(() => {
    if (mode !== 'voice' || !isVoiceConnected || !voiceServiceRef.current) return undefined;
    const SCREEN_POLL_INTERVAL = 5000;
    const MIN_DIFF_RATIO = 0.05;
    const syncScreenContext = () => {
      if (toolLockRef.current) {
        logger.debug('AIAgent', '🔄 Screen poll skipped — tool lock active');
        return;
      }
      const screenContext = runtimeRef.current.getScreenContext();
      if (!screenContext || screenContext === lastVoiceContextRef.current) return;
      const previousLength = lastVoiceContextRef.current.length;
      const nextLength = screenContext.length;
      const diff = Math.abs(nextLength - previousLength);
      const diffRatio = previousLength > 0 ? diff / previousLength : 1;
      if (diffRatio < MIN_DIFF_RATIO) {
        logger.debug('AIAgent', `🔄 Screen poll: minor change ignored (${diff} chars, ${(diffRatio * 100).toFixed(1)}% < ${MIN_DIFF_RATIO * 100}%)`);
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
    const frame = typeof window !== 'undefined' ? window.requestAnimationFrame(() => {
      const screenContext = runtimeRef.current.getScreenContext();
      if (!screenContext || screenContext === lastVoiceContextRef.current) return;
      lastVoiceContextRef.current = screenContext;
      const passiveUpdate = `[SCREEN UPDATE — The UI has changed. Here is the current screen layout. This is not a user request — do not act unless the user asks.]\n\n${screenContext}`;
      voiceServiceRef.current?.sendScreenContext(passiveUpdate);
      logger.info('AIAgent', `🔄 Navigation context synced for voice session: ${pathname || 'unknown-path'}`);
    }) : null;
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
    void micControllerRef.current?.start?.().then(ok => {
      logger.info('AIAgent', `🎙️ Browser mic controller start result: ${ok ? 'ok' : 'failed'}`);
      if (ok) {
        setVoicePermissionIssue(null);
        setStatusText(current => isVoiceConnected ? 'Voice connected' : current);
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

  useEffect(() => () => {
    pendingSocketsRef.current.forEach(socket => socket.disconnect());
    supportSocketRef.current?.disconnect?.();
    voiceServiceRef.current?.disconnect?.();
    if (pendingVoiceStreamRef.current) {
      pendingVoiceStreamRef.current.getTracks?.().forEach(track => track.stop());
      pendingVoiceStreamRef.current = null;
    }
    void micControllerRef.current?.destroy?.();
    void audioPlayerRef.current?.stop?.();
  }, []);

  const contextValue = useMemo(() => ({
    runtime,
    send: (message, options) => {
      void send(message, options);
    },
    isLoading,
    status: statusText,
    lastResult,
    messages,
    clearMessages,
    cancel
  }), [cancel, clearMessages, isLoading, lastResult, messages, runtime, send, statusText]);

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + (count || 0), 0);
  const greetingMessage = supportModeEnabled ? supportMode?.greeting?.message || 'Hi there. How can I help you today?' : null;
  const greetingAgentName = supportMode?.greeting?.agentName || 'Support';
  const modeButtonStyle = selected => ({
    flex: 1,
    border: 'none',
    background: selected ? 'rgba(123, 104, 238, 0.22)' : 'transparent',
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 14,
    padding: '10px 12px',
    cursor: 'pointer'
  });

  const renderChatMessages = () => /*#__PURE__*/_jsxs("div", {
    ref: messagesScrollRef,
    style: {
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxHeight: 'calc(min(65vh, 520px) - 178px)',
      flexShrink: 1,
      paddingRight: 4
    },
    children: [supportModeEnabled && messages.length === 0 && !isLoading ? /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginBottom: quickReplies.length > 0 ? 4 : 0
      },
      children: [/*#__PURE__*/_jsx("div", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.72)',
          letterSpacing: '0.02em',
          textTransform: 'uppercase'
        },
        children: greetingAgentName
      }), /*#__PURE__*/_jsx("div", {
        style: {
          alignSelf: 'stretch',
          borderRadius: 22,
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: 14,
          lineHeight: 1.45
        },
        children: greetingMessage
      }), quickReplies.length > 0 ? /*#__PURE__*/_jsx("div", {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8
        },
        children: quickReplies.map(reply => /*#__PURE__*/_jsx("button", {
          type: "button",
          onClick: () => {
            void send(reply.message || reply.label);
          },
          style: {
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            padding: '8px 12px',
            fontSize: 12,
            cursor: 'pointer'
          },
          children: `${reply.icon ? `${reply.icon} ` : ''}${reply.label}`
        }, reply.label))
      }) : null]
    }) : null, messages.map(message => {
      const isUser = message.role === 'user';
      return /*#__PURE__*/_jsx("div", {
        className: "mobileai-web-chat-bubble",
        style: {
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          maxWidth: '85%',
          borderRadius: 16,
          padding: '12px 14px',
          background: isUser ? '#7B68EE' : 'rgba(255,255,255,0.08)',
          color: '#fff',
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          marginBottom: 8
        },
        children: /*#__PURE__*/_jsx(RichContentRendererWeb, {
          content: message.content,
          surface: "chat",
          isUser: isUser
        })
      }, message.id);
    }), pendingPrompt?.kind === 'approval' ? /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        paddingTop: 2
      },
      children: [/*#__PURE__*/_jsx("button", {
        type: "button",
        style: {
          border: 'none',
          borderRadius: 999,
          background: '#7B68EE',
          color: '#fff',
          fontWeight: 700,
          padding: '10px 14px',
          cursor: 'pointer'
        },
        onClick: () => {
          resolveApprovalPrompt(APPROVAL_GRANTED_TOKEN, 'Allow');
        },
        children: "Approve"
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        style: {
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontWeight: 700,
          padding: '10px 14px',
          cursor: 'pointer'
        },
        onClick: () => {
          resolveApprovalPrompt(APPROVAL_REJECTED_TOKEN, "Don't allow");
        },
        children: "Not now"
      })]
    }) : null]
  });

  const renderHistoryPanel = () => /*#__PURE__*/_jsxs("div", {
    style: {
      minHeight: 220,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    },
    children: [/*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4
      },
      children: [/*#__PURE__*/_jsxs("button", {
        type: "button",
        onClick: () => {
          setShowHistory(false);
        },
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '6px 10px',
          border: '1px solid rgba(123,104,238,0.18)',
          borderRadius: 999,
          background: 'rgba(123,104,238,0.08)',
          color: '#7B68EE',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer'
        },
        children: [/*#__PURE__*/_jsx(WebCloseIcon, {
          size: 13,
          color: "#7B68EE"
        }), /*#__PURE__*/_jsx("span", {
          children: "Back"
        })]
      }), /*#__PURE__*/_jsxs("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 6
        },
        children: [/*#__PURE__*/_jsx(WebHistoryIcon, {
          size: 15,
          color: "rgba(255,255,255,0.7)"
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 13,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.86)'
          },
          children: "History"
        })]
      }), /*#__PURE__*/_jsxs("button", {
        type: "button",
        onClick: () => {
          clearMessages();
          setIsOpen(true);
          setShowHistory(false);
        },
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '6px 10px',
          border: '1px solid rgba(123,104,238,0.18)',
          borderRadius: 999,
          background: 'rgba(123,104,238,0.08)',
          color: '#7B68EE',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer'
        },
        children: [/*#__PURE__*/_jsx(WebNewChatIcon, {
          size: 14,
          color: "#7B68EE"
        }), /*#__PURE__*/_jsx("span", {
          children: "New"
        })]
      })]
    }), conversationHistory.length === 0 ? /*#__PURE__*/_jsx("div", {
      style: {
        minHeight: 180,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: 'rgba(255,255,255,0.72)'
      },
      children: /*#__PURE__*/_jsxs(_Fragment, {
        children: [/*#__PURE__*/_jsx(WebHistoryIcon, {
          size: 36,
          color: "rgba(255,255,255,0.25)"
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 14,
            fontWeight: 700,
            color: '#fff'
          },
          children: "No previous conversations"
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 12,
            color: 'rgba(255,255,255,0.5)'
          },
          children: "Your AI conversations will appear here"
        })]
      })
    }) : /*#__PURE__*/_jsx("div", {
      style: {
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        paddingRight: 4
      },
      children: conversationHistory.map(conversation => /*#__PURE__*/_jsxs("div", {
        style: {
          position: 'relative',
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 16,
          color: '#fff',
          overflow: 'hidden'
        },
        children: [/*#__PURE__*/_jsxs("button", {
          type: "button",
          onClick: () => {
            setMessages(Array.isArray(conversation.messages) ? conversation.messages : []);
            setConversationId(conversation.id && !String(conversation.id).startsWith('local-') ? conversation.id : null);
            setLocalConversationKey(String(conversation.id || `local-${Date.now()}`));
            setLastResult(null);
            setMode('text');
            setShowHistory(false);
            setIsOpen(true);
          },
          style: {
            width: '100%',
            border: 'none',
            background: 'transparent',
            padding: '12px 48px 12px 14px',
            color: '#fff',
            textAlign: 'left',
            cursor: 'pointer'
          },
          children: [/*#__PURE__*/_jsxs("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              marginBottom: 6
            },
            children: [/*#__PURE__*/_jsx("div", {
              style: {
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              },
              children: conversation.title || 'Conversation'
            }), /*#__PURE__*/_jsx("div", {
              style: {
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
                flexShrink: 0
              },
              children: Array.isArray(conversation.messages) ? conversation.messages.length : 0
            })]
          }), /*#__PURE__*/_jsx("div", {
            style: {
              fontSize: 12,
              lineHeight: 1.4,
              color: 'rgba(255,255,255,0.72)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            },
            children: conversation.preview || 'No preview available'
          }), /*#__PURE__*/_jsx("div", {
            style: {
              marginTop: 6,
              fontSize: 11,
              color: 'rgba(255,255,255,0.56)'
            },
            children: formatRelativeTimestamp(conversation.updatedAt)
          })]
        }), /*#__PURE__*/_jsx("button", {
          type: "button",
          onClick: event => {
            event.preventDefault();
            event.stopPropagation();
            deleteConversationHistoryEntry(conversation);
          },
          title: "Delete conversation",
          "aria-label": "Delete conversation",
          style: {
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
            padding: 0
          },
          children: /*#__PURE__*/_jsx(WebTrashIcon, {
            size: 14,
            color: "rgba(255,255,255,0.62)"
          })
        })]
      }, conversation.id))
    })]
  });

  const renderVoiceMode = () => /*#__PURE__*/_jsxs(_Fragment, {
    children: [!voiceEnabled ? /*#__PURE__*/_jsx("div", {
      style: {
        borderRadius: 18,
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.72)',
        fontSize: 13,
        lineHeight: 1.5
      },
      children: "Voice is enabled for this surface, but the live voice connection is not ready yet."
    }) : /*#__PURE__*/_jsxs(_Fragment, {
      children: [statusText && !isVoiceConnected ? /*#__PURE__*/_jsxs("div", {
        style: {
          borderRadius: 18,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.06)',
          color: '#fff',
          fontSize: 13,
          lineHeight: 1.5,
          marginBottom: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        },
        children: [/*#__PURE__*/_jsx("div", {
          style: {
            color: 'rgba(255,255,255,0.86)'
          },
          children: statusText
        }), /*#__PURE__*/_jsx("button", {
          type: "button",
          onClick: () => {
            void enterVoiceMode();
          },
          style: {
            alignSelf: 'flex-start',
            border: 'none',
            borderRadius: 999,
            background: '#7B68EE',
            color: '#fff',
            fontWeight: 700,
            padding: '10px 14px',
            cursor: 'pointer'
          },
          children: "Retry microphone access"
        })]
      }) : null, /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 16
        },
      children: [/*#__PURE__*/_jsx("button", {
        type: "button",
        style: {
          width: 36,
          height: 36,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          background: isSpeakerMuted ? 'rgba(123, 104, 238, 0.22)' : 'rgba(255,255,255,0.08)',
          color: '#fff',
          fontSize: 16,
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        },
        onClick: () => setIsSpeakerMuted(value => !value),
        title: isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker',
        children: /*#__PURE__*/_jsx(WebSpeakerIcon, {
          size: 18,
          color: "#fff",
          muted: isSpeakerMuted
        })
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        style: {
          flex: 1,
          minHeight: 56,
          borderRadius: 999,
          border: 'none',
          background: !isVoiceConnected ? 'rgba(255,255,255,0.08)' : isAISpeaking ? '#5aa8ff' : isMicActive ? '#ff6b6b' : '#7B68EE',
          color: '#fff',
          cursor: !isVoiceConnected ? 'default' : 'pointer',
          opacity: !isVoiceConnected ? 0.72 : 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          padding: '8px 16px'
        },
        onClick: () => {
          if (!isVoiceConnected) return;
          setIsMicActive(value => !value);
        },
        title: !isVoiceConnected ? 'Connecting voice' : isMicActive ? 'Mute microphone' : 'Unmute microphone',
        children: [!isVoiceConnected ? /*#__PURE__*/_jsx(WebLoadingDots, {
          size: 18,
          color: "#fff"
        }) : /*#__PURE__*/_jsx("div", {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: 18
          },
          children: isAISpeaking ? /*#__PURE__*/_jsx(WebSpeakerIcon, {
            size: 18,
            color: "#fff"
          }) : isMicActive ? /*#__PURE__*/_jsx(WebMicIcon, {
            size: 18,
            color: "#fff"
          }) : /*#__PURE__*/_jsx(WebStopIcon, {
            size: 18,
            color: "#fff"
          })
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 12,
            fontWeight: 700
          },
          children: !isVoiceConnected ? 'Connecting...' : isAISpeaking ? 'Speaking...' : isMicActive ? 'Mute' : 'Unmute'
        })]
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        style: {
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
          justifyContent: 'center'
        },
        onClick: () => {
          stopVoiceSession();
        },
        title: 'End voice session',
        children: /*#__PURE__*/_jsx(WebCloseIcon, {
          size: 14,
          color: "#fff"
        })
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        style: {
          width: 12,
          height: 12,
          borderRadius: 999,
          border: 'none',
          background: isVoiceConnected ? '#34C759' : '#f5a623',
          flexShrink: 0
        },
        title: isVoiceConnected ? 'Voice connected' : 'Voice connecting',
        children: null
      })]
    }), /*#__PURE__*/_jsx("div", {
      ref: voiceScrollRef,
      style: {
        overflowY: 'auto',
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        paddingRight: 4
      },
      children: voiceTranscript.length === 0 ? /*#__PURE__*/_jsx("div", {
        style: {
          borderRadius: 18,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.72)',
          fontSize: 13
        },
        children: isVoiceConnected ? isMicActive ? "Voice is live. Speak naturally." : "Voice is connected. Tap Talk to resume the mic." : "Voice mode is ready. Connecting..."
      }) : voiceTranscript.map(entry => /*#__PURE__*/_jsx("div", {
        style: {
          alignSelf: entry.role === 'user' ? 'flex-end' : 'stretch',
          maxWidth: entry.role === 'user' ? '82%' : '100%',
          borderRadius: 20,
          padding: '12px 14px',
          background: entry.role === 'user' ? 'rgba(123, 104, 238, 0.22)' : 'rgba(255,255,255,0.08)',
          color: '#fff',
          opacity: entry.final ? 1 : 0.72
        },
        children: /*#__PURE__*/_jsx(RichContentRendererWeb, {
          content: entry.text,
          surface: "chat",
          isUser: entry.role === 'user'
        })
      }, entry.id))
    })]
    })]
  });

  const renderHumanMode = () => {
    if (!selectedTicket) {
      return /*#__PURE__*/_jsx("div", {
        ref: supportScrollRef,
        style: {
          overflowY: 'auto',
          minHeight: 220,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingRight: 4
        },
        children: tickets.length === 0 ? /*#__PURE__*/_jsx("div", {
          style: {
            borderRadius: 18,
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 13
          },
          children: "No active human support conversations yet."
        }) : tickets.map(ticket => /*#__PURE__*/_jsxs("button", {
          type: "button",
          onClick: () => void handleTicketSelect(ticket.id),
          style: {
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 18,
            padding: '14px 16px',
            textAlign: 'left',
            color: '#fff',
            cursor: 'pointer'
          },
          children: [/*#__PURE__*/_jsxs("div", {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 6
            },
            children: [/*#__PURE__*/_jsx("div", {
              style: {
                fontWeight: 700
              },
              children: markdownToPlainText(ticket.reason || 'Human support')
            }), unreadCounts[ticket.id] ? /*#__PURE__*/_jsx("div", {
              style: {
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
                padding: '0 6px'
              },
              children: unreadCounts[ticket.id]
            }) : null]
          }), /*#__PURE__*/_jsx("div", {
            style: {
              fontSize: 12,
              color: 'rgba(255,255,255,0.72)'
            },
            children: ticket.screen || '/'
          }), /*#__PURE__*/_jsx("div", {
            style: {
              fontSize: 12,
              color: CLOSED_TICKET_STATUSES.has(ticket.status) ? '#f8c291' : '#7ef0b8',
              marginTop: 6
            },
            children: ticket.status || 'open'
          })]
        }, ticket.id))
      });
    }
    return /*#__PURE__*/_jsxs(_Fragment, {
      children: [/*#__PURE__*/_jsxs("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12
        },
        children: [/*#__PURE__*/_jsx("button", {
          type: "button",
          onClick: handleBackToTickets,
          style: {
            ...modeButtonStyle(false),
            flex: '0 0 auto',
            padding: '8px 12px'
          },
          children: "Back"
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 12,
            color: CLOSED_TICKET_STATUSES.has(selectedTicket.status) ? '#f8c291' : 'rgba(255,255,255,0.72)'
          },
          children: selectedTicket.status || 'open'
        })]
      }), /*#__PURE__*/_jsxs("div", {
        ref: supportScrollRef,
        style: {
          overflowY: 'auto',
          minHeight: 200,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingRight: 4
        },
        children: [supportMessages.map(message => {
          const isUser = message.role === 'user';
          return /*#__PURE__*/_jsx("div", {
            style: {
              alignSelf: isUser ? 'flex-end' : 'stretch',
              maxWidth: isUser ? '82%' : '100%',
              borderRadius: 20,
              padding: '12px 14px',
              background: isUser ? 'rgba(123, 104, 238, 0.22)' : 'rgba(255,255,255,0.08)',
              color: '#fff'
            },
            children: /*#__PURE__*/_jsx(RichContentRendererWeb, {
              content: message.content,
              surface: "support",
              isUser: isUser
            })
          }, message.id);
        }), isAgentTyping ? /*#__PURE__*/_jsx("div", {
          style: {
            color: 'rgba(255,255,255,0.7)',
            fontSize: 13
          },
          children: "Human agent is typing..."
        }) : null]
      }), CLOSED_TICKET_STATUSES.has(selectedTicket.status) ? /*#__PURE__*/_jsx("div", {
        style: {
          marginTop: 12,
          borderRadius: 16,
          padding: '12px 14px',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.72)',
          fontSize: 13
        },
        children: "This conversation is closed. Start a new request if you need more help."
      }) : /*#__PURE__*/_jsxs("div", {
        style: {
          display: 'flex',
          gap: 8,
          paddingTop: 14,
          marginTop: 14,
          borderTop: '1px solid rgba(255,255,255,0.08)'
        },
        children: [/*#__PURE__*/_jsx("input", {
          value: supportInput,
          placeholder: "Message the human agent…",
          onChange: event => setSupportInput(event.target.value),
          onKeyDown: event => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            sendSupportMessage(supportInput);
          },
          style: {
            flex: 1,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.08)',
            color: '#fff',
            padding: '12px 14px',
            outline: 'none'
          }
        }), /*#__PURE__*/_jsx("button", {
          type: "button",
          onClick: () => sendSupportMessage(supportInput),
          style: {
            width: 44,
            height: 44,
            borderRadius: 999,
            border: 'none',
            background: '#7B68EE',
            color: '#fff',
            fontSize: 16,
            cursor: 'pointer',
            flexShrink: 0
          },
          children: "\u25B6"
        })]
      })]
    });
  };

  const voicePermissionGuidance = voicePermissionIssue ? getMicrophonePermissionGuidance(voicePermissionIssue.kind) : null;
  const voicePermissionPrimaryLabel = voicePermissionIssue?.kind === 'denied' ? "I've enabled it, check again" : 'Try microphone access again';

  return /*#__PURE__*/_jsx(RichUIProvider, {
    blocks: webBlockDefinitions,
    theme: theme,
    surfaceThemes: surfaceThemes,
    children: /*#__PURE__*/_jsx(ActionBridgeProvider, {
      handlers: blockActionHandlers,
      children: /*#__PURE__*/_jsxs(AgentContext.Provider, {
        value: contextValue,
        children: [/*#__PURE__*/_jsx("div", {
          ref: appRootRef,
          children: children
        }), /*#__PURE__*/_jsx("style", {
          children: `
            .mobileai-web-chat-bubble,
            .mobileai-web-chat-bubble * {
              -webkit-user-select: text;
              user-select: text;
            }
            .mobileai-web-chat-bubble::selection,
            .mobileai-web-chat-bubble *::selection {
              color: #ffffff;
              background: rgba(123, 104, 238, 0.68);
              text-shadow: none;
            }
            .mobileai-web-chat-bubble::-moz-selection,
            .mobileai-web-chat-bubble *::-moz-selection {
              color: #ffffff;
              background: rgba(123, 104, 238, 0.68);
              text-shadow: none;
            }
          `
        }), guide ? /*#__PURE__*/_jsxs("div", {
          "data-mobileai-ignore": "true",
          style: {
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 9998
          },
          children: [/*#__PURE__*/_jsx("div", {
            style: {
              position: 'fixed',
              left: guide.rect.left - 6,
              top: guide.rect.top - 6,
              width: guide.rect.width + 12,
              height: guide.rect.height + 12,
              borderRadius: 16,
              border: '2px solid #7c68f5',
              boxShadow: '0 0 0 9999px rgba(10, 12, 18, 0.24)'
            }
          }), /*#__PURE__*/_jsx("div", {
            style: {
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
              maxWidth: 280
            },
            children: guide.message
          })]
        }) : null, voicePermissionIssue ? /*#__PURE__*/_jsx("div", {
          "data-mobileai-ignore": "true",
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(8, 10, 16, 0.48)'
          },
          children: /*#__PURE__*/_jsxs("div", {
            style: {
              width: 392,
              maxWidth: 'calc(100vw - 32px)',
              borderRadius: 28,
              padding: 22,
              background: 'linear-gradient(180deg, rgba(16,18,32,0.98) 0%, rgba(26,26,46,0.98) 100%)',
              color: '#fff',
              boxShadow: '0 24px 56px rgba(0, 0, 0, 0.42)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            },
            children: [/*#__PURE__*/_jsx("div", {
              style: {
                alignSelf: 'flex-start',
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(110,118,255,0.16)',
                color: '#b8c0ff',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              },
              children: "Voice setup"
            }), /*#__PURE__*/_jsx("div", {
              style: {
                fontSize: 24,
                lineHeight: 1.1,
                fontWeight: 800
              },
              children: "Microphone Access Needed"
            }), /*#__PURE__*/_jsx("div", {
              style: {
                fontSize: 14,
                lineHeight: 1.5,
                color: 'rgba(255,255,255,0.84)'
              },
              children: voicePermissionIssue.message
            }), voicePermissionGuidance ? /*#__PURE__*/_jsxs("div", {
              style: {
                borderRadius: 20,
                padding: '14px 16px',
                background: 'rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              },
              children: [/*#__PURE__*/_jsx("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff'
                },
                children: voicePermissionGuidance.title
              }), voicePermissionGuidance.steps.map((step, index) => /*#__PURE__*/_jsxs("div", {
                style: {
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  color: 'rgba(255,255,255,0.76)',
                  fontSize: 13,
                  lineHeight: 1.45
                },
                children: [/*#__PURE__*/_jsx("div", {
                  style: {
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
                    flexShrink: 0
                  },
                  children: index + 1
                }), /*#__PURE__*/_jsx("div", {
                  children: step
                })]
              }, `${voicePermissionIssue.kind}-${index}`))]
            }) : null, /*#__PURE__*/_jsx("div", {
              style: {
                fontSize: 12,
                lineHeight: 1.45,
                color: 'rgba(255,255,255,0.56)'
              },
              children: voicePermissionIssue.kind === 'denied' ? 'The browser will only show the native microphone prompt again after you change the site permission.' : 'Once the browser is ready, try the microphone action again from here.'
            }), /*#__PURE__*/_jsxs("div", {
              style: {
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap'
              },
              children: [/*#__PURE__*/_jsx("button", {
                type: "button",
                onClick: () => {
                  void enterVoiceMode();
                },
                style: {
                  border: 'none',
                  borderRadius: 999,
                  background: '#7B68EE',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '10px 14px',
                  cursor: 'pointer'
                },
                children: voicePermissionPrimaryLabel
              }), /*#__PURE__*/_jsx("button", {
                type: "button",
                onClick: () => setVoicePermissionIssue(null),
                style: {
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.08)',
                  color: '#fff',
                  fontWeight: 700,
                  padding: '10px 14px',
                  cursor: 'pointer'
                },
                children: "Close"
              })]
            })]
          })
        }) : null, csatPrompt && supportMode?.csat ? /*#__PURE__*/_jsx("div", {
          "data-mobileai-ignore": "true",
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(8, 10, 16, 0.48)'
          },
          children: /*#__PURE__*/_jsx(CSATSurvey, {
            config: supportMode.csat,
            metadata: csatPrompt.metadata,
            onDismiss: () => setCsatPrompt(null),
            theme: {
              primaryColor: '#7B68EE',
              textColor: '#ffffff',
              backgroundColor: 'rgba(26, 26, 46, 0.98)'
            }
          })
        }) : null, showChat ? isOpen ? /*#__PURE__*/_jsxs("div", {
          "data-mobileai-ignore": "true",
          ref: popupRef,
        style: {
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
          background: 'rgba(26, 26, 46, 0.95)',
          boxShadow: '0 18px 48px rgba(0, 0, 0, 0.38)',
          backdropFilter: 'blur(14px)',
          color: '#fff'
          },
          children: [/*#__PURE__*/_jsx(WebAgentOverlay, {
            visible: isLoading,
            statusText: statusText,
            onCancel: isLoading ? () => cancel({
              source: 'overlay'
            }) : undefined
          }), /*#__PURE__*/_jsx("div", {
            style: {
              width: '100%',
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              cursor: 'grab',
              touchAction: 'none'
            },
            onPointerDown: handlePopupPointerDown,
            children: /*#__PURE__*/_jsx("div", {
              style: {
                width: 40,
                height: 5,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.3)'
              }
            })
          }), /*#__PURE__*/_jsx("button", {
            type: "button",
            onClick: minimizePopup,
            "aria-label": "Minimize AI chat",
            style: {
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
              zIndex: 2
            },
            children: '−'
          }), !showHistory ? /*#__PURE__*/_jsxs("div", {
            style: {
              position: 'absolute',
              top: 12,
              left: 16,
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: [/*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: event => {
                event.stopPropagation();
                setShowHistory(true);
                setMode('text');
              },
              title: "View conversation history",
              style: {
                width: 24,
                height: 24,
                borderRadius: 999,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              },
              children: /*#__PURE__*/_jsx(WebHistoryIcon, {
                size: 18,
                color: "rgba(255,255,255,0.55)"
              })
            }), conversationHistory.length > 0 ? /*#__PURE__*/_jsx("div", {
              style: {
                position: 'absolute',
                left: 14,
                top: -8,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: '#7B68EE',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700
              },
              children: conversationHistory.length > 9 ? '9+' : conversationHistory.length
            }) : null, /*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: event => {
                event.stopPropagation();
                clearMessages();
                setMode('text');
              },
              title: "Start new conversation",
              style: {
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
                padding: 0
              },
              children: /*#__PURE__*/_jsx(WebNewChatIcon, {
                size: 16,
                color: "rgba(255,255,255,0.78)"
              })
            })]
          }) : null, visibleModeCount > 1 && !showHistory ? /*#__PURE__*/_jsxs("div", {
            style: {
              display: 'flex',
              flexDirection: 'row',
              marginTop: 0,
              marginBottom: 12,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.08)',
              padding: 3,
              cursor: 'grab',
              touchAction: 'none',
              minHeight: 46
            },
            onPointerDown: handlePopupPointerDown,
            children: [/*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: () => {
                setShowHistory(false);
                setMode('text');
              },
              style: {
                flex: 1,
                border: 'none',
                background: mode === 'text' && !showHistory ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: mode === 'text' && !showHistory ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer'
              },
              children: "Chat"
            }), showVoiceTab ? /*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: () => {
                void enterVoiceMode();
              },
              style: {
                flex: 1,
                border: 'none',
                background: mode === 'voice' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: mode === 'voice' ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer'
              },
              children: "Voice"
            }) : null, tickets.length > 0 ? /*#__PURE__*/_jsxs("button", {
              type: "button",
              onClick: () => {
                setShowHistory(false);
                setMode('human');
              },
              style: {
                flex: 1,
                border: 'none',
                background: mode === 'human' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: mode === 'human' ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: 13,
                fontWeight: 700,
                borderRadius: 10,
                padding: '10px 12px',
                cursor: 'pointer'
              },
              children: ["Human", totalUnread > 0 ? /*#__PURE__*/_jsx("span", {
                style: {
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
                  fontWeight: 700
                },
                children: totalUnread > 99 ? '99+' : totalUnread
              }) : null]
            }) : null]
          }) : null, mode === 'text' ? showHistory ? renderHistoryPanel() : renderChatMessages() : mode === 'voice' ? renderVoiceMode() : renderHumanMode(), mode === 'text' && !showHistory ? /*#__PURE__*/_jsxs("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingTop: 0,
              marginTop: messages.length > 0 || pendingPrompt ? 12 : 0,
              minWidth: 0
            },
            children: [/*#__PURE__*/_jsx("input", {
              value: input,
              placeholder: inputPlaceholder,
              onChange: event => setInput(event.target.value),
              onKeyDown: event => {
                if (event.key !== 'Enter' || event.shiftKey) return;
                event.preventDefault();
                if (pendingPrompt?.kind === 'freeform') {
                  const pending = pendingPrompt;
                  const answer = input.trim();
                  if (!answer) return;
                  appendUserMessage(answer);
                  setInput('');
                  setPendingPrompt(null);
                  pending.resolve(answer);
                  return;
                }
                void send(input);
              },
              style: {
                flex: 1,
                minWidth: 0,
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                padding: '13px 18px',
                outline: 'none',
                boxShadow: 'none',
                fontSize: 16,
                minHeight: 48
              }
            }), /*#__PURE__*/_jsx("button", {
              type: "button",
              onClick: () => {
                if (isLoading) {
                  cancel({
                    source: 'composer'
                  });
                  return;
                }
                if (pendingPrompt?.kind === 'freeform') {
                  const pending = pendingPrompt;
                  const answer = input.trim();
                  if (!answer) return;
                  appendUserMessage(answer);
                  setInput('');
                  setPendingPrompt(null);
                  pending.resolve(answer);
                  return;
                }
                void send(input);
              },
              style: {
                width: 44,
                height: 44,
                borderRadius: 999,
                border: 'none',
                background: '#7B68EE',
                color: '#fff',
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1,
                cursor: isLoading ? 'default' : 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0
              },
              children: isLoading ? /*#__PURE__*/_jsx(WebStopIcon, {
                size: 18,
                color: "#fff"
              }) : /*#__PURE__*/_jsx(WebSendArrowIcon, {
                size: 18,
                color: "#fff"
              })
            })]
          }) : null]
        }) : /*#__PURE__*/_jsx("div", {
          "data-mobileai-ignore": "true",
          style: {
            position: 'fixed',
            right: popupPosition ? 'auto' : 20,
            bottom: popupPosition ? 'auto' : 20,
            left: popupPosition?.left,
            top: popupPosition?.top,
            zIndex: 9999
          },
          children: /*#__PURE__*/_jsx("button", {
            type: "button",
            onClick: openFromLauncher,
            onPointerDown: handleLauncherPointerDown,
            "aria-label": "Open AI chat",
            style: {
              width: WEB_LAUNCHER_SIZE,
              height: WEB_LAUNCHER_SIZE,
              borderRadius: 999,
              border: 'none',
              background: '#7B68EE',
              color: '#fff',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.28)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative'
            },
            children: [isLoading ? /*#__PURE__*/_jsx(WebLoadingDots, {
              size: 28,
              color: "#fff"
            }) : /*#__PURE__*/_jsx(WebAIBadge, {
              size: 28
            }), totalUnread > 0 ? /*#__PURE__*/_jsx("div", {
              style: {
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: '#FF3B30',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
                fontSize: 10,
                fontWeight: 700,
                border: '2px solid #fff'
              },
              children: totalUnread > 99 ? '99+' : totalUnread
            }) : null]
          })
        }) : null]
      })
    })
  });
}
