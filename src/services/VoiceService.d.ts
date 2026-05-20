/**
 * VoiceService — @google/genai SDK Live API connection.
 *
 * Uses the official `ai.live.connect()` method instead of raw WebSocket.
 * This fixes function calling reliability: the SDK handles protocol details
 * (binary framing, message transforms, model name prefixes) that our
 * previous raw WebSocket implementation missed.
 *
 * Handles bidirectional audio streaming between the app and Gemini:
 * - Sends PCM 16kHz 16-bit audio chunks (mic input)
 * - Receives PCM 24kHz 16-bit audio chunks (AI responses)
 * - Receives function calls (tap, navigate, etc.) for agentic actions
 * - Sends screen context (DOM text) for live mode
 */
import type { ToolDefinition } from '../core/types';
export interface VoiceServiceConfig {
    apiKey?: string;
    proxyUrl?: string;
    proxyHeaders?: Record<string, string>;
    model?: string;
    systemPrompt?: string;
    tools?: ToolDefinition[];
    /** Audio sample rate for mic input (default: 16000) */
    inputSampleRate?: number;
    /** Language for Gemini speech generation (e.g., 'en', 'ar') */
    language?: string;
}
export interface VoiceServiceCallbacks {
    onAudioResponse?: (base64Audio: string) => void;
    onToolCall?: (toolCall: {
        name: string;
        args: Record<string, any>;
        id: string;
    }) => void;
    onTranscript?: (text: string, isFinal: boolean, role: 'user' | 'model') => void;
    onStatusChange?: (status: VoiceStatus) => void;
    onError?: (error: string) => void;
    /** Called when AI turn is complete (all audio sent) */
    onTurnComplete?: () => void;
    /** Called when SDK setup is complete — safe to send screen context */
    onSetupComplete?: () => void;
}
export type VoiceStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export declare class VoiceService {
    private session;
    private config;
    private callbacks;
    lastCallbacks: VoiceServiceCallbacks | null;
    private _status;
    intentionalDisconnect: boolean;
    constructor(config: VoiceServiceConfig);
    /**
     * Connect to Gemini Live API via the official SDK.
     * Now async because `ai.live.connect()` returns a Promise.
     */
    connect(callbacks: VoiceServiceCallbacks): Promise<void>;
    disconnect(): void;
    get isConnected(): boolean;
    get currentStatus(): VoiceStatus;
    /** Send PCM audio chunk (base64 encoded) via SDK's sendRealtimeInput */
    private sendCount;
    sendAudio(base64Audio: string): void;
    /** Send text message via SDK's sendClientContent */
    sendText(text: string): void;
    /**
     * Send DOM tree as passive context during live conversation.
     * Uses turnComplete: false — the model receives context without responding.
     */
    sendScreenContext(domText: string): void;
    /** Send function call result back via SDK's sendToolResponse */
    sendFunctionResponse(name: string, id: string, result: any): void;
    /**
     * Builds function declarations from configured tools.
     * Converts BOOLEAN params to STRING (native audio model limitation).
     */
    private buildToolDeclarations;
    /**
     * Handle messages from the SDK's onmessage callback.
     * The SDK parses binary/JSON automatically — we get clean objects.
     *
     * Per official docs, tool calls come at the top level as
     * `response.toolCall.functionCalls`.
     */
    private handleSDKMessage;
    /** Process tool calls from the model */
    private handleToolCalls;
    private audioResponseCount;
    /** Process server content (audio responses, transcripts, turn events) */
    private handleServerContent;
    private setStatus;
}
//# sourceMappingURL=VoiceService.d.ts.map