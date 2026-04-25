/**
 * EscalationSocket — manages a WebSocket connection to the MobileAI platform
 * for receiving real-time replies from human support agents.
 *
 * Lifecycle:
 * 1. SDK calls escalate_to_human → POST /api/v1/escalations → gets { ticketId, wsUrl }
 * 2. EscalationSocket.connect(wsUrl) opens a WS connection
 * 3. Platform pushes { type: 'reply', ticketId, reply } when agent responds
 * 4. onReply callback fires → shown in chat UI as "👤 Human Agent: <reply>"
 * 5. disconnect() on chat close / unmount
 *
 * Handles:
 * - Server heartbeat pings (type: 'ping') — acknowledged silently
 * - Auto-reconnect on unexpected close (max 3 attempts, exponential backoff)
 * - Message queue — buffers sendText calls while connecting, flushes on open
 */
export type SocketReplyHandler = (reply: string, ticketId?: string) => void;
interface EscalationSocketOptions {
    onReply: SocketReplyHandler;
    onError?: (error: Event) => void;
    onTypingChange?: (isTyping: boolean) => void;
    onTicketClosed?: (ticketId?: string) => void;
    maxReconnectAttempts?: number;
}
export declare class EscalationSocket {
    private ws;
    private wsUrl;
    private reconnectAttempts;
    private reconnectTimer;
    private intentionalClose;
    private _hasErrored;
    /** Messages buffered while the socket is connecting / reconnecting. */
    private messageQueue;
    private readonly onReply;
    private readonly onError?;
    private readonly onTypingChange?;
    private readonly onTicketClosed?;
    private readonly maxReconnectAttempts;
    constructor(options: EscalationSocketOptions);
    connect(wsUrl: string): void;
    /** True if the underlying WebSocket is open and ready to send. */
    get isConnected(): boolean;
    /** True if the socket encountered an error (and may not be reliable to reuse). */
    get hasErrored(): boolean;
    /**
     * Send a text message to the live agent.
     *
     * If the socket is currently connecting or reconnecting, the message is
     * buffered and sent automatically once the connection is established.
     * Returns `true` in both cases (connected send + queued send).
     * Returns `false` only if the socket has no URL (was never connected).
     */
    sendText(text: string): boolean;
    sendTypingStatus(isTyping: boolean): boolean;
    disconnect(): void;
    private flushQueue;
    private openConnection;
    private scheduleReconnect;
}
export {};
//# sourceMappingURL=EscalationSocket.d.ts.map