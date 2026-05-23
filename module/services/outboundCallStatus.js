"use strict";

import { ENDPOINTS } from "../config/endpoints.js";
function resolveMobileAIBase(baseUrl) {
  return (baseUrl ?? ENDPOINTS.escalation).replace(/\/$/, '').replace(/\/api\/v1\/analytics$/, '');
}
export async function getOutboundCallStatus(params) {
  const root = resolveMobileAIBase(params.proxyUrl);
  try {
    const res = await fetch(`${root}/api/v1/outbound-calls/${encodeURIComponent(params.callId)}`, {
      headers: {
        Authorization: `Bearer ${params.analyticsKey}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const call = data?.call;
    if (!call) return null;
    if (call.status !== 'completed' && call.status !== 'failed') return null;
    return {
      status: call.status,
      durationSeconds: call.durationSeconds ?? undefined,
      outcome: call.outcome ?? undefined,
      transcript: Array.isArray(call.transcript) ? call.transcript.map(e => ({
        role: e.role || 'unknown',
        text: e.text || ''
      })) : [],
      failureReason: call.failureReason ?? undefined,
      failureCode: call.failureCode ?? undefined,
      billedCostUsd: call.billedCostUsd ?? undefined
    };
  } catch {
    return null;
  }
}
//# sourceMappingURL=outboundCallStatus.js.map