"use strict";

/**
 * webSearchTool — Grounded web search for domain-relevant queries.
 *
 * Uses a separate Gemini API call with Google Search grounding to find
 * real-time information relevant to the app's domain and customer support.
 *
 * This is implemented as a standalone tool (not a built-in googleSearch)
 * because Gemini 2.5 Flash does not support combining built-in tools
 * with function calling in the same request.
 */

import { logger } from "../utils/logger.js";
export function createWebSearchTool(config) {
  return {
    name: 'web_search',
    description: 'Search the web for real-time, domain-relevant information that is NOT available ' + 'on screen or in the knowledge base. Use ONLY for app-related queries: product info, ' + 'current promotions, store/restaurant details, delivery status from external sources, ' + 'dietary or allergen info for menu items, etc. ' + 'Do NOT use for general knowledge questions unrelated to the app.',
    parameters: {
      query: {
        type: 'string',
        description: 'The search query — should be specific and related to the app domain',
        required: true
      }
    },
    execute: async args => {
      const {
        query
      } = args;
      if (!query?.trim()) {
        return 'Error: search query is required.';
      }
      logger.info('WebSearchTool', `Searching: "${query}"`);
      try {
        const response = await config.ai.models.generateContent({
          model: config.model,
          contents: query,
          config: {
            tools: [{
              googleSearch: {}
            }],
            temperature: 0.1,
            maxOutputTokens: 1024
          }
        });
        const text = response?.candidates?.[0]?.content?.parts?.filter(p => p.text)?.map(p => p.text)?.join('\n');
        if (!text) {
          logger.warn('WebSearchTool', 'No text in search response');
          return 'Web search returned no results for this query.';
        }
        logger.info('WebSearchTool', `Got ${text.length} chars of search results`);
        return `Web search results for "${query}":\n\n${text}`;
      } catch (error) {
        logger.error('WebSearchTool', `Search failed: ${error.message}`);
        return `Web search failed: ${error.message}. Try answering from available app data instead.`;
      }
    }
  };
}
//# sourceMappingURL=webSearchTool.js.map