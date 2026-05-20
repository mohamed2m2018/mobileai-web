/**
 * OpenAIProvider — OpenAI Chat Completions API via raw fetch.
 *
 * Uses the same flat `agent_step` function pattern as GeminiProvider:
 * - Reasoning fields (previous_goal_eval, memory, plan) + action in one tool call
 * - `tool_choice: "required"` forces a tool call every step
 * - `strict: true` guarantees schema adherence
 *
 * No SDK dependency — raw fetch for full React Native compatibility.
 * Implements the AIProvider interface so it can be swapped with GeminiProvider.
 */
import type { AIProvider, ToolDefinition, AgentStep, ProviderResult } from '../core/types';
export declare class OpenAIProvider implements AIProvider {
    private model;
    private baseUrl;
    private headers;
    constructor(apiKey?: string, model?: string, proxyUrl?: string, proxyHeaders?: Record<string, string>);
    generateContent(systemPrompt: string, userMessage: string, tools: ToolDefinition[], _history: AgentStep[], screenshot?: string): Promise<ProviderResult>;
    /**
     * Builds the OpenAI tool definition for `agent_step`.
     * Same flat pattern as Gemini — reasoning fields + action in one function.
     * Uses `strict: true` for guaranteed schema adherence.
     */
    private buildAgentStepTool;
    private buildMessages;
    private parseAgentStepResponse;
    /**
     * Extracts token usage from OpenAI response and calculates estimated cost.
     *
     * Pricing (GPT-4.1-mini):
     * - Input:  $0.40 / 1M tokens
     * - Output: $1.60 / 1M tokens
     */
    private extractTokenUsage;
}
//# sourceMappingURL=OpenAIProvider.d.ts.map