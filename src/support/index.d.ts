/**
 * Support Mode — barrel export.
 */
export type { SupportModeConfig, QuickReply, EscalationConfig, EscalationContext, CSATConfig, CSATRating, BusinessHoursConfig, SupportTicket, ReportedIssue, ReportedIssueCustomerStatus, ReportedIssueStatusUpdate, } from './types';
export type { SupportStyle } from './supportStyle';
export { buildSupportPrompt } from './supportPrompt';
export { createEscalateTool } from './escalateTool';
export { createReportIssueTool } from './reportIssueTool';
export { EscalationSocket } from './EscalationSocket';
export type { SocketReplyHandler } from './EscalationSocket';
export { EscalationEventSource } from './EscalationEventSource';
export { createOutboundCallTool, DEFAULT_OUTBOUND_CALL_TARGET_TYPES } from './outboundCallTool';
export type { OutboundCallConfig, OutboundCallToolDeps, OutboundCallEvent, OutboundCallTerminal } from './outboundCallTool';
export { OutboundCallWatcher, getOutboundCallStatus } from './OutboundCallWatcher';
export { CSATSurvey } from './CSATSurvey';
//# sourceMappingURL=index.d.ts.map