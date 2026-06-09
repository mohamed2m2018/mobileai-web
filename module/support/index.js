"use strict";

/**
 * Support Mode — barrel export.
 */

// Types

// Prompt injection
export { buildSupportPrompt } from "./supportPrompt.js";

// Escalation tool + WebSocket manager
export { createEscalateTool } from "./escalateTool.js";
export { createReportIssueTool } from "./reportIssueTool.js";
export { EscalationSocket } from "./EscalationSocket.js";
export { EscalationEventSource } from "./EscalationEventSource.js";

// Outbound AI calls
export { createOutboundCallTool, DEFAULT_OUTBOUND_CALL_TARGET_TYPES } from "./outboundCallTool.js";
export { OutboundCallWatcher, getOutboundCallStatus } from "./OutboundCallWatcher.js";

// UI Components
export { CSATSurvey } from "./CSATSurvey.js";
//# sourceMappingURL=index.js.map