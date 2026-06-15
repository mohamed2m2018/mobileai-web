"use strict";

import { ENDPOINTS } from "../config/endpoints.js";
import { getDeviceId, initDeviceId } from "./telemetry/device.js";
import { getDeviceMetadata } from "./telemetry/deviceMetadata.js";
import { logger } from "../utils/logger.js";
import { OutboundCallWatcher } from "../support/OutboundCallWatcher.js";
export { getOutboundCallStatus } from "./outboundCallStatus.js";
const LOG_TAG = 'OutboundCallService';
export const DEFAULT_OUTBOUND_CALL_TARGET_TYPES = ['merchant', 'vendor', 'carrier', 'driver', 'technician', 'billing_team', 'fraud_team', 'external_partner'];
export function watchOutboundCall(params) {
  const watcher = new OutboundCallWatcher({
    callId: params.callId,
    analyticsKey: params.analyticsKey,
    proxyUrl: params.proxyUrl,
    timeoutMs: params.timeoutMs,
    onEvent: params.onEvent
  });
  return {
    promise: watcher.start(),
    close: () => watcher.close()
  };
}
function resolveMobileAIBase(baseUrl) {
  return (baseUrl ?? ENDPOINTS.escalation).replace(/\/$/, '').replace(/\/api\/v1\/analytics$/, '');
}
export async function startOutboundAiCall(params) {
  const {
    analyticsKey,
    request,
    config,
    currentScreen,
    userContext
  } = params;
  if (!analyticsKey) {
    return {
      ok: false,
      error: 'Twomilia analyticsKey is required for outbound AI calls.'
    };
  }
  const allowedTargetTypes = config?.allowedTargetTypes;
  if (allowedTargetTypes?.length && !allowedTargetTypes.includes(request.targetType)) {
    return {
      ok: false,
      error: `Target type "${request.targetType}" is not allowed by this SDK configuration.`
    };
  }
  await initDeviceId();
  const root = resolveMobileAIBase(config?.proxyUrl);
  try {
    const response = await fetch(`${root}/api/v1/outbound-calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${analyticsKey}`,
        ...(config?.headers ?? {})
      },
      body: JSON.stringify({
        ...request,
        currentScreen,
        userContext: {
          ...(userContext ?? {}),
          deviceId: getDeviceId(),
          device: getDeviceMetadata()
        }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: typeof payload?.error === 'string' ? payload.error : `Outbound AI call failed with HTTP ${response.status}.`
      };
    }
    return {
      ok: true,
      callId: payload?.call?.id,
      status: payload?.call?.status,
      targetDisplayName: payload?.call?.targetDisplayName,
      message: payload?.message
    };
  } catch (error) {
    logger.error(LOG_TAG, `Network error: ${error?.message || String(error)}`);
    return {
      ok: false,
      error: error?.message || 'Network error starting outbound AI call.'
    };
  }
}
//# sourceMappingURL=OutboundCallService.js.map