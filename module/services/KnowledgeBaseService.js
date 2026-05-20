"use strict";

/**
 * KnowledgeBaseService — Retrieves domain-specific knowledge for the AI agent.
 *
 * Supports two modes:
 * 1. Static entries: Consumer passes KnowledgeEntry[] — SDK handles keyword matching
 * 2. Custom retriever: Consumer passes { retrieve(query, screen) } — full control
 *
 * Results are formatted as plain text for the LLM tool response.
 */

import { logger } from "../utils/logger.js";
// ─── Constants ─────────────────────────────────────────────────

const DEFAULT_MAX_TOKENS = 2000;
const CHARS_PER_TOKEN = 4; // Conservative estimate
const DEFAULT_PRIORITY = 5;

// ─── Service ───────────────────────────────────────────────────

export class KnowledgeBaseService {
  constructor(config, maxTokens) {
    this.maxChars = (maxTokens ?? DEFAULT_MAX_TOKENS) * CHARS_PER_TOKEN;

    // Normalize: array → built-in keyword retriever, object → use as-is
    if (Array.isArray(config)) {
      const entries = config;
      this.retriever = {
        retrieve: async (query, screenName) => this.keywordRetrieve(entries, query, screenName)
      };
      logger.info('KnowledgeBase', `Initialized with ${entries.length} static entries (budget: ${maxTokens ?? DEFAULT_MAX_TOKENS} tokens)`);
    } else {
      this.retriever = config;
      logger.info('KnowledgeBase', `Initialized with custom retriever (budget: ${maxTokens ?? DEFAULT_MAX_TOKENS} tokens)`);
    }
  }

  // ─── Public API ──────────────────────────────────────────────

  /**
   * Retrieve and format knowledge for a given query.
   * Returns formatted plain text for the LLM, or a "no results" message.
   */
  async retrieve(query, screenName) {
    try {
      const entries = await this.retriever.retrieve(query, screenName);
      if (!entries || entries.length === 0) {
        return 'No relevant knowledge found for this query. Answer based on what is visible on screen, or let the user know you don\'t have that information.';
      }

      // Apply token budget — take entries until we hit the limit
      const selected = this.applyTokenBudget(entries);
      logger.info('KnowledgeBase', `Retrieved ${selected.length}/${entries.length} entries for "${query}" (screen: ${screenName})`);
      return this.formatEntries(selected);
    } catch (error) {
      logger.error('KnowledgeBase', `Retrieval failed: ${error.message}`);
      return 'Knowledge retrieval failed. Answer based on what is visible on screen.';
    }
  }

  // ─── Built-in Keyword Retriever ──────────────────────────────

  /**
   * Simple keyword-based retrieval for static entries.
   * Scores entries by word overlap with the query, filters by screen.
   */
  keywordRetrieve(entries, query, screenName) {
    const queryWords = this.tokenize(query);
    if (queryWords.length === 0) return [];

    // Score each entry
    const scored = entries.filter(entry => this.isScreenMatch(entry, screenName)).map(entry => {
      const searchable = this.tokenize(`${entry.title} ${(entry.tags || []).join(' ')} ${entry.content}`);
      const matchCount = queryWords.filter(w => searchable.some(s => s.includes(w) || w.includes(s))).length;
      const score = matchCount * (entry.priority ?? DEFAULT_PRIORITY);
      return {
        entry,
        score
      };
    }).filter(({
      score
    }) => score > 0).sort((a, b) => b.score - a.score);
    return scored.map(({
      entry
    }) => entry);
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /** Check if an entry should be included on the current screen. */
  isScreenMatch(entry, screenName) {
    if (!entry.screens || entry.screens.length === 0) return true;
    return entry.screens.some(s => s.toLowerCase() === screenName.toLowerCase());
  }

  /** Tokenize text into lowercase words for matching. */
  tokenize(text) {
    return text.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF\s]/g, ' ') // Keep alphanumeric + Arabic chars
    .split(/\s+/).filter(w => w.length > 1); // Skip single-char words
  }

  /** Take entries until the token budget is exhausted. */
  applyTokenBudget(entries) {
    const selected = [];
    let totalChars = 0;
    for (const entry of entries) {
      const entryChars = entry.title.length + entry.content.length + 10; // +10 for formatting
      if (totalChars + entryChars > this.maxChars && selected.length > 0) break;
      selected.push(entry);
      totalChars += entryChars;
    }
    return selected;
  }

  /** Format entries as readable plain text for the LLM. */
  formatEntries(entries) {
    return entries.map(e => `## ${e.title}\n${e.content}`).join('\n\n');
  }
}
//# sourceMappingURL=KnowledgeBaseService.js.map