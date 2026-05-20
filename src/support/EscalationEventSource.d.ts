/**
 * EscalationEventSource — SSE client using fetch + ReadableStream.
 *
 * Uses only the fetch API (available in all React Native runtimes)
 * to consume Server-Sent Events — no EventSource polyfill needed.
 * Provides a reliable, auto-reconnecting channel for server-push
 * events like `ticket_closed` that complements the bidirectional
 * WebSocket used for chat.
 *
 * Lifecycle:
 * 1. SDK calls connect() → fetch with streaming response
 * 2. Server holds connection open, pushes `ticket_closed` when agent resolves
 * 3. On disconnect, auto-reconnects with exponential backoff (max 5 attempts)
 * 4. If ticket is already closed, server responds immediately with the event
 */
export interface EscalationEventSourceOptions {
    url: string;
    onTicketClosed?: (ticketId: string) => void;
    onConnected?: (ticketId: string) => void;
    onError?: (error: Error) => void;
}
export declare class EscalationEventSource {
    private abortController;
    private intentionalClose;
    private reconnectAttempts;
    private reconnectTimer;
    private readonly maxReconnectAttempts;
    private readonly options;
    constructor(options: EscalationEventSourceOptions);
    connect(): void;
    disconnect(): void;
    private openConnection;
    private readStream;
    private readFullResponse;
    private handleEvent;
    private scheduleReconnect;
}
//# sourceMappingURL=EscalationEventSource.d.ts.map