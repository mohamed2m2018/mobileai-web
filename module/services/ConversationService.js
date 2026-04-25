"use strict";

/**
 * ConversationService — backend-persisted AI conversation history.
 *
 * Saves and retrieves AI chat sessions from the MobileAI backend so users
 * can browse and continue previous conversations across app launches.
 *
 * All methods are no-ops when analyticsKey is absent (graceful degradation).
 * All network errors are silently swallowed — history is best-effort and must
 * never break the core agent flow.
 */

import { ENDPOINTS } from "../config/endpoints.js";
import { createAIMessage, normalizeRichContent, richContentToPlainText } from "../core/richContent.js";
import { logger } from "../utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────

// ─── Serialization ───────────────────────────────────────────────

function toPayload(msgs) {
  return msgs.filter(m => m.role === 'user' || m.role === 'assistant').filter(m => m.previewText.trim().length > 0).map(m => ({
    role: m.role,
    content: m.content,
    previewText: m.previewText,
    timestamp: m.timestamp
  }));
}

// ─── Service ─────────────────────────────────────────────────────

/**
 * Start a new conversation on the backend.
 * Call this when the first AI response arrives in a new session.
 * Returns the backend conversationId, or null on failure.
 */
export async function startConversation({
  analyticsKey,
  userId,
  deviceId,
  messages
}) {
  if (!analyticsKey) return null;
  const payload = toPayload(messages);
  if (!payload.length) return null;
  try {
    const res = await fetch(ENDPOINTS.conversations, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analyticsKey,
        userId: userId || undefined,
        deviceId: deviceId || undefined,
        messages: payload
      })
    });
    if (!res.ok) {
      logger.warn('ConversationService', `startConversation failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    logger.info('ConversationService', `Started conversation: ${data.conversationId}`);
    return data.conversationId;
  } catch (err) {
    logger.warn('ConversationService', `startConversation error: ${err}`);
    return null;
  }
}

/**
 * Append new messages to an existing conversation.
 * Fire-and-forget — call after each exchange (debounce in caller).
 */
export async function appendMessages({
  conversationId,
  analyticsKey,
  messages
}) {
  if (!analyticsKey || !conversationId) return;
  const payload = toPayload(messages);
  if (!payload.length) return;
  try {
    const res = await fetch(ENDPOINTS.conversations, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analyticsKey,
        conversationId,
        messages: payload
      })
    });
    if (!res.ok) {
      logger.warn('ConversationService', `appendMessages failed: ${res.status}`);
    }
  } catch (err) {
    logger.warn('ConversationService', `appendMessages error: ${err}`);
  }
}

/**
 * Fetch the user's conversation list (most-recent-first).
 * Returns empty array on failure — never throws.
 */
export async function fetchConversations({
  analyticsKey,
  userId,
  deviceId,
  limit = 20
}) {
  if (!analyticsKey) return [];
  if (!userId && !deviceId) return [];
  try {
    const params = new URLSearchParams({
      analyticsKey,
      limit: String(limit)
    });
    if (userId) params.set('userId', userId);
    if (deviceId) params.set('deviceId', deviceId);
    const res = await fetch(`${ENDPOINTS.conversations}?${params.toString()}`);
    if (!res.ok) {
      logger.warn('ConversationService', `fetchConversations failed: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.conversations ?? [];
  } catch (err) {
    logger.warn('ConversationService', `fetchConversations error: ${err}`);
    return [];
  }
}

/**
 * Fetch the full message history of a single conversation.
 * Returns null on failure.
 */
export async function fetchConversation({
  conversationId,
  analyticsKey
}) {
  if (!analyticsKey || !conversationId) return null;
  try {
    const params = new URLSearchParams({
      analyticsKey
    });
    const res = await fetch(`${ENDPOINTS.conversations}/${conversationId}?${params.toString()}`);
    if (!res.ok) {
      logger.warn('ConversationService', `fetchConversation failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const msgs = (data.messages ?? []).map(m => createAIMessage({
      id: m.id,
      role: m.role,
      content: normalizeRichContent(m.content),
      previewText: m.previewText || richContentToPlainText(m.content),
      timestamp: m.timestamp
    }));
    return msgs;
  } catch (err) {
    logger.warn('ConversationService', `fetchConversation error: ${err}`);
    return null;
  }
}
//# sourceMappingURL=ConversationService.js.map