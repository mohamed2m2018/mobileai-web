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
import type { AIMessage, ConversationSummary } from '../core/types';
interface StartConversationParams {
    analyticsKey: string;
    userId?: string;
    deviceId?: string;
    messages: AIMessage[];
}
interface AppendMessagesParams {
    conversationId: string;
    analyticsKey: string;
    messages: AIMessage[];
}
interface FetchConversationsParams {
    analyticsKey: string;
    userId?: string;
    deviceId?: string;
    limit?: number;
}
interface FetchConversationParams {
    conversationId: string;
    analyticsKey: string;
}
/**
 * Start a new conversation on the backend.
 * Call this when the first AI response arrives in a new session.
 * Returns the backend conversationId, or null on failure.
 */
export declare function startConversation({ analyticsKey, userId, deviceId, messages, }: StartConversationParams): Promise<string | null>;
/**
 * Append new messages to an existing conversation.
 * Fire-and-forget — call after each exchange (debounce in caller).
 */
export declare function appendMessages({ conversationId, analyticsKey, messages, }: AppendMessagesParams): Promise<void>;
/**
 * Fetch the user's conversation list (most-recent-first).
 * Returns empty array on failure — never throws.
 */
export declare function fetchConversations({ analyticsKey, userId, deviceId, limit, }: FetchConversationsParams): Promise<ConversationSummary[]>;
/**
 * Fetch the full message history of a single conversation.
 * Returns null on failure.
 */
export declare function fetchConversation({ conversationId, analyticsKey, }: FetchConversationParams): Promise<AIMessage[] | null>;
export {};
//# sourceMappingURL=ConversationService.d.ts.map