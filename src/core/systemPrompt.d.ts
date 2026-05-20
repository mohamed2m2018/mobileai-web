import type { SupportStyle } from './types';
export declare function buildSystemPrompt(language: string, hasKnowledge?: boolean, isCopilot?: boolean, supportStyle?: SupportStyle): string;
export declare function buildVoiceSystemPrompt(language: string, userInstructions?: string, hasKnowledge?: boolean, supportStyle?: SupportStyle): string;
/**
 * Build a knowledge-only system prompt (no UI control tools).
 *
 * Used when enableUIControl = false. The AI can read the screen and
 * query the knowledge base, but CANNOT tap, type, or navigate.
 * ~60% shorter than the full prompt — saves ~1,500 tokens per request.
 */
export declare function buildKnowledgeOnlyPrompt(language: string, hasKnowledge: boolean, userInstructions?: string): string;
//# sourceMappingURL=systemPrompt.d.ts.map