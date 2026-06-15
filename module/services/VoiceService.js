"use strict";

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

// @google/genai is lazy-loaded only when voice actually connects, so it stays
// out of the main bundle (~266 KB). The CDN build sets globalThis.MOBILEAI_GENAI_URL
// to a CDN ESM URL; npm consumers resolve the bare specifier from their own dep.
let _genaiPromise;
function loadGenAI() {
  if (!_genaiPromise) {
    const url = (typeof globalThis !== 'undefined' && globalThis.MOBILEAI_GENAI_URL) || null;
    _genaiPromise = url ? import(/* @vite-ignore */ url) : import('@google/genai/web');
  }
  return _genaiPromise;
}
import { logger } from "../utils/logger.js";

// ─── Types ─────────────────────────────────────────────────────

// ─── Constants ─────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';
const DEFAULT_INPUT_SAMPLE_RATE = 16000;
const USER_TURN_END_WATCHDOG_MS = 1500;
function isRecoverableLiveCloseCode(code) {
  return code === 1001;
}
function isGemini31LiveModel(model) {
  return /gemini-3\.1-.*live/i.test(model);
}
// The @google/genai SDK builds the Live WebSocket URL from an http(s) baseUrl;
// callers may pass a ws(s):// proxy URL, so normalize the scheme.
function normalizeSdkBaseUrl(url) {
  if (typeof url !== 'string') return url;
  if (url.startsWith('ws://')) return `http://${url.slice('ws://'.length)}`;
  if (url.startsWith('wss://')) return `https://${url.slice('wss://'.length)}`;
  return url;
}

// ─── Service ───────────────────────────────────────────────────

export class VoiceService {
  session = null;
  callbacks = {};
  lastCallbacks = null;
  _status = 'disconnected';
  intentionalDisconnect = false;
  transcriptBuffers = {
    user: '',
    model: ''
  };
  userTurnEndWatchdog = null;
  constructor(config) {
    this.config = config;
  }

  // The @google/genai Live SDK can reject with plain objects / Close/ErrorEvents
  // that have no `.message`, so normalize to a readable string for the UI.
  describeError(error) {
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
    if (error && typeof error === 'object') {
      try {
        return JSON.stringify(error, Object.getOwnPropertyNames(error));
      } catch {
        return String(error);
      }
    }
    return 'SDK connection error';
  }

  // ─── Connection ────────────────────────────────────────────

  /**
   * Connect to Gemini Live API via the official SDK.
   * Now async because `ai.live.connect()` returns a Promise.
   */
  async connect(callbacks) {
    if (this.session) {
      logger.info('VoiceService', 'Already connected');
      return;
    }
    this.callbacks = callbacks;
    this.lastCallbacks = callbacks;
    this.setStatus('connecting');
    this.intentionalDisconnect = false;
    const model = this.config.model || DEFAULT_MODEL;
    logger.info('VoiceService', `Connecting via SDK (model: ${model})`);
    try {
      const genAiConfig = {};
      if (this.config.proxyUrl) {
        // The @google/genai SDK sends apiKey as ?key=<value> in the WebSocket URL.
        // For HTTP text proxy, the Authorization header carries the secret key.
        // For WebSocket voice proxy, browser WS APIs don't support custom headers —
        // the only way to pass auth is via the URL query string.
        // So we extract the real secret key from proxyHeaders and use it as apiKey,
        // which the SDK will append as ?key=<secret> in the WS URL.
        // Our proxy reads it there, validates it, then replaces it with the real
        // Gemini API key before forwarding upstream.
        const authHeader = this.config.proxyHeaders?.['Authorization'] ?? this.config.proxyHeaders?.['authorization'];
        const secretKey = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : authHeader ?? 'proxy-key';
        const sdkBaseUrl = normalizeSdkBaseUrl(this.config.proxyUrl);
        genAiConfig.apiKey = secretKey;
        genAiConfig.httpOptions = {
          baseUrl: sdkBaseUrl,
          headers: this.config.proxyHeaders || {}
        };
        logger.info('VoiceService', `Using proxy base URL: ${sdkBaseUrl}`);
      } else if (this.config.apiKey) {
        genAiConfig.apiKey = this.config.apiKey;
      } else {
        throw new Error('[twomilia] Must provide apiKey or proxyUrl');
      }
      const {
        GoogleGenAI,
        Modality,
        ThinkingLevel
      } = await loadGenAI();
      const ai = new GoogleGenAI(genAiConfig);
      const toolDeclarations = this.buildToolDeclarations();

      // Build SDK config matching the official docs pattern
      const sdkConfig = {
        responseModalities: [Modality.AUDIO],
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
            endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
            silenceDurationMs: 700,
            prefixPaddingMs: 100
          },
          turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY'
        }
      };
      if (isGemini31LiveModel(model)) {
        sdkConfig.thinkingConfig = {
          thinkingLevel: ThinkingLevel?.MINIMAL ?? 'MINIMAL'
        };
      }

      // Enable transcription for debugging and UX
      sdkConfig.inputAudioTranscription = {};
      sdkConfig.outputAudioTranscription = {};
      logger.info('VoiceService', 'Transcription enabled');
      if (this.config.systemPrompt) {
        sdkConfig.systemInstruction = {
          parts: [{
            text: this.config.systemPrompt
          }]
        };
      }
      if (toolDeclarations.length > 0) {
        sdkConfig.tools = [{
          functionDeclarations: toolDeclarations
        }];
      }

      // FULL CONFIG DUMP — see exactly what we send to SDK
      const configDump = JSON.stringify({
        ...sdkConfig,
        systemInstruction: sdkConfig.systemInstruction ? '(present)' : '(none)',
        tools: sdkConfig.tools ? `${toolDeclarations.length} declarations` : '(none)'
      });
      logger.info('VoiceService', `📋 SDK config: ${configDump}`);
      logger.info('VoiceService', `📋 Tool names: ${toolDeclarations.map(t => t.name).join(', ')}`);
      const session = await ai.live.connect({
        model: model,
        config: sdkConfig,
        callbacks: {
          onopen: () => {
            logger.info('VoiceService', '✅ SDK session connected');
            this.setStatus('connected');
          },
          onmessage: message => {
            this.handleSDKMessage(message);
          },
          onerror: error => {
            const errDetail = error ? JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 500) : 'null';
            logger.error('VoiceService', `SDK error: ${errDetail}`);
            this.setStatus('error');
            this.callbacks.onError?.(this.describeError(error));
          },
          onclose: event => {
            const closeDetail = event ? JSON.stringify(event, Object.getOwnPropertyNames(event)).substring(0, 500) : 'null';
            if (this.intentionalDisconnect) {
              logger.info('VoiceService', `SDK session closed (intentional)`);
            } else if (isRecoverableLiveCloseCode(event?.code)) {
              logger.warn('VoiceService', `SDK session closed recoverably — code: ${event?.code}, reason: ${event?.reason}, detail: ${closeDetail}`);
            } else {
              logger.error('VoiceService', `SDK session closed UNEXPECTEDLY — code: ${event?.code}, reason: ${event?.reason}, detail: ${closeDetail}`);
              this.callbacks.onError?.(`Connection lost (code: ${event?.code || 'unknown'})`);
            }
            this.clearUserTurnEndWatchdog();
            this.session = null;
            this.setStatus('disconnected');
          }
        }
      });
      this.session = session;
      logger.info('VoiceService', 'SDK session established');
    } catch (error) {
      const message = this.describeError(error);
      logger.error('VoiceService', `Connection failed: ${message}`);
      this.setStatus('error');
      this.callbacks.onError?.(message || 'Failed to connect');
    }
  }
  disconnect() {
    this.clearUserTurnEndWatchdog();
    if (this.session) {
      logger.info('VoiceService', 'Disconnecting (intentional)...');
      this.intentionalDisconnect = true;
      this.session.close();
      this.session = null;
      this.setStatus('disconnected');
    }
  }
  get isConnected() {
    return this.session !== null && this._status === 'connected';
  }
  get currentStatus() {
    return this._status;
  }

  // ─── Send Audio ────────────────────────────────────────────

  /** Send PCM audio chunk (base64 encoded) via SDK's sendRealtimeInput */
  sendCount = 0;
  sendAudio(base64Audio) {
    this.sendCount++;
    if (!this.isConnected || !this.session) {
      if (this.sendCount % 20 === 0) {
        logger.warn('VoiceService', `sendAudio #${this.sendCount} DROPPED — not connected`);
      }
      return;
    }
    const mimeType = `audio/pcm;rate=${this.config.inputSampleRate || DEFAULT_INPUT_SAMPLE_RATE}`;

    // DEBUG: log every send call
    if (this.sendCount <= 5 || this.sendCount % 10 === 0) {
      logger.info('VoiceService', `📡 sendAudio #${this.sendCount}: len=${base64Audio.length}, mime=${mimeType}, preview=${base64Audio.substring(0, 30)}...`);
    }
    try {
      this.session.sendRealtimeInput({
        audio: {
          data: base64Audio,
          mimeType
        }
      });
      // Log every 50th successful send to confirm data is reaching WebSocket
      if (this.sendCount % 50 === 0) {
        logger.info('VoiceService', `✅ sendAudio #${this.sendCount} OK — session.isOpen=${!!this.session}`);
      }
    } catch (error) {
      logger.error('VoiceService', `❌ sendAudio EXCEPTION: ${error.message}\n${error.stack?.substring(0, 300)}`);
      this.session = null;
      this.setStatus('disconnected');
    }
  }

  /**
   * Explicitly mark the current realtime audio stream as ended.
   * With automatic activity detection enabled, this nudges Gemini Live to
   * close the current user turn; the next audio chunk reopens the stream.
   */
  sendAudioStreamEnd() {
    if (!this.isConnected || !this.session) return;
    try {
      this.session.sendRealtimeInput({
        audioStreamEnd: true
      });
      logger.info('VoiceService', '📤 Audio stream end sent');
    } catch (error) {
      logger.error('VoiceService', `sendAudioStreamEnd failed: ${error.message}`);
    }
  }

  // ─── Send Text ─────────────────────────────────────────────

  /** Send text message to the active Live model. */
  sendText(text) {
    if (!this.isConnected || !this.session) return;
    logger.info('VoiceService', `🗣️ USER (text): "${text}"`);
    try {
      if (isGemini31LiveModel(this.config.model || DEFAULT_MODEL)) {
        this.session.sendRealtimeInput({
          text
        });
      } else {
        this.session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{
              text
            }]
          }],
          turnComplete: true
        });
      }
    } catch (error) {
      logger.error('VoiceService', `sendText failed: ${error.message}`);
    }
  }

  /**
   * Send DOM tree as passive context during live conversation.
   */
  sendScreenContext(domText) {
    if (!this.isConnected || !this.session) return;
    try {
      if (isGemini31LiveModel(this.config.model || DEFAULT_MODEL)) {
        this.session.sendRealtimeInput({
          text: domText
        });
      } else {
        this.session.sendClientContent({
          turns: [{
            role: 'user',
            parts: [{
              text: domText
            }]
          }],
          turnComplete: false
        });
      }
      logger.info('VoiceService', `📤 Screen context sent (${domText.length} chars)`);
    } catch (error) {
      logger.error('VoiceService', `sendScreenContext failed: ${error.message}`);
    }
  }

  // ─── Send Function Response ────────────────────────────────

  /** Send function call result back via SDK's sendToolResponse */
  sendFunctionResponse(name, id, result) {
    if (!this.isConnected || !this.session) return;
    logger.info('VoiceService', `📤 Sending tool response for ${name} (id=${id})`);
    try {
      this.session.sendToolResponse({
        functionResponses: [{
          name,
          id,
          response: result
        }]
      });
    } catch (error) {
      logger.error('VoiceService', `sendFunctionResponse failed: ${error.message}`);
    }
  }

  // ─── Internal: Tool Declarations ───────────────────────────

  /**
   * Builds function declarations from configured tools.
   * Converts BOOLEAN params to STRING (native audio model limitation).
   */
  buildToolDeclarations() {
    if (!this.config.tools?.length) return [];
    const validTools = this.config.tools.filter(t => t.name !== 'capture_screenshot');
    if (validTools.length === 0) return [];
    return validTools.map(tool => {
      const hasParams = Object.keys(tool.parameters || {}).length > 0;
      const functionDecl = {
        name: tool.name,
        description: tool.description
      };
      if (hasParams) {
        functionDecl.parameters = {
          type: 'OBJECT',
          properties: Object.fromEntries(Object.entries(tool.parameters).map(([key, param]) => {
            let paramType = param.type.toUpperCase();
            let desc = param.description;
            if (paramType === 'BOOLEAN') {
              paramType = 'STRING';
              desc = `${desc} (use "true" or "false")`;
            }
            return [key, {
              type: paramType,
              description: desc
            }];
          })),
          required: Object.entries(tool.parameters).filter(([, param]) => param.required).map(([key]) => key)
        };
      }
      return functionDecl;
    });
  }

  // ─── Internal: Message Handling ────────────────────────────

  /**
   * Handle messages from the SDK's onmessage callback.
   * The SDK parses binary/JSON automatically — we get clean objects.
   *
   * Per official docs, tool calls come at the top level as
   * `response.toolCall.functionCalls`.
   */
  handleSDKMessage(message) {
    try {
      // RAW MESSAGE DUMP — full session visibility
      const msgKeys = Object.keys(message || {}).join(', ');
      logger.info('VoiceService', `📨 SDK message keys: [${msgKeys}]`);

      // Full raw dump for non-audio messages (audio is too large)
      if (!message.serverContent?.modelTurn?.parts?.some(p => p.inlineData)) {
        const rawDump = JSON.stringify(message).substring(0, 1000);
        logger.info('VoiceService', `📨 RAW: ${rawDump}`);
      }

      // Server content (audio, text, transcripts, turn events). Gemini 3.1 can
      // combine multiple content parts in one event, so never return early.
      if (message.serverContent) {
        this.handleServerContent(message.serverContent);
      }

      // Tool calls — top-level (per official docs)
      if (message.toolCall?.functionCalls) {
        this.clearUserTurnEndWatchdog();
        this.handleToolCalls(message.toolCall.functionCalls);
      }

      // Setup complete acknowledgment
      if (message.setupComplete !== undefined) {
        logger.info('VoiceService', '✅ Setup complete — ready for audio');
        this.callbacks.onSetupComplete?.();
      }

      // Error messages
      if (message.error) {
        logger.error('VoiceService', `Server error: ${JSON.stringify(message.error)}`);
        this.callbacks.onError?.(message.error.message || 'Server error');
      }
    } catch (error) {
      logger.error('VoiceService', `Error handling SDK message: ${error.message}`);
    }
  }

  /** Process tool calls from the model */
  handleToolCalls(functionCalls) {
    for (const fn of functionCalls) {
      logger.info('VoiceService', `🎯 Tool call: ${fn.name}(${JSON.stringify(fn.args)}) [id=${fn.id}]`);
      this.callbacks.onToolCall?.({
        name: fn.name,
        args: fn.args || {},
        id: fn.id
      });
    }
  }
  audioResponseCount = 0;

  /** Process server content (audio responses, transcripts, turn events) */
  handleServerContent(content) {
    // Log all keys for full visibility
    const contentKeys = Object.keys(content || {}).join(', ');
    logger.debug('VoiceService', `📦 serverContent keys: [${contentKeys}]`);

    // Turn complete
    if (content.turnComplete) {
      this.clearUserTurnEndWatchdog();
      logger.info('VoiceService', `🏁 Turn complete (audioChunks sent: ${this.audioResponseCount})`);
      this.audioResponseCount = 0;
      this.flushTranscriptBuffers();
      this.callbacks.onTurnComplete?.();
    }

    // Model output parts (audio + optional thinking text)
    if (content.modelTurn?.parts) {
      if (content.modelTurn.parts.length > 0) {
        this.clearUserTurnEndWatchdog();
      }
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.audioResponseCount++;
          if (this.audioResponseCount <= 3 || this.audioResponseCount % 20 === 0) {
            logger.info('VoiceService', `🔊 Audio chunk #${this.audioResponseCount}: ${part.inlineData.data.length} b64 chars, mime=${part.inlineData.mimeType || 'unknown'}`);
          }
          this.callbacks.onAudioResponse?.(part.inlineData.data);
        }
        if (part.text) {
          logger.debug('VoiceService', `🤖 MODEL TEXT PART (not displayed as transcript): "${part.text}"`);
        }
      }
    }

    // Input transcription (user's speech-to-text)
    if (content.inputTranscription?.text) {
      logger.info('VoiceService', `🗣️ USER (voice): "${content.inputTranscription.text}"`);
      this.bufferTranscript(content.inputTranscription.text, 'user');
    }

    // Output transcription (model's speech-to-text)
    if (content.outputTranscription?.text) {
      this.clearUserTurnEndWatchdog();
      logger.info('VoiceService', `🤖 MODEL (voice): "${content.outputTranscription.text}"`);
      this.bufferTranscript(content.outputTranscription.text, 'model');
    }

    // Tool calls inside serverContent (some SDK versions deliver here)
    if (content.toolCall?.functionCalls) {
      this.clearUserTurnEndWatchdog();
      this.handleToolCalls(content.toolCall.functionCalls);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  setStatus(newStatus) {
    this._status = newStatus;
    this.callbacks.onStatusChange?.(newStatus);
  }
  bufferTranscript(text, role) {
    const incoming = this.cleanTranscriptChunk(text);
    if (!incoming) return;
    const current = this.transcriptBuffers[role];
    const combined = this.mergeTranscriptChunk(current, incoming);
    const {
      complete,
      remaining
    } = this.extractCompleteSentences(combined);
    for (const sentence of complete) {
      this.callbacks.onTranscript?.(sentence, true, role);
    }
    this.transcriptBuffers[role] = remaining;
    if (role === 'user' && complete.length > 0) {
      this.scheduleUserTurnEndWatchdog();
    }
  }
  scheduleUserTurnEndWatchdog() {
    this.clearUserTurnEndWatchdog();
    this.userTurnEndWatchdog = setTimeout(() => {
      this.userTurnEndWatchdog = null;
      if (!this.isConnected || !this.session) return;
      logger.warn('VoiceService', `No model/tool event after user transcript for ${USER_TURN_END_WATCHDOG_MS}ms — ending audio stream`);
      this.sendAudioStreamEnd();
    }, USER_TURN_END_WATCHDOG_MS);
    this.userTurnEndWatchdog?.unref?.();
  }
  clearUserTurnEndWatchdog() {
    if (!this.userTurnEndWatchdog) return;
    clearTimeout(this.userTurnEndWatchdog);
    this.userTurnEndWatchdog = null;
  }
  cleanTranscriptChunk(text) {
    return text.replace(/<ctrl\d+>/gi, '').replace(/(?:<|\[|\()(?:noise|silence|inaudible|music|laughs?|applause|crosstalk|background noise)(?:>|\]|\))/gi, '').replace(/\s+/g, ' ').trim();
  }
  mergeTranscriptChunk(current, incoming) {
    if (!current) return incoming;
    if (incoming === current || current.endsWith(incoming)) return current;
    if (incoming.startsWith(current)) return incoming;
    if (/^[,.;:!?]+$/.test(incoming)) return `${current}${incoming}`;
    if (/^[,.;:!?]/.test(incoming)) return `${current}${incoming}`;
    return `${current} ${incoming}`;
  }
  extractCompleteSentences(text) {
    const complete = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (!/[.!?]/.test(text[i] || '')) continue;
      let end = i + 1;
      while (end < text.length && /["')\]]/.test(text[end] || '')) {
        end++;
      }
      const sentence = text.slice(start, end).trim();
      if (sentence) complete.push(sentence);
      start = end;
    }
    return {
      complete,
      remaining: text.slice(start).trim()
    };
  }
  flushTranscriptBuffers() {
    ['user', 'model'].forEach(role => {
      const pending = this.transcriptBuffers[role].trim();
      if (!pending) return;
      this.callbacks.onTranscript?.(pending, true, role);
      this.transcriptBuffers[role] = '';
    });
  }
}
//# sourceMappingURL=VoiceService.js.map