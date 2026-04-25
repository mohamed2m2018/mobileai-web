/**
 * SupportChatModal — full-screen chat modal for human support conversations.
 * Shows message history (bubbles with timestamps/avatars), typing indicator, and reply input.
 * Supports native swipe-down-to-dismiss on iOS pageSheet.
 */
import type { AIMessage } from '../core/types';
interface SupportChatModalProps {
    visible: boolean;
    messages: AIMessage[];
    onSend: (message: string) => void;
    onClose: () => void;
    isAgentTyping?: boolean;
    isThinking?: boolean;
    /** Optional: externally controlled scroll trigger. Pass when messages update externally. */
    scrollToEndTrigger?: number;
    /** Ticket status — when 'closed' or 'resolved', input is hidden and a banner is shown. */
    ticketStatus?: string;
}
export declare function SupportChatModal({ visible, messages, onSend, onClose, isAgentTyping, isThinking, scrollToEndTrigger, ticketStatus, }: SupportChatModalProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SupportChatModal.d.ts.map