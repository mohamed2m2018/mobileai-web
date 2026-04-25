"use strict";

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

import { logger } from "../utils/logger.js";
import { float32ToInt16Base64 } from "../utils/audioUtils.js";

// ─── Types ─────────────────────────────────────────────────────

// ─── Service ───────────────────────────────────────────────────

export class AudioInputService {
  status = 'idle';
  recorder = null;

  // Auto-recovery: detect when mic session dies after audio playback.
  // This is a react-native-audio-api bug where AudioRecorder loses mic access
  // after AudioBufferQueueSourceNode plays audio (audio session conflict).
  consecutiveSilentFrames = 0;
  isRecovering = false;
  static SILENT_THRESHOLD = 0.01;
  static SILENT_FRAMES_BEFORE_RESTART = 15;
  constructor(config) {
    this.config = config;
  }

  // ─── Lifecycle ─────────────────────────────────────────────

  async start() {
    try {
      // Lazy-load react-native-audio-api (optional peer dependency)
      let audioApi;
      try {
        // Static require — Metro needs a literal string for bundling.
        audioApi = require('react-native-audio-api');
      } catch {
        const msg = 'Voice mode requires react-native-audio-api. Install with: npm install react-native-audio-api';
        logger.warn('AudioInput', msg);
        this.config.onError?.(msg);
        return false;
      }

      // Request mic permission (Android)
      try {
        const {
          Platform,
          PermissionsAndroid
        } = require('react-native');
        if (Platform.OS === 'android') {
          const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          if (result !== PermissionsAndroid.RESULTS.GRANTED) {
            logger.warn('AudioInput', 'Microphone permission denied');
            this.config.onPermissionDenied?.();
            return false;
          }
        }
      } catch {
        // Permission check failed — continue and let native layer handle it
      }

      // Create AudioRecorder
      this.recorder = new audioApi.AudioRecorder();
      this.consecutiveSilentFrames = 0;
      const sampleRate = this.config.sampleRate || 16000;
      const bufferLength = this.config.bufferLength || 4096;

      // Register audio data callback
      let frameCount = 0;
      this.recorder.onAudioReady({
        sampleRate,
        bufferLength,
        channelCount: 1
      }, event => {
        frameCount++;
        try {
          // event.buffer is an AudioBuffer — get Float32 channel data
          const float32Data = event.buffer.getChannelData(0);

          // Measure peak amplitude for diagnostics + silent detection
          let maxAmp = 0;
          for (let i = 0; i < float32Data.length; i++) {
            const abs = Math.abs(float32Data[i] || 0);
            if (abs > maxAmp) maxAmp = abs;
          }

          // Diagnostic: log amplitude on first 5 frames, then every 10th
          if (frameCount <= 5 || frameCount % 10 === 0) {
            logger.info('AudioInput', `🔬 Frame #${frameCount}: maxAmp=${maxAmp.toFixed(6)}, samples=${float32Data.length}`);
          }

          // ─── Auto-Recovery: Silent mic detection ─────────────
          // After audio playback, react-native-audio-api's AudioRecorder
          // can lose its mic session (all-zero frames). Detect this and
          // restart the recorder to re-acquire the audio session.
          if (maxAmp < AudioInputService.SILENT_THRESHOLD) {
            this.consecutiveSilentFrames++;
            if (this.consecutiveSilentFrames >= AudioInputService.SILENT_FRAMES_BEFORE_RESTART && !this.isRecovering) {
              this.isRecovering = true;
              logger.warn('AudioInput', `⚠️ ${this.consecutiveSilentFrames} silent frames — restarting recorder...`);
              this.restartRecorder().then(() => {
                this.isRecovering = false;
                this.consecutiveSilentFrames = 0;
                logger.info('AudioInput', '✅ Recorder restarted — mic session re-acquired');
              }).catch(err => {
                this.isRecovering = false;
                logger.error('AudioInput', `❌ Recorder restart failed: ${err?.message || err}`);
              });
              return; // Skip this frame
            }
          } else {
            // Got real audio — reset counter
            if (this.consecutiveSilentFrames > 5) {
              logger.info('AudioInput', `🎤 Mic recovered after ${this.consecutiveSilentFrames} silent frames`);
            }
            this.consecutiveSilentFrames = 0;
          }
          const base64Chunk = float32ToInt16Base64(float32Data);
          if (frameCount <= 5 || frameCount % 10 === 0) {
            logger.info('AudioInput', `🎤 Frame #${frameCount}: chunk=${base64Chunk.length} chars, calling onAudioChunk...`);
          }
          this.config.onAudioChunk(base64Chunk);
        } catch (err) {
          logger.error('AudioInput', `Frame processing error: ${err.message}`);
        }
      });

      // Register error callback
      this.recorder.onError(error => {
        logger.error('AudioInput', `Recorder error: ${error.message || error}`);
        this.config.onError?.(error.message || String(error));
      });

      // Start recording
      this.recorder.start();
      this.status = 'recording';
      logger.info('AudioInput', `Streaming started (${sampleRate}Hz, bufLen=${bufferLength})`);
      return true;
    } catch (error) {
      logger.error('AudioInput', `Failed to start: ${error.message}`);
      this.config.onError?.(error.message);
      return false;
    }
  }
  async stop() {
    try {
      if (this.recorder && this.status !== 'idle') {
        this.recorder.clearOnAudioReady();
        this.recorder.clearOnError();
        this.recorder.stop();
      }
      this.recorder = null;
      this.status = 'idle';
      this.consecutiveSilentFrames = 0;
      logger.info('AudioInput', 'Streaming stopped');
    } catch (error) {
      logger.error('AudioInput', `Failed to stop: ${error.message}`);
      this.recorder = null;
      this.status = 'idle';
    }
  }

  // ─── Auto-Recovery ─────────────────────────────────────────

  /**
   * Restart the recorder to re-acquire the audio session.
   * Fixes react-native-audio-api bug where AudioRecorder loses mic access
   * after AudioBufferQueueSourceNode plays audio.
   */
  async restartRecorder() {
    logger.info('AudioInput', '🔄 Restarting recorder for mic recovery...');
    await this.stop();
    // Brief pause to let the audio system release resources
    await new Promise(resolve => setTimeout(resolve, 300));
    const ok = await this.start();
    if (!ok) {
      throw new Error('Recorder restart failed');
    }
  }

  // ─── Status ───────────────────────────────────────────────

  get isRecording() {
    return this.status === 'recording';
  }
  get currentStatus() {
    return this.status;
  }
}
//# sourceMappingURL=AudioInputService.js.map