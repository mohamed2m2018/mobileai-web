/**
 * Outbound AI Call tool — starts an AI phone call to a trusted contact.
 */
import type { ToolDefinition } from '../core/types';
import type { OutboundCallEvent, OutboundCallTerminal } from './OutboundCallWatcher';

export type { OutboundCallEvent, OutboundCallTerminal };

export type OutboundCallConfig = {
  /** Default: true when analyticsKey is present. */
  enabled?: boolean;
  /** Optional Twomilia-compatible backend root. Defaults to https://twomilia.com. */
  proxyUrl?: string;
  /** Optional extra headers sent to the outbound-call endpoint. */
  headers?: Record<string, string>;
  /** Optional client-side target allowlist. Backend remains the source of truth. */
  allowedTargetTypes?: string[];
  /** Optional live event callback. */
  onCallEvent?: (event: OutboundCallEvent) => void;
  /** Hard cap on watcher wait time. Default 30 min. */
  watcherTimeoutMs?: number;
};

export interface OutboundCallToolDeps {
  analyticsKey: string;
  config?: OutboundCallConfig;
  getCurrentScreen?: () => string;
  getHistory?: () => Array<{ role: string; content: string }>;
  userContext?: Record<string, unknown>;
  onStatusUpdate?: (status: string) => void;
}

export declare const DEFAULT_OUTBOUND_CALL_TARGET_TYPES: readonly string[];

export declare function createOutboundCallTool(deps: OutboundCallToolDeps): ToolDefinition;
//# sourceMappingURL=outboundCallTool.d.ts.map
