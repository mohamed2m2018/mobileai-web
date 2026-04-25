/**
 * MCPBridge — Connects the React Native app to the local MCP Server bridge.
 *
 * Flow:
 * - Connects via WebSocket to the Node.js MCP server
 * - Listens for 'request' messages containing an MCP command
 * - Forwards the command to AgentRuntime.execute()
 * - Sends the ExecutionResult back via WebSocket as a 'response'
 */
import type { AgentRuntime } from './AgentRuntime';
export declare class MCPBridge {
    private url;
    private ws;
    private runtime;
    private reconnectTimer;
    private isDestroyed;
    constructor(url: string, runtime: AgentRuntime);
    private connect;
    private sendResponse;
    private scheduleReconnect;
    destroy(): void;
}
//# sourceMappingURL=MCPBridge.d.ts.map