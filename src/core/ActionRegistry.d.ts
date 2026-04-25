import type { ActionDefinition } from './types';
export interface MCPToolDeclaration {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required: string[];
    };
}
/**
 * A central registry for all actions registered via `useAction`.
 * This acts as the single source of truth for:
 * 1. The in-app AI Agent (AgentRuntime)
 * 2. The MCP Server (external agents)
 * 3. iOS App Intents (Siri)
 * 4. Android AppFunctions (Gemini)
 */
export declare class ActionRegistry {
    private actions;
    private listeners;
    /** Register a new action definition */
    register(action: ActionDefinition): void;
    /** Unregister an action by name */
    unregister(name: string): void;
    /** Get a specific action by name */
    get(name: string): ActionDefinition | undefined;
    /** Get all registered actions */
    getAll(): ActionDefinition[];
    /** Clear all registered actions (useful for testing) */
    clear(): void;
    /**
     * Subscribe to changes (e.g. when a new screen mounts and registers actions).
     * Useful for the MCP server to re-announce tools.
     */
    onChange(listener: () => void): () => void;
    /** Serialize all actions as strictly-typed MCP tool declarations */
    toMCPTools(): MCPToolDeclaration[];
    private buildInputSchema;
    private notify;
}
export declare const actionRegistry: ActionRegistry;
//# sourceMappingURL=ActionRegistry.d.ts.map