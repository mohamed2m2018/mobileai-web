/**
 * AgentChatBar — Floating, draggable, compressible chat widget.
 * Supports two modes: Text and Voice.
 * Does not block underlying UI natively.
 */
import type { ExecutionResult, AgentMode, ChatBarTheme, AIMessage, ConversationSummary, AIProviderName } from '../core/types';
import type { SupportTicket } from '../support/types';
import type { AIConsentConfig } from './AIConsentDialog';
interface AgentChatBarProps {
    onSend: (message: string) => void;
    onCancel?: () => void;
    isThinking: boolean;
    isActing?: boolean;
    statusText?: string;
    lastResult: ExecutionResult | null;
    language: 'en' | 'ar';
    onDismiss?: () => void;
    /** Available modes (default: ['text']) */
    availableModes?: AgentMode[];
    /** Current active mode */
    mode?: AgentMode;
    onModeChange?: (mode: AgentMode) => void;
    /** Voice controls */
    onMicToggle?: (active: boolean) => void;
    onSpeakerToggle?: (muted: boolean) => void;
    isMicActive?: boolean;
    isSpeakerMuted?: boolean;
    /** AI is currently speaking */
    isAISpeaking?: boolean;
    /** Voice WebSocket is connected */
    isVoiceConnected?: boolean;
    /** Live human agent is typing */
    /** Live human agent is typing */
    isAgentTyping?: boolean;
    /** Full session cleanup (stop mic, audio, WebSocket, live mode) */
    onStopSession?: () => void;
    /** Color theme overrides */
    theme?: ChatBarTheme;
    /** Active support tickets (for human mode) */
    tickets?: SupportTicket[];
    /** Currently selected ticket ID */
    selectedTicketId?: string | null;
    /** Callback when user selects a ticket */
    onTicketSelect?: (ticketId: string) => void;
    /** Callback when user goes back to ticket list */
    onBackToTickets?: () => void;
    /** Incremented to trigger auto-expand */
    autoExpandTrigger?: number;
    /** Chat messages for selected ticket */
    chatMessages?: AIMessage[];
    /** The user's original typed query — shown in the result bubble instead of agent reasoning */
    lastUserMessage?: string | null;
    /** Unread message counts per ticket (ticketId -> count) */
    unreadCounts?: Record<string, number>;
    /** Total unread messages across all tickets */
    totalUnread?: number;
    /** Show first-use discovery tooltip above FAB */
    showDiscoveryTooltip?: boolean;
    /** Custom discovery tooltip copy */
    discoveryTooltipMessage?: string;
    /** Called when discovery tooltip is dismissed */
    onTooltipDismiss?: () => void;
    /** Past conversation sessions fetched from backend */
    conversations?: ConversationSummary[];
    /** True while history is loading from backend */
    isLoadingHistory?: boolean;
    /** Called when user taps a past conversation */
    onConversationSelect?: (conversationId: string) => void;
    /** Called when user starts a new conversation */
    onNewConversation?: () => void;
    pendingApprovalQuestion?: string | null;
    onPendingApprovalAction?: (action: 'approve' | 'reject') => void;
    renderMode?: 'default' | 'android-native-window';
    onWindowMetricsChange?: (metrics: {
        x: number;
        y: number;
        width: number;
        height: number;
    }) => void;
    windowMetrics?: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    consentVisible?: boolean;
    consentProvider?: AIProviderName;
    consentConfig?: AIConsentConfig;
    onConsentApprove?: () => void | Promise<void>;
    onConsentDecline?: () => void;
}
export declare function AgentChatBar({ onSend, onCancel, isThinking, isActing, statusText, lastResult, language, availableModes, mode, onModeChange, onMicToggle, onSpeakerToggle, isMicActive, isSpeakerMuted, isAISpeaking, isVoiceConnected, onStopSession, theme, tickets, selectedTicketId, onTicketSelect, autoExpandTrigger, unreadCounts, totalUnread, showDiscoveryTooltip, discoveryTooltipMessage, onTooltipDismiss, chatMessages, conversations, isLoadingHistory, onConversationSelect, onNewConversation, pendingApprovalQuestion, onPendingApprovalAction, renderMode, onWindowMetricsChange, windowMetrics, consentVisible, consentProvider, consentConfig, onConsentApprove, onConsentDecline, }: AgentChatBarProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AgentChatBar.d.ts.map