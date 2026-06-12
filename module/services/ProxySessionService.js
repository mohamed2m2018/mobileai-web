"use strict";

import { ENDPOINTS } from "../config/endpoints.js";
import { getDeviceId, initDeviceId } from "./telemetry/device.js";
const REFRESH_BUFFER_SECONDS = 300;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;
let session = null;
let exchangePromise = null;
function isExpired() {
  return !session || Date.now() >= session.expiresAt;
}
function isNearExpiry() {
  if (!session) return true;
  return Date.now() >= session.expiresAt - REFRESH_BUFFER_SECONDS * 1000;
}
async function fetchSession(analyticsKey, deviceId, attempt = 0) {
  const response = await fetch(ENDPOINTS.proxySession, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      analyticsKey,
      deviceId
    })
  });
  if (!response.ok) {
    if (attempt < MAX_RETRIES && response.status >= 500) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
      return fetchSession(analyticsKey, deviceId, attempt + 1);
    }
    const body = await response.json().catch(() => ({}));
    throw new Error(body.code || `proxy_session_exchange_failed_${response.status}`);
  }
  return response.json();
}
function scheduleRefresh(analyticsKey) {
  if (!session) return;
  if (session.refreshTimer) clearTimeout(session.refreshTimer);
  const msUntilRefresh = Math.max(1000, session.expiresAt - Date.now() - REFRESH_BUFFER_SECONDS * 1000);
  session.refreshTimer = setTimeout(() => {
    void exchangeToken(analyticsKey).catch(err => {
      console.warn('[ProxySession] Background refresh failed:', err.message);
    });
  }, msUntilRefresh);
}
export async function exchangeToken(analyticsKey) {
  // Deduplicate concurrent calls
  if (exchangePromise) return exchangePromise;
  exchangePromise = (async () => {
    try {
      const deviceId = getDeviceId() || (await initDeviceId());
      const result = await fetchSession(analyticsKey, deviceId);
      const now = Date.now();
      if (session?.refreshTimer) clearTimeout(session.refreshTimer);
      session = {
        token: result.token,
        expiresAt: now + result.expiresIn * 1000,
        refreshTimer: null
      };
      scheduleRefresh(analyticsKey);
      return result.token;
    } finally {
      exchangePromise = null;
    }
  })();
  return exchangePromise;
}
export async function getSessionToken(analyticsKey) {
  if (session && !isExpired()) {
    if (isNearExpiry()) {
      void exchangeToken(analyticsKey).catch(() => {});
    }
    return session.token;
  }
  return exchangeToken(analyticsKey);
}
export function getSessionTokenSync() {
  if (session && !isExpired()) return session.token;
  return null;
}
export function clearSession() {
  if (session?.refreshTimer) clearTimeout(session.refreshTimer);
  session = null;
  exchangePromise = null;
}
//# sourceMappingURL=ProxySessionService.js.map