"use strict";

/**
 * SurveyService — backend-persisted CSAT / NPS / CES survey responses.
 *
 * Posts the rating to the Twomilia backend, which stores the SurveyResponse
 * row AND emits the csat_response / nps_response / ces_response (+ fcr_achieved)
 * analytics events the Support dashboard reads. The server is the source of
 * truth for those events — the client survey UI posts cross-origin and can't
 * reliably deliver telemetry itself, so the component no longer emits them.
 *
 * No-op when analyticsKey is absent (graceful degradation). All network errors
 * are swallowed — survey delivery is best-effort and must never break the UI.
 */

import { ENDPOINTS } from "../config/endpoints.js";
import { logger } from "../utils/logger.js";

/**
 * Submit a survey response. Fire-and-forget — returns true on success, false
 * on a no-op or failure. Never throws.
 */
export async function submitSurveyResponse({
  analyticsKey,
  score,
  feedback,
  deviceId,
  userId,
  ticketId,
  surveyConfigId,
  channel = 'web'
}) {
  if (!analyticsKey || score === undefined || score === null) return false;
  try {
    const res = await fetch(ENDPOINTS.surveyResponses, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        analyticsKey,
        score,
        feedback: feedback || undefined,
        deviceId: deviceId || undefined,
        userId: userId || undefined,
        ticketId: ticketId || undefined,
        surveyConfigId: surveyConfigId || undefined,
        channel
      })
    });
    if (!res.ok) {
      logger.warn('SurveyService', `submitSurveyResponse failed: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('SurveyService', `submitSurveyResponse error: ${err}`);
    return false;
  }
}
