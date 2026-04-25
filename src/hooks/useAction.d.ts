/**
 * useAction — Register non-UI actions for the AI agent.
 * useData   — Register async app data sources for the AI agent.
 * useAI     — Bridge hook to read AIAgent's state (send, isLoading, status).
 *
 * Both hooks consume AgentContext, which is provided by <AIAgent>.
 */
import React from 'react';
import type { AgentRuntime } from '../core/AgentRuntime';
import type { ExecutionResult, AIMessage } from '../core/types';
export interface AgentContextValue {
    runtime: AgentRuntime | null;
    /** Send a text message to the agent (same as typing in the chat bar). */
    send: (message: string, options?: {
        onResult?: (result: ExecutionResult) => void;
    }) => void;
    /** Whether the agent is currently executing (thinking / tapping / navigating). */
    isLoading: boolean;
    /** Live status text — e.g. "Analyzing screen...", "Tapping element 3..." */
    status: string;
    /** The result of the last completed execution. */
    lastResult: ExecutionResult | null;
    /** The full conversation history for custom chat UIs. */
    messages: AIMessage[];
    /** Clear conversation history. */
    clearMessages: () => void;
    /** Cancel currently running task. */
    cancel: () => void;
}
export declare const AgentContext: React.Context<AgentContextValue>;
import type { ActionParameterDef, DataFieldDef } from '../core/types';
/**
 * Register a non-UI action that the AI agent can call by name.
 *
 * The handler is always kept fresh via an internal ref — no stale closure bugs,
 * even when it captures mutable state like cart contents or form values.
 *
 * The optional `deps` array controls when the action is *re-registered* (i.e. when
 * `name`, `description`, or `parameters` need to change at runtime). You rarely
 * need this — the handler is always up-to-date regardless.
 *
 * @example Basic (handler always fresh — no deps needed)
 * ```tsx
 * const { cart } = useCart();
 * useAction('checkout', 'Place the order', {}, async () => {
 *   if (cart.length === 0) return { success: false, message: 'Cart is empty' };
 *   // cart is always current — no stale closure
 * });
 * ```
 *
 * @example Dynamic description (re-register when item count changes)
 * ```tsx
 * useAction(
 *   'checkout',
 *   `Place the order (${cart.length} items in cart)`,
 *   {},
 *   handler,
 *   [cart.length],   // re-register so the AI sees the updated description
 * );
 * ```
 */
export declare function useAction(name: string, description: string, parameters: Record<string, string | ActionParameterDef>, handler: (args: Record<string, any>) => any, deps?: React.DependencyList): void;
/**
 * Register an async data source the AI can query for structured app data.
 *
 * Use this for external APIs, live product catalogs, recommendation feeds,
 * order status endpoints, inventory snapshots, or any other data that is
 * easier to fetch directly than to infer from the current screen.
 *
 * The handler may be async and will be awaited by the AI runtime.
 */
export declare function useData(name: string, description: string, schema: Record<string, string | DataFieldDef> | undefined, handler: (context: {
    query: string;
    screenName: string;
}) => Promise<unknown> | unknown, deps?: React.DependencyList): void;
/**
 * Bridge hook — reads the parent <AIAgent>'s state.
 *
 * Must be used inside an <AIAgent> tree.
 *
 * ```tsx
 * <AIAgent showChatBar={false} apiKey="..." navRef={navRef}>
 *   <MyApp />
 * </AIAgent>
 *
 * // Inside any screen:
 * const { send, isLoading, status, lastResult } = useAI({ enableUIControl: false }); // knowledge-only for this screen
 * ```
 */
export declare function useAI(options?: {
    /**
     * Dynamically override the global `enableUIControl` setting.
     * Useful to force "knowledge-only" mode for a specific screen without changing root layout props.
     */
    enableUIControl?: boolean;
    /**
     * Override the global `onResult` callback for tasks triggered from this hook.
     * Useful for navigating the user back to this specific screen after the AI finishes.
     */
    onResult?: (result: ExecutionResult) => void;
}): {
    /** Send a message to the AI agent. */
    send: (message: string) => void;
    /** Whether the agent is currently executing. */
    isLoading: boolean;
    /** Live status text (e.g. "Navigating to profile..."). */
    status: string;
    /** Result of the last completed execution. */
    lastResult: ExecutionResult | null;
    /** The full conversation history. */
    messages: AIMessage[];
    /** Clear the conversation history. */
    clearMessages: () => void;
    /** Cancel the currently running task. The current step will complete before stopping. */
    cancel: () => void;
};
//# sourceMappingURL=useAction.d.ts.map