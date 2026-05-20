"use strict";

const COMMIT_ACTION_PATTERN = /\b(save|submit|confirm|apply|pay|place|update|continue|finish|send|checkout|complete|verify|review|publish|post|delete|cancel)\b/i;
const SUCCESS_SIGNAL_PATTERNS = [/\b(success|successful|saved|updated|submitted|completed|done|confirmed|applied|verified)\b/i, /\bthank you\b/i, /\border confirmed\b/i, /\bchanges saved\b/i];
const ERROR_SIGNAL_PATTERNS = [/\berror\b/i, /\bfailed\b/i, /\binvalid\b/i, /\brequired\b/i, /\bincorrect\b/i, /\btry again\b/i, /\bcould not\b/i, /\bunable to\b/i, /\bverification\b.{0,30}\b(error|failed|invalid|required)\b/i, /\bcode\b.{0,30}\b(error|failed|invalid|required)\b/i];
const UNCONTROLLABLE_ERROR_PATTERNS = [/\bnetwork\b/i, /\bserver\b/i, /\bservice unavailable\b/i, /\btemporarily unavailable\b/i, /\btimeout\b/i, /\btry later\b/i, /\bconnection\b/i];
const INPUT_FIELD_TYPES = new Set(['text-input', 'picker', 'date-picker', 'radio', 'switch', 'slider']);
const FIELD_MESSAGE_PATTERNS = [/^(.+?)\s+(?:is|are)\s+(?:required|invalid|missing)\b/i, /^please\s+(?:enter|provide|select)\s+(.+?)\b/i, /^(.+?)\s+cannot\s+be\s+empty\b/i];
const IGNORED_EMPTY_FIELD_PATTERNS = [/\btype your address\b/i, /\bstreet name\b/i, /\blandmark\b/i, /^\+\d+$/, /\bcontact information\b/i];
function normalizeText(text) {
  return text.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
}
function normalizeFieldName(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').replace(/\s+/g, ' ').trim();
}
function cleanScreenLine(line) {
  return line.replace(/\[[^\]]+\]/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\/>/g, ' ').replace(/\s+/g, ' ').trim();
}
function getVisibleFieldCandidates(elements) {
  const seen = new Set();
  const labels = [];
  for (const element of elements) {
    if (!INPUT_FIELD_TYPES.has(element.type)) continue;
    const label = element.label.trim();
    if (!label) continue;
    const normalized = normalizeFieldName(label);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    labels.push(label);
  }
  return labels;
}
function extractValidationMessages(screenContent) {
  const seen = new Set();
  const messages = [];
  for (const rawLine of screenContent.split('\n')) {
    const line = cleanScreenLine(rawLine);
    if (!line) continue;
    if (!ERROR_SIGNAL_PATTERNS.some(pattern => pattern.test(line))) continue;
    const normalized = normalizeFieldName(line);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    messages.push(line);
  }
  return messages;
}
function matchFieldCandidate(fieldText, candidates) {
  const normalizedField = normalizeFieldName(fieldText);
  if (!normalizedField) return null;
  let bestMatch = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeFieldName(candidate);
    if (!normalizedCandidate) continue;
    let score = -1;
    if (normalizedCandidate === normalizedField) {
      score = 4;
    } else if (normalizedCandidate.includes(normalizedField)) {
      score = 3;
    } else if (normalizedField.includes(normalizedCandidate)) {
      score = 2;
    } else {
      const fieldTokens = new Set(normalizedField.split(' '));
      const candidateTokens = normalizedCandidate.split(' ');
      const overlap = candidateTokens.filter(token => fieldTokens.has(token)).length;
      if (overlap > 0) {
        score = overlap;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }
  return bestScore > 0 ? bestMatch : null;
}
function extractFieldPhrase(message) {
  for (const pattern of FIELD_MESSAGE_PATTERNS) {
    const match = message.match(pattern);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}
function findElementLineIndexes(screenContent) {
  const lines = screenContent.split('\n');
  const indexes = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/\[(\d+)\]</);
    if (!match) return;
    indexes.set(Number(match[1]), index);
  });
  return indexes;
}
function isEmptyInputLine(line, element) {
  if (element.type === 'text-input') {
    return /value=(["'])\1/.test(line);
  }
  return false;
}
function isRequiredCue(line) {
  if (!line) return false;
  if (line === '*') return true;
  if (/\brequired\b/i.test(line)) return true;
  return /\*/.test(line);
}
function shouldIgnoreEmptyField(label) {
  const trimmed = label.trim();
  if (!trimmed) return true;
  if (!/[a-z]/i.test(trimmed)) return true;
  return IGNORED_EMPTY_FIELD_PATTERNS.some(pattern => pattern.test(trimmed));
}
function hasNearbyRequiredCue(lines, lineIndex) {
  for (let offset = -8; offset <= 2; offset += 1) {
    if (offset === 0) continue;
    const candidate = cleanScreenLine(lines[lineIndex + offset] || '');
    if (!candidate) continue;
    if (candidate.startsWith('[image')) continue;
    if (isRequiredCue(candidate)) return true;
  }
  return false;
}
function inferVisibleEmptyRequiredFields(screenContent, elements) {
  const lines = screenContent.split('\n');
  const lineIndexes = findElementLineIndexes(screenContent);
  const missingFields = [];
  const seen = new Set();
  const addField = label => {
    const normalized = normalizeFieldName(label);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    missingFields.push(label.trim());
  };
  for (const element of elements) {
    if (!INPUT_FIELD_TYPES.has(element.type)) continue;
    const label = element.label.trim();
    if (shouldIgnoreEmptyField(label)) continue;
    const lineIndex = lineIndexes.get(element.index);
    if (lineIndex === undefined) continue;
    const rawLine = lines[lineIndex] || '';
    const cleanedLine = cleanScreenLine(rawLine);
    if (!isEmptyInputLine(rawLine, element)) continue;
    const ownRequired = isRequiredCue(cleanedLine);
    const nearbyRequired = hasNearbyRequiredCue(lines, lineIndex);
    if (!ownRequired && !nearbyRequired) continue;
    addField(label);
  }
  return missingFields;
}
function inferMissingFields(screenContent, validationMessages, fieldCandidates, elements) {
  const missingFields = [];
  const seen = new Set();
  const lines = screenContent.split('\n');
  const addField = field => {
    if (!field) return;
    const normalized = normalizeFieldName(field);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    missingFields.push(field);
  };
  if (validationMessages.length > 0 && fieldCandidates.length > 0) {
    for (const message of validationMessages) {
      const directField = extractFieldPhrase(message);
      addField(matchFieldCandidate(directField || '', fieldCandidates));
      if (directField) continue;
      const messageIndex = lines.findIndex(line => cleanScreenLine(line) === message);
      if (messageIndex === -1) continue;
      for (let offset = 1; offset <= 8; offset += 1) {
        const candidateLine = lines[messageIndex - offset];
        if (!candidateLine) continue;
        addField(matchFieldCandidate(cleanScreenLine(candidateLine), fieldCandidates));
        if (missingFields.length > 0) break;
      }
    }
  }
  for (const emptyField of inferVisibleEmptyRequiredFields(screenContent, elements)) {
    addField(emptyField);
  }
  return missingFields;
}
function elementStillPresent(elements, target) {
  if (!target) return false;
  return elements.some(element => element.index === target.index || element.type === target.type && element.label.trim().length > 0 && element.label.trim() === target.label.trim());
}
export function createVerificationSnapshot(screenName, screenContent, elements, screenshot) {
  return {
    screenName,
    screenContent,
    elements,
    screenshot
  };
}
export function buildVerificationAction(toolName, args, elements, fallbackLabel) {
  const targetElement = typeof args.index === 'number' ? elements.find(element => element.index === args.index) : undefined;
  return {
    toolName,
    args,
    label: targetElement?.label || fallbackLabel,
    targetElement
  };
}
export function isCriticalVerificationAction(action) {
  if (action.targetElement?.requiresConfirmation) return true;
  if (!['tap', 'long_press', 'adjust_slider', 'select_picker', 'set_date'].includes(action.toolName)) {
    return false;
  }
  const label = action.label || '';
  return COMMIT_ACTION_PATTERN.test(label);
}
function deterministicVerify(context) {
  const normalizedPost = normalizeText(context.postAction.screenContent);
  const validationMessages = extractValidationMessages(context.postAction.screenContent);
  const missingFields = inferMissingFields(context.postAction.screenContent, validationMessages, getVisibleFieldCandidates(context.postAction.elements), context.postAction.elements);
  if (ERROR_SIGNAL_PATTERNS.some(pattern => pattern.test(normalizedPost))) {
    const failureKind = UNCONTROLLABLE_ERROR_PATTERNS.some(pattern => pattern.test(normalizedPost)) ? 'uncontrollable' : 'controllable';
    return {
      status: 'error',
      failureKind,
      evidence: 'Visible validation or error feedback appeared after the action.',
      source: 'deterministic',
      missingFields,
      validationMessages
    };
  }
  if (context.postAction.screenName !== context.preAction.screenName) {
    return {
      status: 'success',
      failureKind: 'controllable',
      evidence: `The app navigated from "${context.preAction.screenName}" to "${context.postAction.screenName}".`,
      source: 'deterministic',
      missingFields,
      validationMessages
    };
  }
  if (SUCCESS_SIGNAL_PATTERNS.some(pattern => pattern.test(normalizedPost))) {
    return {
      status: 'success',
      failureKind: 'controllable',
      evidence: 'The current screen shows explicit success or completion language.',
      source: 'deterministic',
      missingFields,
      validationMessages
    };
  }
  if (context.action.targetElement && elementStillPresent(context.preAction.elements, context.action.targetElement) && !elementStillPresent(context.postAction.elements, context.action.targetElement)) {
    return {
      status: 'success',
      failureKind: 'controllable',
      evidence: 'The commit control is no longer present on the current screen.',
      source: 'deterministic',
      missingFields,
      validationMessages
    };
  }
  return {
    status: 'uncertain',
    failureKind: 'controllable',
    evidence: 'The current UI does not yet prove either success or failure.',
    source: 'deterministic',
    missingFields,
    validationMessages
  };
}
async function llmVerify(provider, context) {
  const verificationTool = {
    name: 'report_verification',
    description: 'Report whether the action succeeded, failed, or remains uncertain based only on the UI evidence.',
    parameters: {
      status: {
        type: 'string',
        description: 'success, error, or uncertain',
        required: true,
        enum: ['success', 'error', 'uncertain']
      },
      failureKind: {
        type: 'string',
        description: 'controllable or uncontrollable',
        required: true,
        enum: ['controllable', 'uncontrollable']
      },
      evidence: {
        type: 'string',
        description: 'Brief explanation grounded in the current UI evidence',
        required: true
      }
    },
    execute: async () => 'reported'
  };
  const systemPrompt = ['You are an outcome verifier for a mobile app agent.', 'Your job is to decide whether the last critical UI action actually succeeded.', 'The current UI is the source of truth. Ignore the actor model’s prior claims when they conflict with the UI.', 'Return success only when the current UI clearly proves completion.', 'Return error when the UI shows validation, verification, submission, or other failure feedback.', 'Return uncertain when the UI does not yet prove either success or error.'].join(' ');
  const userPrompt = [`<goal>${context.goal}</goal>`, `<action tool="${context.action.toolName}" label="${context.action.label}">${JSON.stringify(context.action.args)}</action>`, `<pre_action screen="${context.preAction.screenName}">\n${context.preAction.screenContent}\n</pre_action>`, `<post_action screen="${context.postAction.screenName}">\n${context.postAction.screenContent}\n</post_action>`].join('\n\n');
  const response = await provider.generateContent(systemPrompt, userPrompt, [verificationTool], [], context.postAction.screenshot);
  const toolCall = response.toolCalls?.[0];
  if (!toolCall || toolCall.name !== 'report_verification') {
    return null;
  }
  const status = toolCall.args.status;
  const failureKind = toolCall.args.failureKind;
  const evidence = typeof toolCall.args.evidence === 'string' ? toolCall.args.evidence : '';
  const missingFields = Array.isArray(toolCall.args.missingFields) ? toolCall.args.missingFields.filter(value => typeof value === 'string' && value.trim().length > 0) : undefined;
  const validationMessages = Array.isArray(toolCall.args.validationMessages) ? toolCall.args.validationMessages.filter(value => typeof value === 'string' && value.trim().length > 0) : undefined;
  if (!status || !failureKind || !evidence) {
    return null;
  }
  return {
    status,
    failureKind,
    evidence,
    source: 'llm',
    missingFields,
    validationMessages
  };
}
export class OutcomeVerifier {
  constructor(provider, config) {
    this.provider = provider;
    this.config = config;
  }
  isEnabled() {
    return this.config.verifier?.enabled !== false;
  }
  getMaxFollowupSteps() {
    return this.config.verifier?.maxFollowupSteps ?? 2;
  }
  isCriticalAction(action) {
    return isCriticalVerificationAction(action);
  }
  async verify(context) {
    const stageA = deterministicVerify(context);
    if (stageA.status !== 'uncertain') {
      return stageA;
    }
    const stageB = await llmVerify(this.provider, context);
    return stageB ?? stageA;
  }
}
//# sourceMappingURL=OutcomeVerifier.js.map