/**
 * GeminiProvider — Gemini API integration via @google/genai SDK.
 *
 * Uses the official Google GenAI SDK for:
 * - generateContent with structured function calling (agent_step)
 * - inlineData for vision (base64 screenshots)
 * - System instructions
 *
 * Implements the AIProvider interface so it can be swapped
 * with OpenAIProvider, AnthropicProvider, etc.
 */
import type { AIProvider, ToolDefinition, AgentStep, ProviderResult } from '../core/types';
export declare class GeminiProvider implements AIProvider {
    private ai;
    private model;
    constructor(apiKey?: string, model?: string, proxyUrl?: string, proxyHeaders?: Record<string, string>);
    generateContent(systemPrompt: string, userMessage: string, tools: ToolDefinition[], history: AgentStep[], screenshot?: string): Promise<ProviderResult>;
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
    private buildAgentStepDeclaration;
    /**
     * Builds contents for the generateContent call.
     * Single-turn: user message + optional screenshot as inlineData.
     */
    private buildContents;
    /**
     * Parses the SDK response expecting a single agent_step function call.
     * Extracts structured reasoning + action.
     */
    private parseAgentStepResponse;
    /**
     * Extracts token usage from SDK response and calculates estimated cost.
     *
     * Pricing (Gemini 2.5 Flash):
     * - Input:  $0.30 / 1M tokens
     * - Output: $2.50 / 1M tokens
     */
    private extractTokenUsage;
    /**
     * Converts raw API errors into clean, user-friendly messages.
     * Parses JSON error bodies and maps HTTP codes to plain language.
     */
    private formatProviderError;
}
//# sourceMappingURL=GeminiProvider.d.ts.map