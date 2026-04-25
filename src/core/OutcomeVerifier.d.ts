import type { AIProvider, AgentConfig, InteractiveElement } from './types';
export type VerificationStatus = 'success' | 'error' | 'uncertain';
export type VerificationFailureKind = 'controllable' | 'uncontrollable';
export interface VerificationSnapshot {
    screenName: string;
    screenContent: string;
    elements: InteractiveElement[];
    screenshot?: string;
}
export interface VerificationAction {
    toolName: string;
    args: Record<string, any>;
    label: string;
    targetElement?: InteractiveElement;
}
export interface VerificationContext {
    goal: string;
    action: VerificationAction;
    preAction: VerificationSnapshot;
    postAction: VerificationSnapshot;
}
export interface VerificationResult {
    status: VerificationStatus;
    failureKind: VerificationFailureKind;
    evidence: string;
    source: 'deterministic' | 'llm';
    missingFields?: string[];
    validationMessages?: string[];
}
export interface PendingVerification {
    goal: string;
    action: VerificationAction;
    preAction: VerificationSnapshot;
    followupSteps: number;
}
export declare function createVerificationSnapshot(screenName: string, screenContent: string, elements: InteractiveElement[], screenshot?: string): VerificationSnapshot;
export declare function buildVerificationAction(toolName: string, args: Record<string, any>, elements: InteractiveElement[], fallbackLabel: string): VerificationAction;
export declare function isCriticalVerificationAction(action: VerificationAction): boolean;
export declare class OutcomeVerifier {
    private readonly provider;
    private readonly config;
    constructor(provider: AIProvider, config: AgentConfig);
    isEnabled(): boolean;
    getMaxFollowupSteps(): number;
    isCriticalAction(action: VerificationAction): boolean;
    verify(context: VerificationContext): Promise<VerificationResult>;
}
//# sourceMappingURL=OutcomeVerifier.d.ts.map