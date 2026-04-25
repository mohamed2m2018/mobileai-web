"use strict";

/**
 * ProviderFactory — Creates the appropriate AI provider based on config.
 *
 * Centralizes provider instantiation so AIAgent.tsx doesn't need to
 * know about individual provider implementations.
 */

import { OpenAIProvider } from "./OpenAIProvider.js";
import { GeminiProvider } from "./GeminiProvider.js";
export function createProvider(provider = 'gemini', apiKey, model, proxyUrl, proxyHeaders) {
  switch (provider) {
    case 'openai':
      return new OpenAIProvider(apiKey, model || 'gpt-4.1-mini', proxyUrl, proxyHeaders);
    case 'gemini':
    default:
      return new GeminiProvider(apiKey, model || 'gemini-2.5-flash', proxyUrl, proxyHeaders);
  }
}
//# sourceMappingURL=ProviderFactory.js.map