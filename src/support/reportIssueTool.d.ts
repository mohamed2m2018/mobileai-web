import type { ToolDefinition } from '../core/types';
export interface ReportIssueToolDeps {
    analyticsKey?: string;
    getCurrentScreen: () => string;
    getHistory: () => Array<{
        role: string;
        content: string;
    }>;
    getScreenFlow?: () => string[];
    userContext?: {
        userId?: string;
        name?: string;
        email?: string;
        phone?: string;
        plan?: string;
        custom?: Record<string, string | number | boolean>;
    };
}
export declare function createReportIssueTool({ analyticsKey, getCurrentScreen, getHistory, getScreenFlow, userContext, }: ReportIssueToolDeps): ToolDefinition | null;
//# sourceMappingURL=reportIssueTool.d.ts.map