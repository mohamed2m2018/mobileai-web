/**
 * AudioOutputService — AI speech playback for voice mode.
 *
 * Uses react-native-audio-api (Software Mansion) for gapless, low-latency
 * PCM playback. Decodes base64 PCM from Gemini Live API and queues it via
 * AudioBufferQueueSourceNode for seamless streaming.
 *
 * Requires: react-native-audio-api (development build only, not Expo Go)
 */
export interface AudioOutputConfig {
    sampleRate?: number;
    onPlaybackStart?: () => void;
    onPlaybackEnd?: () => void;
    onError?: (error: string) => void;
}
export declare class AudioOutputService {
    private config;
    private audioContext;
    private queueSourceNode;
    private gainNode;
    private muted;
    private isStarted;
    private chunkCount;
    constructor(config?: AudioOutputConfig);
    initialize(): Promise<boolean>;
    /** Add a base64-encoded PCM chunk from Gemini to the playback queue */
    enqueue(base64Audio: string): void;
    mute(): void;
    unmute(): void;
    get isMuted(): boolean;
    stop(): Promise<void>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=AudioOutputService.d.ts.map