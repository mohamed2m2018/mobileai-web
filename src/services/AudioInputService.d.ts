/**
 * AudioInputService — Real-time microphone capture for voice mode.
 *
 * Uses react-native-audio-api (Software Mansion) AudioRecorder for native
 * PCM streaming from the microphone. Each chunk is converted from Float32
 * to Int16 PCM and base64-encoded for the Gemini Live API.
 *
 * Echo cancellation is handled at the OS/hardware level via
 * react-native-incall-manager (VOICE_COMMUNICATION mode) — not in JS.
 *
 * Requires: react-native-audio-api (development build only, not Expo Go)
 */
export interface AudioInputConfig {
    sampleRate?: number;
    /** Number of samples per callback buffer (default: 4096) */
    bufferLength?: number;
    /** Callback with base64 PCM audio chunk */
    onAudioChunk: (base64Audio: string) => void;
    onError?: (error: string) => void;
    onPermissionDenied?: () => void;
}
type RecordingStatus = 'idle' | 'recording' | 'paused';
export declare class AudioInputService {
    private config;
    private status;
    private recorder;
    private consecutiveSilentFrames;
    private isRecovering;
    private static readonly SILENT_THRESHOLD;
    private static readonly SILENT_FRAMES_BEFORE_RESTART;
    constructor(config: AudioInputConfig);
    start(): Promise<boolean>;
    stop(): Promise<void>;
    /**
     * Restart the recorder to re-acquire the audio session.
     * Fixes react-native-audio-api bug where AudioRecorder loses mic access
     * after AudioBufferQueueSourceNode plays audio.
     */
    private restartRecorder;
    get isRecording(): boolean;
    get currentStatus(): RecordingStatus;
}
export {};
//# sourceMappingURL=AudioInputService.d.ts.map