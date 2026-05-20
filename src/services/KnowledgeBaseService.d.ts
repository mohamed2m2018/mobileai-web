/**
 * KnowledgeBaseService — Retrieves domain-specific knowledge for the AI agent.
 *
 * Supports two modes:
 * 1. Static entries: Consumer passes KnowledgeEntry[] — SDK handles keyword matching
 * 2. Custom retriever: Consumer passes { retrieve(query, screen) } — full control
 *
 * Results are formatted as plain text for the LLM tool response.
 */
import type { KnowledgeBaseConfig } from '../core/types';
export declare class KnowledgeBaseService {
    private retriever;
    private maxChars;
    constructor(config: KnowledgeBaseConfig, maxTokens?: number);
    /**
     * Retrieve and format knowledge for a given query.
     * Returns formatted plain text for the LLM, or a "no results" message.
     */
    retrieve(query: string, screenName: string): Promise<string>;
    /**
     * Simple keyword-based retrieval for static entries.
     * Scores entries by word overlap with the query, filters by screen.
     */
    private keywordRetrieve;
    /** Check if an entry should be included on the current screen. */
    private isScreenMatch;
    /** Tokenize text into lowercase words for matching. */
    private tokenize;
    /** Take entries until the token budget is exhausted. */
    private applyTokenBudget;
    /** Format entries as readable plain text for the LLM. */
    private formatEntries;
}
//# sourceMappingURL=KnowledgeBaseService.d.ts.map