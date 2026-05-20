"use strict";

/**
 * useAction — Register non-UI actions for the AI agent.
 * useData   — Register async app data sources for the AI agent.
 * useAI     — Bridge hook to read AIAgent's state (send, isLoading, status).
 *
 * Both hooks consume AgentContext, which is provided by <AIAgent>.
 */

import { useEffect, useContext, createContext, useCallback, useRef } from 'react';

// ─── Context ──────────────────────────────────────────────────

const DEFAULT_CONTEXT = {
  runtime: null,
  send: () => {},
  isLoading: false,
  status: '',
  lastResult: null,
  messages: [],
  clearMessages: () => {},
  cancel: () => {}
};
export const AgentContext = /*#__PURE__*/createContext(DEFAULT_CONTEXT);
import { actionRegistry } from "../core/ActionRegistry.js";
import { dataRegistry } from "../core/DataRegistry.js";
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
export function useAction(name, description, parameters, handler, deps) {
  // Keep a ref to the latest handler so the registered action always calls
  // the current closure — even without re-registering the action.
  // This is the canonical React pattern for "always-fresh callbacks"
  // (used by react-use, ahooks, TanStack Query internally).
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  // Registration effect — only re-runs when name/description/parameters change,
  // OR when the consumer explicitly passes deps (e.g. for a dynamic description).
  useEffect(() => {
    actionRegistry.register({
      name,
      description,
      parameters,
      // Delegate to the ref — always calls the latest handler.
      handler: args => handlerRef.current(args)
    });
    return () => {
      actionRegistry.unregister(name);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ? [name, description, ...deps] : [name, description]);
}

/**
 * Register an async data source the AI can query for structured app data.
 *
 * Use this for external APIs, live product catalogs, recommendation feeds,
 * order status endpoints, inventory snapshots, or any other data that is
 * easier to fetch directly than to infer from the current screen.
 *
 * The handler may be async and will be awaited by the AI runtime.
 */
export function useData(name, description, schema, handler, deps) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    dataRegistry.register({
      name,
      description,
      schema,
      handler: context => handlerRef.current(context)
    });
    return () => {
      dataRegistry.unregister(name);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps ? [name, description, ...deps] : [name, description]);
}

// ─── useAI ────────────────────────────────────────────────────

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
export function useAI(options) {
  const ctx = useContext(AgentContext);
  useEffect(() => {
    if (options?.enableUIControl !== undefined && ctx.runtime) {
      ctx.runtime.setUIControlOverride(options.enableUIControl);

      // Cleanup: revert to global config when unmounted
      return () => {
        ctx.runtime?.setUIControlOverride(undefined);
      };
    }
    return undefined;
  }, [options?.enableUIControl, ctx.runtime]);

  // Track the latest onResult callback in a ref to keep `send`'s identity perfectly stable.
  // This prevents infinite render loops if `send` is used as a dependency in child useEffects.
  const onResultRef = useRef(options?.onResult);
  useEffect(() => {
    onResultRef.current = options?.onResult;
  }, [options?.onResult]);
  const send = useCallback(message => {
    ctx.send(message, {
      onResult: onResultRef.current
    });
  }, [ctx]);
  return {
    /** Send a message to the AI agent. */
    send,
    /** Whether the agent is currently executing. */
    isLoading: ctx.isLoading,
    /** Live status text (e.g. "Navigating to profile..."). */
    status: ctx.status,
    /** Result of the last completed execution. */
    lastResult: ctx.lastResult,
    /** The full conversation history. */
    messages: ctx.messages,
    /** Clear the conversation history. */
    clearMessages: ctx.clearMessages,
    /** Cancel the currently running task. The current step will complete before stopping. */
    cancel: ctx.cancel
  };
}
//# sourceMappingURL=useAction.js.map