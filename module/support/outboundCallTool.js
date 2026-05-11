"use strict";

/**
 * Outbound AI Call tool — starts an AI phone call to a trusted contact.
 *
 * Uses the same factory pattern as createEscalateTool.
 * Requires analyticsKey and Pro+ tier.
 */

import { ENDPOINTS } from "../config/endpoints.js";
import { getDeviceId } from "../services/telemetry/device.js";
import { getDeviceMetadata } from "../services/telemetry/deviceMetadata.js";
import { OutboundCallWatcher } from "./OutboundCallWatcher.js";
import { logger } from "../utils/logger.js";

const LOG_TAG = 'OutboundCallTool';

export const DEFAULT_OUTBOUND_CALL_TARGET_TYPES = [
  'merchant',
  'vendor',
  'carrier',
  'driver',
  'technician',
  'billing_team',
  'fraud_team',
  'external_partner',
];

function resolveMobileAIBase(baseUrl) {
  return (baseUrl ?? ENDPOINTS.escalation)
    .replace(/\/$/, '')
    .replace(/\/api\/v1\/analytics$/, '');
}

function friendlyFailureLabel(failureCode) {
  switch (failureCode) {
    case 'no_answer': return 'No one answered the phone.';
    case 'busy': return 'The line was busy.';
    case 'canceled': return 'The call was canceled.';
    case 'callee_hung_up': return 'They answered but hung up immediately.';
    case 'exhausted': return "Couldn't reach them after multiple attempts.";
    case 'connection_lost': return 'Connection was lost during the call.';
    case 'watcher_timeout': return 'The call timed out waiting for a response.';
    default: return 'The call could not be completed.';
  }
}

function summarizeRecentHistory(history) {
  return history
    .slice(-8)
    .map((entry) => `${entry.role}: ${entry.content}`)
    .join('\n')
    .slice(0, 3000);
}

async function startOutboundAiCall({ analyticsKey, request, config, currentScreen, userContext }) {
  if (!analyticsKey) {
    return { ok: false, error: 'MobileAI analyticsKey is required for outbound AI calls.' };
  }

  const allowedTargetTypes = config?.allowedTargetTypes;
  if (allowedTargetTypes?.length && !allowedTargetTypes.includes(request.targetType)) {
    return { ok: false, error: `Target type "${request.targetType}" is not allowed by this SDK configuration.` };
  }

  const root = resolveMobileAIBase(config?.proxyUrl);

  try {
    const response = await fetch(`${root}/api/v1/outbound-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analyticsKey}`,
        ...(config?.headers ?? {}),
      },
      body: JSON.stringify({
        ...request,
        currentScreen,
        userContext: {
          ...(userContext ?? {}),
          deviceId: getDeviceId(),
          device: getDeviceMetadata(),
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: typeof payload?.error === 'string'
          ? payload.error
          : `Outbound AI call failed with HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      callId: payload?.call?.id,
      status: payload?.call?.status,
      targetDisplayName: payload?.call?.targetDisplayName,
      message: payload?.message,
    };
  } catch (error) {
    logger.error(LOG_TAG, `Network error: ${error?.message || String(error)}`);
    return { ok: false, error: error?.message || 'Network error starting outbound AI call.' };
  }
}

export function createOutboundCallTool(deps) {
  const allowedTargetTypes =
    deps.config?.allowedTargetTypes?.length
      ? deps.config.allowedTargetTypes
      : [...DEFAULT_OUTBOUND_CALL_TARGET_TYPES];

  return {
    name: 'start_ai_call',
    description:
      'Start an outbound AI phone call from the company-owned MobileAI phone number to a trusted contact configured in the dashboard. ' +
      'Use this only after investigating the issue and deciding a real human/vendor/partner phone call is needed, such as a stuck order, delivery coordination, appointment confirmation, booking partner follow-up, billing/fraud escalation, or external vendor status check. ' +
      'Never provide or infer a phone number; pass only targetType and targetId so MobileAI can look up the trusted contact. This tool requires explicit user approval before dialing.',
    parameters: {
      targetType: {
        type: 'string',
        description: 'Trusted contact category configured in MobileAI.',
        enum: allowedTargetTypes,
        required: true,
      },
      targetId: {
        type: 'string',
        description: 'Stable app/business ID for the trusted contact. Do not send a phone number.',
        required: true,
      },
      reason: {
        type: 'string',
        description: 'Brief reason the call is needed.',
        required: true,
      },
      callGoal: {
        type: 'string',
        description: 'Specific outcome the AI caller should try to get from the external party.',
        required: true,
      },
      contextSummary: {
        type: 'string',
        description: 'Important context to give the AI caller before dialing.',
        required: true,
      },
      urgency: {
        type: 'string',
        description: 'Call urgency.',
        enum: ['normal', 'urgent'],
        required: false,
      },
    },
    execute: async (args, signal) => {
      const targetId = String(args.targetId ?? '').trim();
      if (/^\+?[1-9]\d{7,14}$/.test(targetId)) {
        return '❌ start_ai_call rejected: targetId must be a semantic trusted-contact ID, not a phone number.';
      }

      const contextFromHistory = summarizeRecentHistory(deps.getHistory?.() ?? []);
      const result = await startOutboundAiCall({
        analyticsKey: deps.analyticsKey,
        config: deps.config,
        currentScreen: deps.getCurrentScreen?.(),
        userContext: deps.userContext,
        request: {
          targetType: String(args.targetType ?? '').trim(),
          targetId,
          reason: String(args.reason ?? '').trim(),
          callGoal: String(args.callGoal ?? '').trim(),
          contextSummary:
            String(args.contextSummary ?? '').trim() ||
            contextFromHistory ||
            'No additional conversation context was provided.',
          urgency: args.urgency === 'urgent' ? 'urgent' : 'normal',
        },
      });

      if (!result.ok) {
        return `❌ Outbound AI call could not start: ${result.error || 'Unknown error'}. Fall back to human escalation or messaging.`;
      }

      deps.onStatusUpdate?.('📞 Dialing...');

      const callId = result.callId;
      if (!callId) {
        return [
          'AI_CALL_STARTED',
          'Call ID: unknown',
          `Status: ${result.status ?? 'started'}`,
          'Warning: backend did not return a call ID; live updates are not available.',
        ].join('\n');
      }

      const watcher = new OutboundCallWatcher({
        callId,
        analyticsKey: deps.analyticsKey,
        proxyUrl: deps.config?.proxyUrl,
        timeoutMs: deps.config?.watcherTimeoutMs,
        onEvent: (event) => {
          deps.config?.onCallEvent?.(event);
          if (event.type === 'status') {
            const label = event.status === 'in_progress' ? '📞 On call...'
              : event.status === 'ringing' ? '📞 Ringing...'
              : `📞 ${event.status}`;
            deps.onStatusUpdate?.(label);
          } else if (event.type === 'retry_scheduled') {
            deps.onStatusUpdate?.('📞 No answer — retrying shortly...');
          } else if (event.type === 'completed' && event.status === 'failed') {
            deps.onStatusUpdate?.(`📞 ${friendlyFailureLabel(event.failureCode)}`);
          }
        },
      });

      let terminal;
      try {
        if (signal) {
          const abortPromise = new Promise((_, reject) => {
            if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          });
          terminal = await Promise.race([watcher.start(), abortPromise]);
        } else {
          terminal = await watcher.start();
        }
      } catch (err) {
        watcher.close();
        if (err?.name === 'AbortError') {
          return `AI_CALL_IN_PROGRESS\nCall ID: ${callId}\nThe call is still running but the agent task was cancelled by the user.`;
        }
        return [
          'AI_CALL_FAILED',
          `Call ID: ${callId}`,
          `Reason: watcher_error: ${err?.message || String(err)}`,
          'Fall back to human escalation or messaging.',
        ].join('\n');
      }

      const transcriptLines = terminal.transcript
        .map((entry) => {
          const role = entry.role || 'unknown';
          const text = (entry.text || '').trim();
          return text ? `${role}: ${text}` : '';
        })
        .filter(Boolean);

      if (terminal.status !== 'completed') {
        const friendly = friendlyFailureLabel(terminal.failureCode);
        return [
          'AI_CALL_FAILED',
          `Call ID: ${callId}`,
          `Status: ${terminal.status}`,
          `What happened: ${friendly}`,
          terminal.failureReason ? `Technical reason: ${terminal.failureReason}` : '',
          terminal.durationSeconds != null ? `Duration: ${terminal.durationSeconds}s` : '',
          transcriptLines.length > 0 ? 'Transcript:' : '',
          ...transcriptLines,
          terminal.failureCode === 'exhausted'
            ? 'All retry attempts have been exhausted. Inform the user you could not reach the contact and suggest alternatives (try again later, escalate, or use messaging).'
            : 'Fall back to human escalation or messaging if the goal was not achieved.',
        ]
          .filter(Boolean)
          .join('\n');
      }

      const outcome = terminal.outcome ?? {};
      const outcomeReason = typeof outcome.reason === 'string' ? String(outcome.reason) : 'unspecified';
      const outcomeSummary =
        typeof outcome.summary === 'string' && String(outcome.summary).trim()
          ? String(outcome.summary).trim()
          : transcriptLines.slice(-8).join('\n') || 'No summary available.';

      return [
        'AI_CALL_COMPLETED',
        `Call ID: ${callId}`,
        `Target: ${result.targetDisplayName ?? targetId}`,
        `Duration: ${terminal.durationSeconds ?? 0}s`,
        `Outcome reason: ${outcomeReason}`,
        `Outcome summary: ${outcomeSummary}`,
        transcriptLines.length > 0 ? 'Transcript:' : '',
        ...transcriptLines,
        'Use this outcome to continue helping the user.',
      ]
        .filter(Boolean)
        .join('\n');
    },
  };
}
//# sourceMappingURL=outboundCallTool.js.map
