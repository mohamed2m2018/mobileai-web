/**
 * AgentRuntime — The main agent loop.
 *
 * Flow:
 * 1. Walk Fiber tree → detect interactive elements
 * 2. Dehydrate screen → text for LLM
 * 3. Send to AI provider with tools
 * 4. Parse tool call → execute (tap, type, navigate, done)
 * 5. If not done, repeat from step 1 (re-dehydrate after UI change)
 */
import type { AIProvider, AgentConfig, ExecutionResult, ToolDefinition } from './types';
export declare class AgentRuntime {
    private provider;
    private config;
    private tools;
    private history;
    private isRunning;
    private isCancelRequested;
    private lastAskUserQuestion;
    private knowledgeService;
    private uiControlOverride?;
    private lastDehydratedRoot;
    private currentTraceId;
    private currentUserGoal;
    private verifierProvider;
    private outcomeVerifier;
    private pendingCriticalVerification;
    private staleMapWarned;
    private originalErrorHandler;
    private lastSuppressedError;
    private graceTimer;
    private originalReportErrorsAsExceptions;
    private appActionApprovalScope;
    private appActionApprovalSource;
    private static readonly APP_ACTION_TOOLS;
    getConfig(): AgentConfig;
    private executeQueryData;
    private resetAppActionApproval;
    private grantWorkflowApproval;
    private hasWorkflowApproval;
    private debugLogChunked;
    private formatInteractiveForDebug;
    private debugScreenSnapshot;
    constructor(provider: AIProvider, config: AgentConfig, _rootRef: any, _navRef: any);
    private getVerifier;
    private createCurrentVerificationSnapshot;
    private updateCriticalVerification;
    private maybeStartCriticalVerification;
    private shouldBlockSuccessCompletion;
    private registerBuiltInTools;
    /**
     * Register only knowledge-assistant tools (no UI control).
     * Used when enableUIControl = false — the AI can only answer questions.
     */
    private registerKnowledgeOnlyTools;
    private getPlatformAdapter;
    private getNavigationSnapshot;
    setUIControlOverride(enabled: boolean | undefined): void;
    private isUIEnabled;
    /** Maps a tool call to a user-friendly status label for the loading overlay. */
    private getToolStatusLabel;
    /**
     * Get current screen context as formatted text.
     * Used by voice mode: sent once at connect + after each tool call.
     * Tree goes in user prompt, not system instructions.
     */
    getScreenContext(): string;
    private detectStaleMap;
    private buildToolsForProvider;
    /** Public accessor for voice mode — returns all registered tool definitions. */
    getTools(): ToolDefinition[];
    /** Execute a tool by name (for voice mode tool calls from WebSocket). */
    executeTool(name: string, args: Record<string, any>): Promise<string>;
    /**
     * Start 3-layer error suppression for the agent task lifecycle.
     *
     * Layer 1 — ErrorUtils: Catches non-React async errors (setTimeout, fetch, native callbacks).
     * Layer 2 — console.reportErrorsAsExceptions: React Native dev-mode flag. When false,
     *           console.error calls don't trigger ExceptionsManager.handleException(),
     *           preventing the red "Render Error" screen for errors that React surfaces
     *           via console.error (useEffect, lifecycle, invariant violations).
     * Layer 3 — Grace period (in _stopErrorSuppression): Keeps suppression active
     *           for N ms after task completion, covering delayed useEffect effects.
     *
     * Same compound approach used by Sentry React Native SDK (ErrorUtils + ExceptionsManager override).
     */
    private _startErrorSuppression;
    /**
     * Stop error suppression after a grace period.
     * The grace period covers delayed React side-effects (useEffect, PagerView onPageSelected,
     * scrollToIndex) that can fire AFTER execute() returns.
     */
    private _stopErrorSuppression;
    /**
     * Execute a tool with safety checks.
     * Validates args before execution (Detox/Appium pattern).
     * Checks for async errors that were suppressed during the settle window.
     * The global ErrorUtils handler is task-scoped (installed in execute()),
     * so this method only needs to CHECK for errors, not install/remove.
     */
    private executeToolSafely;
    /**
     * Validate tool arguments before execution.
     * Pattern from Detox: `typeof index !== 'number' → throw Error`
     * Pattern from Appium: `_.isFinite(x) && _.isFinite(y)` for coordinates
     * Returns error string if validation fails, null if valid.
     */
    private validateToolArgs;
    private emitTrace;
    /** Write tools that can mutate state — only these are checked for aiConfirm */
    private static readonly WRITE_TOOLS;
    /**
     * Check if a tool call targets an aiConfirm element and request user confirmation.
     * Returns null if the action should proceed, or an error string if rejected.
     */
    private checkCopilotConfirmation;
    private getInstructions;
    private observations;
    private lastScreenName;
    private handleObservations;
    private assembleUserPrompt;
    execute(userMessage: string, chatHistory?: {
        role: string;
        content: string;
    }[]): Promise<ExecutionResult>;
    /** Update refs (called when component re-renders) */
    updateRefs(_rootRef: any, _navRef: any): void;
    /** Check if agent is currently executing */
    getIsRunning(): boolean;
    /**
     * Cancel the currently running task.
     * The agent loop checks this flag at the start of each step,
     * so the current step will complete before the task stops.
     */
    cancel(): void;
}
//# sourceMappingURL=AgentRuntime.d.ts.map