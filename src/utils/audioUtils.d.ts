/**
 * Audio utility functions for PCM conversion.
 *
 * Used by AudioInputService and AudioOutputService to convert between
 * Float32 (Web Audio API) and Int16 (Gemini Live API) PCM formats.
 */
/**
 * Convert Float32Array PCM samples to Int16 PCM and encode as base64.
 * Gemini Live API expects Int16 little-endian PCM.
 */
export declare function float32ToInt16Base64(float32Data: Float32Array): string;
/**
 * Decode base64 Int16 PCM to Float32Array.
 * Used for manual decoding when decodePCMInBase64 is unavailable.
 */
export declare function base64ToFloat32(base64: string): Float32Array;
//# sourceMappingURL=audioUtils.d.ts.map