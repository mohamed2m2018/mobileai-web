import type { AIMessage, AIRichNode, ExecutionResult } from './types';
export declare function createTextContent(content: string, id?: string): AIRichNode[];
export declare function markdownToPlainText(input: string): string;
export declare function normalizeRichContent(input: AIRichNode[] | string | null | undefined, fallbackText?: string): AIRichNode[];
export declare function richContentToPlainText(input: AIRichNode[] | string | null | undefined, fallbackText?: string): string;
export declare function createAIMessage(params: {
    id: string;
    role: AIMessage['role'];
    content: AIRichNode[] | string;
    timestamp: number;
    result?: ExecutionResult;
    promptKind?: AIMessage['promptKind'];
    previewText?: string;
}): AIMessage;
export declare function normalizeExecutionResult(result: ExecutionResult): ExecutionResult;
//# sourceMappingURL=richContent.d.ts.map
