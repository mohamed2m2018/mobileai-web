export type RemoteActionExecutionType = 'webhook' | 'app_code';
export interface RemoteConfiguredAction {
    name: string;
    description: string;
    triggerHint: string;
    limitPerUser: number;
    globalLimit: number;
    executionType: RemoteActionExecutionType;
}
export interface ExecuteConfiguredActionResult {
    allowed: boolean;
    executed: boolean;
    executionType: RemoteActionExecutionType;
    message?: string;
    output?: unknown;
    error?: string;
}
export declare function fetchConfiguredActions(params: {
    analyticsKey: string;
    baseUrl?: string;
    headers?: Record<string, string>;
}): Promise<RemoteConfiguredAction[]>;
export declare function executeConfiguredAction(params: {
    analyticsKey: string;
    actionName: string;
    baseUrl?: string;
    headers?: Record<string, string>;
    args?: Record<string, unknown>;
    currentScreen?: string;
    userContext?: Record<string, unknown>;
}): Promise<ExecuteConfiguredActionResult>;
//# sourceMappingURL=MobileAIActionService.d.ts.map