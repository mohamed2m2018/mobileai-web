/**
 * AgentErrorBoundary — Catches React rendering errors caused by AI agent actions.
 *
 * When the AI taps, scrolls, or navigates, the action itself may succeed
 * but trigger async side-effects (useEffect, onViewableItemsChanged) that
 * crash during the next React render cycle. This boundary catches those
 * errors, preventing red screen crashes and auto-recovering the UI.
 *
 * Recovery strategy:
 * 1. Catch the error via getDerivedStateFromError
 * 2. Log it and report to agent runtime via onError callback
 * 3. Auto-reset after a brief delay — remounts children cleanly
 */
import React from 'react';
interface Props {
    children: React.ReactNode;
    /** Called when an error is caught — reports back to agent runtime */
    onError?: (error: Error, componentStack?: string) => void;
    telemetryRef?: React.RefObject<any>;
}
interface State {
    hasError: boolean;
}
export declare class AgentErrorBoundary extends React.Component<Props, State> {
    state: State;
    private resetTimer;
    static getDerivedStateFromError(_error: Error): State;
    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void;
    componentDidUpdate(_prevProps: Props, prevState: State): void;
    componentWillUnmount(): void;
    render(): React.ReactNode;
}
export {};
//# sourceMappingURL=AgentErrorBoundary.d.ts.map