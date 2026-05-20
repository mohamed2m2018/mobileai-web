/**
 * Tool Module Types — shared interfaces for all agent tools.
 *
 * Each tool is a standalone module that exports a factory function
 * returning an AgentTool. Tool semantics live here, while platform
 * mechanics execute through the injected PlatformAdapter.
 */
import type { PlatformAdapter } from '../core/types';
export interface ToolParameter {
    type: 'string' | 'number' | 'boolean';
    description: string;
    required?: boolean;
    enum?: string[];
}
export interface AgentTool {
    /** Unique tool name (used as key in tools map) */
    name: string;
    /** Description shown to the AI model for tool selection */
    description: string;
    /** Parameter schema for the AI model */
    parameters: Record<string, ToolParameter>;
    /** Execute the tool with validated args */
    execute: (args: any) => Promise<string>;
}
export interface ToolContext {
    platformAdapter: PlatformAdapter;
}
//# sourceMappingURL=types.d.ts.map