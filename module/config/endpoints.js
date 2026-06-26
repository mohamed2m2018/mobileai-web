"use strict";

/**
 * SDK Endpoint Configuration
 *
 * All Twomilia backend URLs live here.
 * Change these to point to a self-hosted or staging server.
 *
 * Enterprise customers: use the `analyticsProxyUrl` prop on <AIAgent>
 * to route telemetry through your own backend without touching this file.
 */

function resolveTwomiliaBase() {
  const configuredBase = process.env.EXPO_PUBLIC_MOBILEAI_BASE_URL || process.env.NEXT_PUBLIC_MOBILEAI_BASE_URL || 'https://twomilia.com';

  // Android emulators cannot reach the host machine via localhost/127.0.0.1.
  // Translate those hostnames to 10.0.2.2 so the Expo example can talk to the
  // local dashboard/backend without affecting iOS.
  const platformOs = typeof globalThis.Platform === 'object' && typeof globalThis.Platform?.OS === 'string' ? globalThis.Platform.OS : null;
  if (platformOs === 'android') {
    return configuredBase.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, 'http://10.0.2.2');
  }
  return configuredBase;
}
const TWOMILIA_BASE = resolveTwomiliaBase();

// Runtime base override. When the host passes a `proxyUrl`, the SDK routes
// conversation history, telemetry, feature flags and escalation to THAT
// backend (its origin) instead of the hosted Twomilia cloud — so self-hosted
// and local setups capture their own data. Unset → falls back to the cloud.
let _baseOverride = null;
export function setTwomiliaBase(base) {
  _baseOverride = typeof base === 'string' && base ? base.replace(/\/+$/, '') : null;
}
function activeBase() {
  return _baseOverride || TWOMILIA_BASE;
}
function toWebSocketBase(url) {
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`;
  return url;
}
export const ENDPOINTS = {
  /** Hosted Twomilia text proxy — used by default when analyticsKey is set */
  get hostedTextProxy() { return `${activeBase()}/api/v1/hosted-proxy/text`; },
  /** Hosted Twomilia voice proxy — used by default when analyticsKey is set */
  get hostedVoiceProxy() { return `${toWebSocketBase(activeBase())}/ws/hosted-proxy/voice`; },
  /** Telemetry event ingest — receives batched SDK events */
  get telemetryIngest() { return `${activeBase()}/api/v1/events`; },
  /** Feature flag sync — fetches remote flags for this analyticsKey */
  get featureFlags() { return `${activeBase()}/api/v1/flags`; },
  /** Live agent escalation (support handoff) */
  get escalation() { return activeBase(); },
  /** AI conversation history — save and retrieve per-user AI chat sessions */
  get conversations() { return `${activeBase()}/api/v1/conversations`; },
  /** CSAT/NPS/CES survey responses — persisted + mirrored to support analytics */
  get surveyResponses() { return `${activeBase()}/api/v1/surveys/responses`; }
};
