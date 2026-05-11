/**
 * OutboundCallWatcher — WebSocket watcher for outbound AI call events.
 */

export type OutboundCallEvent =
  | { type: 'status'; status: string; startedAt?: string; twilioCallSid?: string }
  | { type: 'transcript'; role: 'caller' | 'ai' | 'system'; text: string; at: string }
  | { type: 'tool_call'; tool: string; args: Record<string, unknown> }
  | {
      type: 'completed';
      status: 'completed' | 'failed';
      durationSeconds?: number;
      outcome?: Record<string, unknown>;
      transcript?: Array<Record<string, unknown>>;
      billedCostUsd?: number;
      failureReason?: string;
      failureCode?: string;
    }
  | { type: 'retry_scheduled'; nextAttemptAt: string; attemptNumber: number };

export type OutboundCallTerminal = {
  status: 'completed' | 'failed';
  durationSeconds?: number;
  outcome?: Record<string, unknown>;
  transcript: Array<{ role: string; text: string; at?: string }>;
  failureReason?: string;
  failureCode?: string;
  billedCostUsd?: number;
};

export type OutboundCallWatcherOptions = {
  callId: string;
  analyticsKey: string;
  proxyUrl?: string;
  timeoutMs?: number;
  onEvent?: (event: OutboundCallEvent) => void;
};

export declare function getOutboundCallStatus(params: {
  callId: string;
  analyticsKey: string;
  proxyUrl?: string;
}): Promise<OutboundCallTerminal | null>;

export declare class OutboundCallWatcher {
  constructor(opts: OutboundCallWatcherOptions);
  start(): Promise<OutboundCallTerminal>;
  close(): void;
}
//# sourceMappingURL=OutboundCallWatcher.d.ts.map
