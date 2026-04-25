/**
 * Support Mode prompt — injected into the system prompt when support mode is enabled.
 *
 * Uses POSITIVE framing (what TO DO) instead of negative rules (per user's prompt engineering rules).
 */
import type { SupportModeConfig } from './types';
/**
 * Build the support mode system prompt addition.
 * This gets appended to the main system prompt when support mode is active.
 */
export declare function buildSupportPrompt(config: SupportModeConfig): string;
//# sourceMappingURL=supportPrompt.d.ts.map