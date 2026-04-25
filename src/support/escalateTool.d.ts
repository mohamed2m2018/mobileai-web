/**
 * Escalate tool — hands off the conversation to a human agent.
 *
 * Providers:
 * - 'mobileai' (default when analyticsKey present):
 *   POSTs to MobileAI /api/v1/escalations → gets ticketId + wsUrl
 *   Opens WebSocket via EscalationSocket → agent reply pushed in real time
 * - 'custom': fires the consumer's onEscalate callback (backward compatible)
 */
import type { ToolDefinition } from '../core/types';
import type { EscalationConfig, EscalationContext } from './types';
import { EscalationSocket } from './EscalationSocket';
export interface EscalationToolDeps {
    config: EscalationConfig;
    analyticsKey?: string;
    getContext: () => Omit<EscalationContext, 'conversationSummary'>;
    getHistory: () => Array<{
        role: string;
        content: string;
    }>;
    getToolCalls?: () => Array<{
        name: string;
        input: Record<string, unknown>;
        output: string;
    }>;
    getScreenFlow?: () => string[];
    onHumanReply?: (reply: string, ticketId?: string) => void;
    onEscalationStarted?: (ticketId: string, socket: EscalationSocket) => void;
    onTypingChange?: (isTyping: boolean) => void;
    onTicketClosed?: (ticketId?: string) => void;
    userContext?: {
        userId?: string;
        name?: string;
        email?: string;
        phone?: string;
        plan?: string;
        custom?: Record<string, string | number | boolean>;
    };
    pushToken?: string;
    pushTokenType?: 'fcm' | 'expo' | 'apns';
}
export declare function createEscalateTool(deps: EscalationToolDeps): ToolDefinition;
/** @deprecated Use createEscalateTool({ config, analyticsKey, getContext, getHistory }) */
export declare function createEscalateTool(config: EscalationConfig, getContext: () => Omit<EscalationContext, 'conversationSummary'>): ToolDefinition;
//# sourceMappingURL=escalateTool.d.ts.map