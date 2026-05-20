/**
 * ProviderFactory — Creates the appropriate AI provider based on config.
 *
 * Centralizes provider instantiation so AIAgent.tsx doesn't need to
 * know about individual provider implementations.
 */
import type { AIProvider, AIProviderName } from '../core/types';
export declare function createProvider(provider?: AIProviderName, apiKey?: string, model?: string, proxyUrl?: string, proxyHeaders?: Record<string, string>): AIProvider;
//# sourceMappingURL=ProviderFactory.d.ts.map