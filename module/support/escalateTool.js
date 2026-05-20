"use strict";

/**
 * Escalate tool — hands off the conversation to a human agent.
 *
 * Providers:
 * - 'mobileai' (default when analyticsKey present):
 *   POSTs to MobileAI /api/v1/escalations → gets ticketId + wsUrl
 *   Opens WebSocket via EscalationSocket → agent reply pushed in real time
 * - 'custom': fires the consumer's onEscalate callback (backward compatible)
 */

import { EscalationSocket } from "./EscalationSocket.js";
import { ENDPOINTS } from "../config/endpoints.js";
import { getDeviceId } from "../services/telemetry/device.js";
import { getDeviceMetadata } from "../services/telemetry/deviceMetadata.js";
import { logger } from "../utils/logger.js";
const MOBILEAI_HOST = ENDPOINTS.escalation;

/** @deprecated Use createEscalateTool({ config, analyticsKey, getContext, getHistory }) */

export function createEscalateTool(depsOrConfig, legacyGetContext) {
  // Normalise both call signatures
  let deps;
  if (legacyGetContext) {
    deps = {
      config: depsOrConfig,
      getContext: legacyGetContext,
      getHistory: () => []
    };
  } else {
    deps = depsOrConfig;
  }
  const {
    config,
    analyticsKey,
    getContext,
    getHistory,
    getToolCalls,
    onHumanReply,
    onEscalationStarted,
    onTypingChange,
    onTicketClosed,
    userContext,
    pushToken,
    pushTokenType,
    getScreenFlow
  } = deps;

  // Determine effective provider
  const provider = config.provider ?? (analyticsKey ? 'mobileai' : 'custom');

  // Socket instance kept here — one per tool instance
  let socket = null;
  return {
    name: 'escalate_to_human',
    description: 'Hand off the conversation to a human support agent. ' + 'Use this when: (1) the user explicitly asks for a human, ' + '(2) you cannot resolve the issue after multiple attempts, or ' + '(3) the topic requires human judgment (billing disputes, account issues).',
    parameters: {
      reason: {
        type: 'string',
        description: 'Brief summary of why escalation is needed and what has been tried',
        required: true
      }
    },
    execute: async args => {
      const reason = String(args.reason ?? 'User requested human support');
      const context = getContext();
      if (provider === 'mobileai') {
        if (!analyticsKey) {
          logger.warn('Escalation', 'provider=mobileai but no analyticsKey — falling back to custom');
        } else {
          try {
            const history = getHistory().slice(-20); // last 20 messages for context
            logger.info('Escalation', '★★★ Creating ticket — reason:', reason, '| deviceId:', getDeviceId());
            const res = await fetch(`${MOBILEAI_HOST}/api/v1/escalations`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                analyticsKey,
                reason,
                screen: context.currentScreen,
                history,
                stepsBeforeEscalation: context.stepsBeforeEscalation,
                userContext: {
                  ...userContext,
                  device: getDeviceMetadata()
                },
                screenFlow: getScreenFlow?.() ?? [],
                toolCalls: getToolCalls?.() ?? [],
                pushToken,
                pushTokenType,
                deviceId: getDeviceId()
              })
            });
            if (res.ok) {
              const {
                ticketId,
                wsUrl
              } = await res.json();
              logger.info('Escalation', '★★★ Ticket created:', ticketId, '| wsUrl:', wsUrl);

              // Connect WebSocket for real-time reply
              socket?.disconnect();
              socket = new EscalationSocket({
                onReply: (reply, replyTicketId) => {
                  logger.info('Escalation', '★★★ Human reply for ticket', ticketId, ':', reply.substring(0, 80));
                  onHumanReply?.(reply, replyTicketId || ticketId);
                },
                onTypingChange: v => {
                  logger.info('Escalation', '★★★ Agent typing:', v);
                  onTypingChange?.(v);
                },
                onTicketClosed: closedTicketId => {
                  logger.info('Escalation', '★★★ Ticket closed:', ticketId);
                  onTicketClosed?.(closedTicketId || ticketId);
                },
                onError: err => {
                  logger.error('Escalation', '★★★ WebSocket error:', err);
                }
              });
              socket.connect(wsUrl);
              logger.info('Escalation', '★★★ WebSocket connecting...');

              // Pass the socket to UI
              logger.info('Escalation', '★★★ Calling onEscalationStarted for ticket:', ticketId);
              onEscalationStarted?.(ticketId, socket);
              logger.info('Escalation', '★★★ onEscalationStarted DONE');
            } else {
              logger.error('Escalation', 'Failed to create ticket:', res.status);
            }
          } catch (err) {
            logger.error('Escalation', 'Network error:', err.message);
          }
          const message = config.escalationMessage ?? "Your request has been sent to our support team. A human agent will reply here as soon as possible.";
          return `ESCALATED: ${message}`;
        }
      }

      // 'custom' provider — fire callback
      const escalationContext = {
        conversationSummary: reason,
        currentScreen: context.currentScreen,
        originalQuery: context.originalQuery,
        stepsBeforeEscalation: context.stepsBeforeEscalation
      };
      config.onEscalate?.(escalationContext);
      const message = config.escalationMessage ?? "Your request has been sent to our support team. A human agent will reply here as soon as possible.";
      return `ESCALATED: ${message}`;
    }
  };
}
//# sourceMappingURL=escalateTool.js.map