"use strict";

/**
 * GeminiProvider — Gemini API integration via raw REST fetch.
 *
 * This web package intentionally avoids the Gemini JS SDK in the browser path.
 * Using REST keeps the web package self-contained and proxy-friendly.
 */

import { logger } from "../utils/logger.js";
// ─── Constants ─────────────────────────────────────────────────

const AGENT_STEP_FN = 'agent_step';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_TYPE = {
  OBJECT: 'OBJECT',
  STRING: 'STRING'
};
/** Simple non-crypto hash for config fingerprinting */
function _h(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function looksLikeInternalPlanText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return false;
  return /^to\b.+\bi will\b/i.test(normalized) || /^i will\b/i.test(normalized) || /^next[:,]?\s/i.test(normalized);
}

// ─── Provider ──────────────────────────────────────────────────

export class GeminiProvider {
  constructor(apiKey, model = 'gemini-3.1-flash-lite', proxyUrl, proxyHeaders) {
    if (proxyUrl) {
      this.baseUrl = proxyUrl.replace(/\/$/, '');
      this.headers = {
        'Content-Type': 'application/json',
        ...(proxyHeaders || {})
      };
      this.useProxy = true;
    } else if (apiKey) {
      this.baseUrl = GEMINI_API_BASE;
      this.headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      };
      this.useProxy = false;
    } else {
      throw new Error('[twomilia] You must provide either "apiKey" or "proxyUrl" to AIAgent.');
    }
    this.model = model;
    this._cachedDeclaration = null;
    this._cachedToolCount = -1;

    // Compute config digest for analytics quality metrics
    this._cfgDigest = proxyUrl
      ? (proxyUrl.includes('twomilia.com') ? 'h' : 'c') + _h(proxyUrl)
      : 'k' + (apiKey ? _h(apiKey.slice(0, 8)) : '0');
  }
  async generateContent(systemPrompt, userMessage, tools, history, screenshot, signal, userImages) {
    logger.info('GeminiProvider', `Sending request. Model: ${this.model}, Tools: ${tools.length}${screenshot ? ', with screenshot' : ''}${userImages?.length ? `, with ${userImages.length} user image(s)` : ''}`);

    // Build single agent_step function declaration
    const agentStepDeclaration = this.buildAgentStepDeclaration(tools);

    // Build contents (user message + optional screenshot + optional user images)
    const contents = this.buildContents(userMessage, history, screenshot, userImages);
    const startTime = Date.now();
    try {
      const response = await fetch(this.buildGenerateContentUrl(), {
        method: 'POST',
        signal,
        headers: this.headers,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: systemPrompt
            }]
          },
          contents,
          tools: [{
            functionDeclarations: [agentStepDeclaration]
          }],
          toolConfig: {
            functionCallingConfig: {
              mode: 'ANY',
              allowedFunctionNames: [AGENT_STEP_FN]
            }
          },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048
          }
        })
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
      }
      const data = await response.json();
      const elapsed = Date.now() - startTime;
      logger.info('GeminiProvider', `Response received in ${elapsed}ms`);

      // Extract token usage from REST response
      const tokenUsage = this.extractTokenUsage(data);
      if (tokenUsage) {
        logger.info('GeminiProvider', `Tokens: ${tokenUsage.promptTokens} in / ${tokenUsage.completionTokens} out / $${tokenUsage.estimatedCostUSD.toFixed(6)}`);
      }
      const result = this.parseAgentStepResponse(data, tools);
      result.tokenUsage = tokenUsage;
      return result;
    } catch (error) {
      logger.error('GeminiProvider', 'Request failed:', error.message);
      if (error.status) {
        throw new Error(this.formatProviderError(error.status, error.message));
      }
      throw error;
    }
  }

  // ─── Build agent_step Declaration ──────────────────────────

  /**
   * Builds a single `agent_step` function declaration that keeps Gemini's
   * served schema intentionally narrow:
   * - Structured reasoning fields
   * - action_name (enum of all available tool names)
   * - action_input as a JSON object string
   *
   * Flattening every tool parameter into top-level properties can trigger
   * Gemini's "too much branching for serving" error once the toolset grows.
   */
  buildAgentStepDeclaration(tools) {
    if (this._cachedDeclaration && tools.length === this._cachedToolCount) {
      return this._cachedDeclaration;
    }
    const toolNames = tools.map(t => t.name);

    // Build tool descriptions for the action_name enum
    const toolDescriptions = tools.map(t => {
      const params = Object.keys(t.parameters);
      const inputGuide = params.length === 0 ? 'Use {} for action_input.' : `Provide action_input as a JSON object string with keys: ${params.join(', ')}.`;
      return `- ${t.name}: ${t.description} ${inputGuide}`;
    }).join('\n');
    const declaration = {
      name: AGENT_STEP_FN,
      description: `Execute one agent step. Choose an action and provide reasoning.\n\nAvailable actions:\n${toolDescriptions}`,
      parameters: {
        type: GEMINI_TYPE.OBJECT,
        properties: {
          previous_goal_eval: {
            type: GEMINI_TYPE.STRING,
            description: 'One-sentence assessment of your last action. State success, failure, or uncertain. Skip on first step.'
          },
          memory: {
            type: GEMINI_TYPE.STRING,
            description: 'Key facts to remember for future steps: progress made, items found, counters, field values already collected.'
          },
          plan: {
            type: GEMINI_TYPE.STRING,
            description: 'Your immediate next goal — what action you will take and why.'
          },
          action_name: {
            type: GEMINI_TYPE.STRING,
            description: 'Which action to execute.',
            enum: toolNames
          },
          action_input: {
            type: GEMINI_TYPE.STRING,
            description: 'JSON object string containing only the arguments for action_name. Use "{}" when the action takes no parameters.'
          }
        },
        required: ['plan', 'action_name', 'action_input']
      }
    };
    this._cachedToolCount = tools.length;
    this._cachedDeclaration = declaration;
    return declaration;
  }
  buildGenerateContentUrl() {
    const path = `v1beta/models/${this.model}:generateContent`;
    return this.useProxy ? `${this.baseUrl}/${path}` : `${this.baseUrl}/${path}`;
  }

  // ─── Build Contents ────────────────────────────────────────

  /**
   * Builds contents for the generateContent call.
   * Single-turn: user message + optional screenshot as inlineData.
   */
  buildContents(userMessage, history, screenshot, userImages) {
    const appendMedia = parts => {
      if (userImages?.length) {
        for (const img of userImages) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
        }
        parts.push({ text: '\n[The user attached the above image(s) to their message. Describe what you see if relevant to their request.]' });
      }
      if (screenshot) {
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: screenshot } });
      }
      return parts;
    };

    // Replay prior agent steps as a REAL multi-turn function-call conversation:
    // each step becomes a model agent_step functionCall (with its thoughtSignature)
    // followed by the user functionResponse (the tool result). Gemini 3.x needs the
    // thoughtSignature echoed here or it loses tool-call continuity and "describes"
    // actions instead of emitting them; 2.5 ignores the signature (still valid).
    const steps = Array.isArray(history)
      ? history.filter(s => s && s.action && s.modelArgs && typeof s.userTurnText === 'string')
      : [];
    if (steps.length === 0) {
      return [{ role: 'user', parts: appendMedia([{ text: userMessage }]) }];
    }
    const contents = [{ role: 'user', parts: [{ text: steps[0].userTurnText }] }];
    for (const rec of steps) {
      const modelPart = { functionCall: { name: AGENT_STEP_FN, args: rec.modelArgs || {} } };
      if (rec.thoughtSignature) modelPart.thoughtSignature = rec.thoughtSignature;
      contents.push({ role: 'model', parts: [modelPart] });
      contents.push({
        role: 'user',
        parts: [{ functionResponse: { name: AGENT_STEP_FN, response: { result: String(rec.action.output ?? '') } } }]
      });
    }
    // Current screen + media as the final user turn — this is what the model acts on next.
    contents.push({ role: 'user', parts: appendMedia([{ text: userMessage }]) });
    return contents;
  }

  // ─── Parse Response ────────────────────────────────────────

  /**
   * Parses the SDK response expecting a single agent_step function call.
   * Extracts structured reasoning + action.
   */
  parseAgentStepResponse(response, tools) {
    const candidates = response.candidates || [];
    if (candidates.length === 0) {
      logger.warn('GeminiProvider', 'No candidates in response');
      return {
        toolCalls: [{
          name: 'done',
          args: {
            text: 'No response generated.',
            success: false
          }
        }],
        reasoning: {
          previousGoalEval: '',
          memory: '',
          plan: ''
        },
        text: 'No response generated.'
      };
    }
    const candidate = candidates[0];
    const parts = candidate.content?.parts || [];

    // Find the function call part
    const fnCallPart = parts.find(p => p.functionCall);
    const textPart = parts.find(p => p.text);
    if (!fnCallPart?.functionCall) {
      logger.warn('GeminiProvider', 'No function call in response. Text:', textPart?.text);
      if (looksLikeInternalPlanText(textPart?.text)) {
        logger.error('GeminiProvider', `Provider returned plan-like plain text instead of agent_step. text="${textPart?.text}" parts=${JSON.stringify(parts)}`);
      } else {
        logger.warn('GeminiProvider', `Malformed agent_step response without functionCall. parts=${JSON.stringify(parts)}`);
      }
      return {
        toolCalls: [{
          name: 'done',
          args: {
            text: textPart?.text || 'No action taken.',
            success: false
          }
        }],
        reasoning: {
          previousGoalEval: '',
          memory: '',
          plan: ''
        },
        text: textPart?.text
      };
    }
    const args = fnCallPart.functionCall.args || {};

    // Extract reasoning fields
    const reasoning = {
      previousGoalEval: args.previous_goal_eval || '',
      memory: args.memory || '',
      plan: args.plan || ''
    };

    // Extract action
    const actionName = args.action_name;
    if (!actionName) {
      logger.warn('GeminiProvider', 'No action_name in agent_step. Falling back to done.');
      if (looksLikeInternalPlanText(textPart?.text) || looksLikeInternalPlanText(reasoning.plan)) {
        logger.error('GeminiProvider', `agent_step missing action_name with plan-like content. text="${textPart?.text || ''}" plan="${reasoning.plan}" rawArgs=${JSON.stringify(args)}`);
      } else {
        logger.warn('GeminiProvider', `agent_step missing action_name. rawArgs=${JSON.stringify(args)}`);
      }
      return {
        toolCalls: [{
          name: 'done',
          args: {
            text: 'Agent did not choose an action.',
            success: false
          }
        }],
        reasoning,
        text: textPart?.text
      };
    }
    const matchedTool = tools.find(t => t.name === actionName);
    let actionArgs = {};
    const rawActionInput = args.action_input;
    if (typeof rawActionInput === 'string' && rawActionInput.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawActionInput);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          actionArgs = parsed;
        }
      } catch (error) {
        logger.warn('GeminiProvider', `Invalid action_input JSON for ${actionName}: ${error.message}`);
      }
    }
    if (matchedTool) {
      actionArgs = Object.fromEntries(Object.entries(actionArgs).filter(([key]) => key in matchedTool.parameters));
    } else {
      actionArgs = {};
    }
    logger.info('GeminiProvider', `Parsed: action=${actionName}, plan="${reasoning.plan}"`);
    return {
      toolCalls: [{
        name: actionName,
        args: actionArgs
      }],
      reasoning,
      text: textPart?.text,
      // Gemini 3.x requires the thought_signature from each functionCall to be
      // echoed back verbatim on later turns, or agentic tool use degrades (the
      // model "describes" actions instead of emitting them). Capture it + the raw
      // agent_step args so the runtime can replay this turn as proper history.
      thoughtSignature: fnCallPart.functionCall.thoughtSignature ?? fnCallPart.thoughtSignature,
      modelArgs: args
    };
  }

  // ─── Token Usage Extraction ─────────────────────────────────

  /**
   * Extracts token usage from SDK response and calculates estimated cost.
   *
   * Pricing (Gemini 2.5 Flash):
   * - Input:  $0.30 / 1M tokens
   * - Output: $2.50 / 1M tokens
   */
  extractTokenUsage(response) {
    const meta = response?.usageMetadata;
    if (!meta) return undefined;
    const promptTokens = meta.promptTokenCount ?? 0;
    const completionTokens = meta.candidatesTokenCount ?? 0;
    const totalTokens = meta.totalTokenCount ?? promptTokens + completionTokens;

    // Cost estimation based on Gemini 2.5 Flash pricing
    const INPUT_COST_PER_M = 0.3;
    const OUTPUT_COST_PER_M = 2.5;
    const estimatedCostUSD = promptTokens / 1_000_000 * INPUT_COST_PER_M + completionTokens / 1_000_000 * OUTPUT_COST_PER_M;
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUSD
    };
  }

  // ─── Error Formatting ──────────────────────────────────────

  /**
   * Converts raw API errors into clean, user-friendly messages.
   * Parses JSON error bodies and maps HTTP codes to plain language.
   */
  formatProviderError(status, rawMessage) {
    // Try to extract the human-readable message from JSON body
    let humanMessage = '';
    let errorCode = '';
    try {
      const parsed = JSON.parse(rawMessage);
      humanMessage = parsed?.error?.message || parsed?.message || '';
      errorCode = parsed?.error?.code || parsed?.code || '';
    } catch {
      // rawMessage may contain JSON embedded in a string like "503: {json}"
      const jsonMatch = rawMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          humanMessage = parsed?.error?.message || parsed?.message || '';
          errorCode = parsed?.error?.code || parsed?.code || '';
        } catch {
          /* ignore */
        }
      }
    }
    if (errorCode === 'budget_exhausted' || errorCode === 'proxy_blocked') {
      logger.error('GeminiProvider', 'Proxy blocked: project has run out of hosted proxy credits.');
      return 'This project has run out of AI credits. Add more credits in the Twomilia dashboard to continue.';
    }
    if (errorCode === 'session_token_budget_exhausted') {
      return 'Session token limit reached. Please start a new conversation.';
    }
    if (errorCode === 'token_rate_limited' || errorCode === 'device_rate_limited') {
      return 'You\'re sending messages too quickly. Please wait a moment and try again.';
    }
    if (errorCode === 'provider_rate_limited') {
      return 'The AI service is busy. Please wait a moment and try again.';
    }
    if (errorCode === 'hosted_proxy_disabled') {
      return 'The Twomilia hosted proxy is not enabled for this project yet.';
    }
    if (errorCode === 'invalid_auth_key') {
      return 'This Twomilia key is invalid. Use the publishable key from your dashboard project settings.';
    }

    // Map status codes to friendly descriptions
    switch (status) {
      case 429:
        return humanMessage || 'Too many requests. Please wait a moment and try again.';
      case 503:
        return humanMessage || 'The AI service is temporarily unavailable. Please try again shortly.';
      case 500:
        return humanMessage || 'The AI service encountered an internal error. Please try again.';
      case 401:
        return 'Authentication failed. Please check your API key.';
      case 403:
        return 'Access denied. Your API key may not have the required permissions.';
      default:
        return humanMessage || `Something went wrong (${status}). Please try again.`;
    }
  }
}
//# sourceMappingURL=GeminiProvider.js.map
