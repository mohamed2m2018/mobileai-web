"use strict";

import { getDeviceId, initDeviceId } from "./telemetry/device.js";
import { logger } from "../utils/logger.js";
import { ENDPOINTS } from "../config/endpoints.js";
const LOG_TAG = 'MobileAIActionService';
function resolveMobileAIBase(baseUrl) {
  return (baseUrl ?? ENDPOINTS.escalation).replace(/\/$/, '').replace(/\/api\/v1\/analytics$/, '');
}
export async function fetchConfiguredActions(params) {
  const {
    analyticsKey,
    baseUrl,
    headers
  } = params;
  try {
    const root = resolveMobileAIBase(baseUrl);
    const url = `${root}/api/v1/actions/sync?key=${encodeURIComponent(analyticsKey)}`;
    const response = await fetch(url, {
      headers: headers ?? {}
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch configured actions: ${response.status}`);
    }
    const payload = await response.json();
    return Array.isArray(payload.actions) ? payload.actions : [];
  } catch (error) {
    logger.warn(LOG_TAG, `Could not sync configured actions: ${error.message}`);
    return [];
  }
}
export async function executeConfiguredAction(params) {
  const {
    analyticsKey,
    actionName,
    baseUrl,
    headers,
    args = {},
    currentScreen,
    userContext
  } = params;
  await initDeviceId();
  const deviceId = getDeviceId() ?? 'unknown';
  const root = resolveMobileAIBase(baseUrl);
  try {
    const response = await fetch(`${root}/api/v1/actions/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${analyticsKey}`,
        ...(headers ?? {})
      },
      body: JSON.stringify({
        actionName,
        deviceId,
        args,
        currentScreen,
        userContext
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        allowed: false,
        executed: false,
        executionType: payload.executionType ?? 'app_code',
        error: payload.error ?? `Action '${actionName}' failed with HTTP ${response.status}`
      };
    }
    return {
      allowed: payload.allowed === true,
      executed: payload.executed === true,
      executionType: payload.executionType ?? 'app_code',
      message: payload.message,
      output: payload.output
    };
  } catch (error) {
    logger.error(LOG_TAG, `executeConfiguredAction network error: ${error.message}`);
    return {
      allowed: false,
      executed: false,
      executionType: 'app_code',
      error: error.message
    };
  }
}
//# sourceMappingURL=MobileAIActionService.js.map