/**
 * AgentOverlay — Subtle thinking indicator shown while the AI agent is processing.
 * Includes a cancel button to stop the agent mid-execution.
 */
interface AgentOverlayProps {
    visible: boolean;
    statusText: string;
    onCancel?: () => void;
}
export declare function AgentOverlay({ visible, statusText, onCancel }: AgentOverlayProps): import("react/jsx-runtime").JSX.Element | null;
export {};
//# sourceMappingURL=AgentOverlay.d.ts.map