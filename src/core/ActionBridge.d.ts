import React from 'react';
export interface BlockActionPayload {
    actionId: string;
    values?: Record<string, unknown>;
    sourceBlockId?: string;
}
export type BlockActionHandler = (payload: BlockActionPayload) => void | Promise<void>;
interface ActionBridgeValue {
    invoke: (payload: BlockActionPayload) => Promise<void>;
}
export declare const ActionBridgeContext: React.Context<ActionBridgeValue>;
export declare function ActionBridgeProvider({ children, handlers, }: {
    children: React.ReactNode;
    handlers?: Record<string, BlockActionHandler>;
}): import("react/jsx-runtime").JSX.Element;
export declare function useActionBridge(): ActionBridgeValue;
export {};
//# sourceMappingURL=ActionBridge.d.ts.map