import type { KnowledgeRetriever } from '../core/types';
export interface MobileAIKnowledgeRetrieverOptions {
    analyticsKey: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    limit?: number;
}
export declare function createMobileAIKnowledgeRetriever(options: MobileAIKnowledgeRetrieverOptions): KnowledgeRetriever;
//# sourceMappingURL=MobileAIKnowledgeRetriever.d.ts.map