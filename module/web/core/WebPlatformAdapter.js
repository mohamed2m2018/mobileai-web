"use strict";

import React from 'react';
import { globalBlockRegistry } from "../../core/BlockRegistry.js";
import { globalZoneRegistry } from "../../core/ZoneRegistry.js";
import { logger } from "../../utils/logger.js";
import { installPageDebug, getConsole, getNetwork } from "./pageDebug.js";
import { PageControllerWeb } from "./PageControllerWeb.js";
import { waitForPageStable } from "./waitForStable.js";
function getNodeWindow(node) {
  return node?.ownerDocument?.defaultView || null;
}
function isInstanceOf(node, constructorName) {
  const Ctor = getNodeWindow(node)?.[constructorName];
  return !!Ctor && node instanceof Ctor;
}
function isInputElement(node) {
  return isInstanceOf(node, 'HTMLInputElement');
}
// A credential/secret field the AI must NEVER fill — the value would pass
// through the AI. Code-enforced (the prompt rule alone doesn't stop the model
// once a user volunteers a password in chat). Covers password inputs plus
// card-number / CVV / password autocomplete hints.
function isSecretField(node) {
  if (!isInputElement(node)) return false;
  const typeAttr = String(node.type || node.getAttribute?.('type') || '').toLowerCase();
  if (typeAttr === 'password') return true;
  const autocomplete = String(node.autocomplete || node.getAttribute?.('autocomplete') || '').toLowerCase();
  return (
    autocomplete.includes('cc-number') ||
    autocomplete.includes('cc-csc') ||
    autocomplete.includes('current-password') ||
    autocomplete.includes('new-password')
  );
}
function isTextAreaElement(node) {
  return isInstanceOf(node, 'HTMLTextAreaElement');
}
function isSelectElement(node) {
  return isInstanceOf(node, 'HTMLSelectElement');
}
function isDocumentNode(node) {
  return !!node && typeof node === 'object' && 'documentElement' in node && 'body' in node;
}
function isHTMLElementLike(node) {
  return !!node && typeof node === 'object' && 'tagName' in node;
}
function getScrollPosition(target) {
  if (isHTMLElementLike(target)) {
    return {
      top: target.scrollTop || 0,
      left: target.scrollLeft || 0
    };
  }
  return {
    top: target?.scrollY || target?.pageYOffset || 0,
    left: target?.scrollX || target?.pageXOffset || 0
  };
}
function getScrollLimits(target, doc) {
  if (isHTMLElementLike(target)) {
    return {
      top: Math.max(0, target.scrollHeight - target.clientHeight),
      left: Math.max(0, target.scrollWidth - target.clientWidth)
    };
  }
  const body = doc?.body;
  const element = doc?.documentElement;
  return {
    top: Math.max(0, Math.max(element?.scrollHeight || 0, body?.scrollHeight || 0) - (target?.innerHeight || 0)),
    left: Math.max(0, Math.max(element?.scrollWidth || 0, body?.scrollWidth || 0) - (target?.innerWidth || 0))
  };
}
function isScrollableTarget(node, win) {
  if (!isHTMLElementLike(node) || !win?.getComputedStyle) return false;
  const style = win.getComputedStyle(node);
  const hasScrollableY = /(auto|scroll|overlay)/.test(style?.overflowY || '');
  return hasScrollableY && node.scrollHeight > node.clientHeight;
}
function findScrollableTarget(node, win) {
  let current = isHTMLElementLike(node) ? node : null;
  while (current) {
    if (isScrollableTarget(current, win)) return current;
    current = current.parentElement;
  }
  return null;
}
// True when the node is part of the agent's own UI (the chat widget), which is
// marked with data-ai-ignore. Used to keep page scrolls from targeting
// the widget's scrollable chat panel — when the widget has focus its container
// would otherwise hijack a "scroll the page" request (e.g. on an article page).
function isInsideAgentUI(node) {
  let current = isHTMLElementLike(node) ? node : null;
  while (current) {
    if (current.getAttribute?.('data-ai-ignore') != null) return true;
    current = current.parentElement;
  }
  return false;
}
// Default tooltip label for guide_user when no message is provided but an
// action tag is set (matches RN's default-label behavior).
function defaultGuideLabel(action) {
  switch (action) {
    case 'tap': return 'Tap here';
    case 'read': return 'Reading this';
    case 'type': return 'Type here';
    case 'verify': return 'Checking this';
    case 'scroll': return 'Scroll here';
    case 'fill': return 'Fill this in';
    case 'wait': return 'Please wait';
    default: return '';
  }
}
function getScrollTargetName(target) {
  if (isHTMLElementLike(target)) {
    const id = target.id ? `#${target.id}` : '';
    return `${target.tagName.toLowerCase()}${id}`;
  }
  return 'page';
}
function normalizeRouteText(value) {
  return String(value || '').toLowerCase().replace(/[?#].*$/, '').replace(/[-_/]+/g, ' ').replace(/\b(open|go|to|the|page|screen|tab|section|please)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function getElementText(element) {
  return String(element?.getAttribute?.('aria-label') || element?.getAttribute?.('title') || element?.textContent || '').replace(/\s+/g, ' ').trim();
}
function normalizeHref(rawHref, win) {
  if (!rawHref || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
    return null;
  }
  try {
    const url = new URL(rawHref, win?.location?.href || 'https://example.com/');
    if (win?.location?.origin && url.origin !== win.location.origin) {
      return url.href;
    }
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return rawHref.startsWith('/') || rawHref.startsWith('#') ? rawHref : null;
  }
}
function collectRouteAnchors(root) {
  const anchors = [];
  const seen = new Set();
  const visitRoot = currentRoot => {
    if (!currentRoot || typeof currentRoot.querySelectorAll !== 'function') return;
    Array.from(currentRoot.querySelectorAll('a[href]')).forEach(anchor => {
      if (isHTMLElementLike(anchor) && !seen.has(anchor)) {
        seen.add(anchor);
        anchors.push(anchor);
      }
    });
    Array.from(currentRoot.querySelectorAll('*')).forEach(element => {
      if (isHTMLElementLike(element) && element.shadowRoot) visitRoot(element.shadowRoot);
    });
    Array.from(currentRoot.querySelectorAll('iframe')).forEach(frame => {
      try {
        const iframeDoc = frame.contentDocument || frame.contentWindow?.document;
        if (iframeDoc?.body) visitRoot(iframeDoc.body);
      } catch {
        // Cross-origin frames are intentionally opaque.
      }
    });
  };
  visitRoot(root);
  return anchors;
}
function routeMatchScore(target, anchor, href) {
  const targetText = normalizeRouteText(target);
  if (!targetText) return 0;
  const label = normalizeRouteText(getElementText(anchor));
  const hrefText = normalizeRouteText(href);
  const pathname = normalizeRouteText(href.split(/[?#]/)[0].split('/').filter(Boolean).pop() || href);
  if (label && label === targetText) return 120;
  if (hrefText && hrefText === targetText) return 110;
  if (pathname && pathname === targetText) return 95;
  const targetParts = targetText.split(' ').filter(Boolean);
  if (targetParts.length > 0 && label && targetParts.every(part => label.includes(part))) return 85;
  if (targetParts.length > 0 && hrefText && targetParts.every(part => hrefText.includes(part))) return 75;
  return 0;
}
function getDocumentFromRoot(root) {
  if (!root) return typeof document !== 'undefined' ? document : null;
  if (isDocumentNode(root)) return root;
  return root.ownerDocument || null;
}
function waitForScrollSettle(win) {
  return new Promise(resolve => {
    // requestAnimationFrame is PAUSED while the document is hidden/backgrounded, so a
    // bare double-rAF here can never resolve when the agent runs in an inactive tab —
    // the scroll action then hangs forever and the whole step stalls. Race the rAF
    // against a setTimeout fallback (timers still fire, just throttled when hidden) so
    // this always settles: ~32ms when visible, ≤~1s when hidden. Never infinite.
    let settled = false;
    const finish = () => { if (!settled) { settled = true; resolve(); } };
    const schedule = win?.requestAnimationFrame ? callback => win.requestAnimationFrame(callback) : callback => setTimeout(callback, 16);
    schedule(() => schedule(finish));
    setTimeout(finish, 250);
  });
}
function parsePropsArg(rawProps) {
  if (!rawProps) return {};
  if (typeof rawProps === 'string') {
    const trimmed = rawProps.trim();
    if (!trimmed) return {};
    return JSON.parse(trimmed);
  }
  if (typeof rawProps === 'object' && !Array.isArray(rawProps)) {
    return rawProps;
  }
  throw new Error('Props must be an object or JSON object string.');
}
function getAllowedZoneBlocks(zone) {
  if (Array.isArray(zone?.blocks) && zone.blocks.length > 0) {
    return zone.blocks;
  }
  if (Array.isArray(zone?.templates) && zone.templates.length > 0) {
    return zone.templates.map(candidate => globalBlockRegistry.get(candidate?.displayName || candidate?.name)).filter(candidate => !!candidate);
  }
  return [];
}
// --- STALE_TARGET element resolution (mirrors RN ReactNativePlatformAdapter) ---
// The web element model carries: index, type, label, zoneId/analyticsZoneId and a
// props bag (props.role, props.selector, props.name). RN keys off type/label/role/
// stableId/zoneId; the web equivalents below mirror that intent with the fields the
// web snapshot actually exposes (selector / input name stand in for RN's stableId).
function normalizeTargetText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function isInformativeTargetText(value) {
  if (!value) return false;
  if (/^\[[a-z-]+\]$/.test(value)) return false;
  if (value.length < 2) return false;
  return !new Set(['button', 'pressable', 'text input', 'text-input', 'input', 'switch', 'radio', 'slider', 'picker', 'date picker', 'item', 'row', 'card', 'link', 'tab']).has(value);
}
function labelsCompatible(a, b) {
  if (!a || !b) return true;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}
function buildTargetSignature(element) {
  const props = element?.props || {};
  return {
    type: normalizeTargetText(element?.type),
    label: normalizeTargetText(element?.label),
    // selector / input name are the closest web stand-ins for RN's stable id.
    stableId: normalizeTargetText(props.selector || props.name),
    role: normalizeTargetText(props.role),
    zoneId: normalizeTargetText(element?.zoneId || element?.analyticsZoneId)
  };
}
function signaturesHaveStrongConflict(observed, candidate) {
  if (observed.type && candidate.type && observed.type !== candidate.type) return true;
  if (observed.role && candidate.role && observed.role !== candidate.role) return true;
  if (observed.zoneId && candidate.zoneId && observed.zoneId !== candidate.zoneId) return true;
  const observedLabel = observed.label;
  const candidateLabel = candidate.label;
  if (isInformativeTargetText(observedLabel) && isInformativeTargetText(candidateLabel) && !labelsCompatible(observedLabel, candidateLabel)) {
    return true;
  }
  return false;
}
// True when the same-index element still looks like the one the model observed.
function sameIndexStillMatches(observed, candidate) {
  return !signaturesHaveStrongConflict(buildTargetSignature(observed), buildTargetSignature(candidate));
}
// Higher = better match. Exact label scores high, role match adds, partial label
// match adds less, mismatched label is strongly penalized. stableId match wins
// outright; a stableId conflict rules a candidate out entirely.
function scoreTargetMatch(observed, candidate) {
  const a = buildTargetSignature(observed);
  const b = buildTargetSignature(candidate);
  if (a.type && b.type && a.type !== b.type) return Number.NEGATIVE_INFINITY;
  if (a.stableId && b.stableId) {
    return a.stableId === b.stableId ? 120 : Number.NEGATIVE_INFINITY;
  }
  let score = 0;
  if (isInformativeTargetText(a.label) && isInformativeTargetText(b.label)) {
    if (a.label === b.label) score += 70;
    else if (labelsCompatible(a.label, b.label)) score += 45;
    else score -= 80;
  }
  if (a.role && b.role) score += a.role === b.role ? 15 : -25;
  if (a.zoneId && b.zoneId) score += a.zoneId === b.zoneId ? 25 : -30;
  return score;
}
export class WebPlatformAdapter {
  lastSnapshot = null;
  lastController = null;
  constructor(options) {
    this.options = options;
    // Start capturing console + network so read_console/read_network can diagnose silent failures.
    try { installPageDebug(); } catch { /* never break construction */ }
  }
  // read_console / read_network: in-page debugging perception (metadata only, secrets redacted).
  readConsole(limit) { try { return getConsole(limit); } catch (err) { return `read_console failed: ${err?.message || 'unknown'}`; } }
  readNetwork(limit) { try { return getNetwork(limit); } catch (err) { return `read_network failed: ${err?.message || 'unknown'}`; } }
  getLastScreenSnapshot() {
    return this.lastSnapshot;
  }
  getNavigationSnapshot() {
    return {
      currentScreenName: this.getCurrentScreenName(),
      availableScreens: this.getAvailableScreens()
    };
  }
  getScreenSnapshot() {
    // Reading the page must NEVER throw out of here. Right after a mutating action
    // (e.g. changing a <select> that makes a framework inject/detach dependent
    // fields), the DOM can be mid-rewrite and traversal can hit a detached node or a
    // bad rect. A throw used to bubble up and leave the agent step with no result at
    // all — the run stalled. Fall back to the last good snapshot so the agent keeps
    // real screen context and the step always completes.
    try {
      const controller = new PageControllerWeb(this.options.getRoot(), {
        ignoreSelectors: this.options.ignoreSelectors,
        confirmSelectors: this.options.confirmSelectors,
        interactiveCap: this.options.interactiveCap,
      });
      const snapshot = controller.buildScreenSnapshot(this.getCurrentScreenName(), this.getAvailableScreens());
      this.lastController = controller;
      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (err) {
      logger.warn('WebPlatformAdapter', `getScreenSnapshot failed, reusing last snapshot: ${err?.message}`);
      return this.lastSnapshot || {
        screenName: this.getCurrentScreenName(),
        availableScreens: this.getAvailableScreens(),
        elementsText: '',
        elements: [],
      };
    }
  }
  async captureScreenshot() {
    if (!this.options.captureScreenshot) return undefined;
    return this.options.captureScreenshot();
  }
  // read_more: page the content the snapshot caps trimmed (hidden controls + off-screen
  // text), WITHOUT scrolling. Non-mutating — builds a fresh controller on the current DOM.
  readMore(offset = 0, chunk = undefined) {
    try {
      const controller = new PageControllerWeb(this.options.getRoot(), {
        ignoreSelectors: this.options.ignoreSelectors,
        confirmSelectors: this.options.confirmSelectors,
        interactiveCap: this.options.interactiveCap,
      });
      return controller.getMoreStructure(offset, chunk);
    } catch (err) {
      logger.warn('WebPlatformAdapter', `readMore failed: ${err?.message}`);
      return { text: '', nextOffset: offset, hasMore: false, total: 0, exhausted: true };
    }
  }
  // read_more(index): full detail of one element (all options, full label/nearby/text).
  readElementDetail(index) {
    try {
      const controller = new PageControllerWeb(this.options.getRoot(), {
        ignoreSelectors: this.options.ignoreSelectors,
        confirmSelectors: this.options.confirmSelectors,
        interactiveCap: this.options.interactiveCap,
      });
      return controller.getElementDetail(index);
    } catch (err) {
      logger.warn('WebPlatformAdapter', `readElementDetail failed: ${err?.message}`);
      return { found: false, text: `Could not read element ${index}.` };
    }
  }
  // find: natural-language element search over the FULL (uncapped) interactive list — the same
  // source read_more pages, so it reaches controls trimmed from the screen skeleton. Returns up
  // to `limit` best matches as {index,type,label} so the agent acts by index without scrolling
  // or dumping the whole list. Ranking is generic relevance (token coverage), NOT a hardcoded
  // label list. Non-mutating.
  findElements(query, limit = 12) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    try {
      const controller = new PageControllerWeb(this.options.getRoot(), {
        ignoreSelectors: this.options.ignoreSelectors,
        confirmSelectors: this.options.confirmSelectors,
        interactiveCap: this.options.interactiveCap,
      });
      const all = controller.collectInteractives() || [];
      const tokens = q.split(/\s+/).filter(t => t.length > 1);
      if (!tokens.length) return [];
      const scored = [];
      for (const entry of all) {
        if (!entry || entry.index == null) continue;
        // Include the element's IDENTIFYING attributes, not just the visible label. An
        // icon-only control (e.g. a magnifying-glass search button with id="lbtn_Search",
        // no text/aria label) is otherwise unmatchable — the model queried "search button"/
        // "lbtn_Search" 5× and find returned nothing, so it looped. id/name/title/aria-label/
        // placeholder/alt carry the real signal ("search" lives in the id here). Read straight
        // off the collected DOM node (props.domNode) — no dehydrator change needed. These are
        // low-noise identifiers (NOT class, which is full of utility tokens that mis-match).
        const node = entry.props?.domNode;
        const attrText = node && typeof node.getAttribute === 'function'
          ? [node.id, node.getAttribute('name'), node.getAttribute('title'),
             node.getAttribute('aria-label'), node.getAttribute('placeholder'),
             node.getAttribute('alt'), node.getAttribute('value')].filter(Boolean).join(' ')
          : '';
        const hay = [entry.label, entry.type, entry.props?.nearbyText, attrText]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay) continue;
        let score = 0;
        for (const t of tokens) if (hay.includes(t)) score += 1;
        if (!score) continue;
        // Boost a whole-phrase hit, and a hit that lands in the LABEL (vs only nearby text).
        if (hay.includes(q)) score += tokens.length;
        if (typeof entry.label === 'string' && entry.label.toLowerCase().includes(q)) score += 1;
        scored.push({ entry, score });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map(({ entry }) => ({
        index: entry.index,
        type: entry.type || 'element',
        label: typeof entry.label === 'string' ? entry.label : '',
      }));
    } catch (err) {
      logger.warn('WebPlatformAdapter', `findElements failed: ${err?.message}`);
      return [];
    }
  }
  // get_page_text: the page's MAIN prose for answering a content question. Delegates to the
  // controller's getMainText (reuses the dehydrator's semantic extraction). Non-mutating.
  getPageText(maxChars = 8000) {
    try {
      const controller = new PageControllerWeb(this.options.getRoot(), {
        ignoreSelectors: this.options.ignoreSelectors,
        confirmSelectors: this.options.confirmSelectors,
        interactiveCap: this.options.interactiveCap,
      });
      return controller.getMainText(maxChars);
    } catch (err) {
      logger.warn('WebPlatformAdapter', `getPageText failed: ${err?.message}`);
      return '';
    }
  }
  async executeAction(intent) {
    switch (intent.type) {
      case 'tap':
        return this.tap(intent.index, intent.label);
      case 'long_press':
        return this.longPress(intent.index, intent.label);
      case 'type':
        return this.typeText(intent.index, intent.text, intent.submit, intent.label);
      case 'press_enter':
        return this.pressEnter(intent.index);
      case 'tap_at':
        return this.tapAt(intent.x, intent.y, intent.label);
      case 'scroll':
        return this.scroll(intent.direction, intent.amount, intent.containerIndex);
      case 'adjust_slider':
        return this.adjustSlider(intent.index, intent.value);
      case 'select_picker':
        return this.selectPicker(intent.index, intent.value);
      case 'set_date':
        return this.setDate(intent.index, intent.date);
      case 'dismiss_keyboard':
        return this.dismissKeyboard();
      case 'dismiss_modal':
        return this.dismissModal();
      case 'guide_user':
        return this.guideUser(intent.index, intent.message, intent.autoRemoveAfterMs, intent.action);
      case 'simplify_zone':
        return this.simplifyZone(intent.zoneId);
      case 'render_block':
        return this.renderBlock(intent.zoneId, intent.blockType, intent.props, intent.lifecycle);
      case 'inject_card':
        return this.injectCard(intent.zoneId, intent.templateName, intent.props);
      case 'restore_zone':
        return this.restoreZone(intent.zoneId);
      case 'navigate':
        return this.navigate(intent.screen, intent.params);
      default:
        return '❌ Unsupported action intent.';
    }
  }
  // Wait for the page to SETTLE after an action before the next snapshot is taken.
  // Without this, a navigating tap/press_enter on a fast SPA (e.g. noon) snapshots a
  // transient mid-navigation screen; the agent reasons over it, and by the time its
  // next action fires the route has changed → STALE_TARGET, and a wasted re-read step.
  // Settled = the URL (which IS the screenName) has stopped changing for a quiet window
  // AND the document is ready. Returns fast when nothing navigated; capped so it can
  // never hang the step.
  // Returns TRUE when the page reached a settled state (readyState complete + URL stable),
  // FALSE when it hit the maxMs timeout while still loading. The server's dead-action guard
  // uses this: an unchanged screen is only a dead loop if the page actually settled — never
  // while it's still loading. Logic lives in waitForStable.js (framework-free, unit-tested).
  async waitForStable(maxMs = 1800) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return true;
    return waitForPageStable(window, document, maxMs);
  }
  getCurrentScreenName() {
    if (this.options.getCurrentScreenName) {
      return this.options.getCurrentScreenName();
    }
    if (this.options.router?.getCurrentScreenName) {
      return this.options.router.getCurrentScreenName();
    }
    if (this.options.pathname) {
      return this.options.pathname;
    }
    if (typeof window !== 'undefined' && window.location) {
      return window.location.pathname || '/';
    }
    return '/';
  }
  getAvailableScreens() {
    if (this.options.getAvailableScreens) {
      return this.options.getAvailableScreens();
    }
    if (this.options.router?.getAvailableScreens) {
      return this.options.router.getAvailableScreens();
    }
    const current = this.getCurrentScreenName();
    return current ? [current] : [];
  }
  getSnapshotElement(index) {
    const snapshot = this.lastSnapshot || this.getScreenSnapshot();
    return snapshot.elements.find(entry => entry.index === index);
  }
  getController() {
    if (!this.lastController) {
      this.getScreenSnapshot();
    }
    return this.lastController;
  }
  getDomNode(index) {
    const node = this.getController()?.getElement(index);
    return node && typeof node === 'object' && 'tagName' in node ? node : null;
  }
  // Re-snapshots at action time and resolves the element the model intended,
  // detecting staleness (screen changed, or the same-index element no longer
  // matches what was observed) and relocating by signature. Mirrors RN's
  // resolveInteractiveElement. Returns { ok:true, index, label, node } against a
  // FRESH controller, or { ok:false, message }.
  // Relocate by the model's intended LABEL when the positional index has drifted. The
  // index is only a hint on a lazy-loading/re-rendering page; the label is the stable
  // identity. Prefer an exact label match, else a unique substring match; on ties pick
  // the candidate nearest the model's index hint. Returns null when nothing matches
  // (e.g. the model targeted a labelless/hallucinated element) so the caller can report.
  relocateByLabel(elements, intendedLabel, hintIndex) {
    const want = normalizeTargetText(intendedLabel);
    if (!want || want.length < 2) return null;
    const exact = elements.filter(e => normalizeTargetText(e.label) === want);
    const pool = exact.length ? exact : elements.filter(e => {
      const l = normalizeTargetText(e.label);
      return l && l.length >= 2 && (l.includes(want) || want.includes(l));
    });
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    return pool.reduce((best, e) =>
      Math.abs(e.index - hintIndex) < Math.abs(best.index - hintIndex) ? e : best);
  }
  resolveInteractiveElement(index, actionName, intendedLabel) {
    // 1. Capture what the model observed BEFORE re-snapshotting.
    const observedSnapshot = this.lastSnapshot;
    const observedElement = observedSnapshot?.elements.find(entry => entry.index === index);
    // 2. Re-snapshot fresh — current elements + a fresh controller (fresh nodes).
    const currentSnapshot = this.getScreenSnapshot();
    const elements = currentSnapshot.elements;
    const sameIndexElement = elements.find(entry => entry.index === index);
    // 3. Screen changed out from under the model → stale.
    if (observedSnapshot?.screenName && currentSnapshot.screenName && observedSnapshot.screenName !== currentSnapshot.screenName) {
      return {
        ok: false,
        message: `❌ STALE_TARGET: The screen changed from "${observedSnapshot.screenName}" to "${currentSnapshot.screenName}" before ${actionName}. Re-read the current screen and choose the target again.`
      };
    }
    // 4. No observed element (model never read it / older snapshot) → fall back to
    //    same-index if present, else not-found with available indexes.
    if (!observedElement) {
      if (sameIndexElement) {
        return {
          ok: true,
          index: sameIndexElement.index,
          label: sameIndexElement.label,
          node: this.getController()?.getElement(sameIndexElement.index) || null
        };
      }
      // The positional index drifted (page lazy-loaded / re-rendered). Relocate by the
      // model's intended LABEL — the stable identity — so the action still lands on the
      // control the model meant, instead of failing.
      const byLabel = this.relocateByLabel(elements, intendedLabel, index);
      if (byLabel) {
        return {
          ok: true,
          index: byLabel.index,
          label: byLabel.label,
          node: this.getController()?.getElement(byLabel.index) || null,
          relocated: true,
        };
      }
      // Concise + diagnostic: the previous message dumped every index and got
      // truncated in logs (hiding the real counts). Report the current range and BOTH
      // counts so prod logs reveal index drift (observed 240 → current 19 = the page
      // re-rendered) vs a hallucinated index (observed had no such index). Also steer
      // the model to re-pick by LABEL against the fresh list instead of a stale index.
      const observedCount = observedSnapshot?.elements?.length ?? 0;
      return {
        ok: false,
        message: `❌ Element [${index}] not found — the screen now has ${elements.length} interactive elements (indexes 0–${Math.max(0, elements.length - 1)}); your snapshot listed ${observedCount}. The list shifts as the page loads/re-renders. Re-read the CURRENT elements and pick the target by its LABEL, not the old index.`
      };
    }
    // 5. Same-index element still matches the observed one → use the fresh node.
    if (sameIndexElement && sameIndexStillMatches(observedElement, sameIndexElement)) {
      return {
        ok: true,
        index: sameIndexElement.index,
        label: sameIndexElement.label,
        node: this.getController()?.getElement(sameIndexElement.index) || null
      };
    }
    // 6. Otherwise score all current elements against the observed one and pick
    //    the single clear winner above threshold; relocate. Ambiguity → stale.
    const scored = elements.map(entry => ({
      element: entry,
      score: scoreTargetMatch(observedElement, entry)
    })).filter(entry => entry.score >= 60).sort((a, b) => b.score - a.score);
    const topScore = scored.length > 0 ? scored[0].score : Number.NEGATIVE_INFINITY;
    const best = scored.filter(entry => entry.score === topScore);
    if (best.length === 1) {
      const relocated = best[0].element;
      if (relocated.index !== index) {
        logger.info('WebPlatformAdapter', `STALE_TARGET recovered for ${actionName}: [${index}] "${observedElement.label}" relocated to [${relocated.index}] "${relocated.label}"`);
      }
      return {
        ok: true,
        index: relocated.index,
        label: relocated.label,
        node: this.getController()?.getElement(relocated.index) || null
      };
    }
    // Scoring against the observed element was ambiguous/empty — try the model's
    // intended label as a last resort before declaring stale.
    const byLabel = this.relocateByLabel(elements, intendedLabel, index);
    if (byLabel) {
      logger.info('WebPlatformAdapter', `Relocated ${actionName} [${index}] to "${byLabel.label}" by label`);
      return {
        ok: true,
        index: byLabel.index,
        label: byLabel.label,
        node: this.getController()?.getElement(byLabel.index) || null,
        relocated: true,
      };
    }
    const currentLabel = sameIndexElement ? `"${sameIndexElement.label}"` : 'no current element';
    const reason = scored.length > 1 ? `multiple matching targets (${scored.map(entry => `[${entry.element.index}] "${entry.element.label}"`).join(', ')})` : `observed [${index}] "${observedElement.label}" now points to ${currentLabel}`;
    return {
      ok: false,
      message: `❌ STALE_TARGET: The UI changed before ${actionName}. ${reason}. Re-read the current screen and choose the target again.`
    };
  }
  getView(node) {
    return node?.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
  }
  scrollNodeIntoView(node) {
    if (!node?.scrollIntoView) return;
    node.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest'
    });
  }
  dispatchPointerSequence(node) {
    const view = this.getView(node);
    if (!view) return;
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hitTarget = node.ownerDocument?.elementFromPoint?.(x, y);
    const target = isHTMLElementLike(hitTarget) && node.contains(hitTarget) ? hitTarget : node;
    const pointerOpts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerType: 'mouse'
    };
    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    };
    const PointerEventCtor = view.PointerEvent;
    if (PointerEventCtor) {
      target.dispatchEvent(new PointerEventCtor('pointerover', pointerOpts));
      target.dispatchEvent(new PointerEventCtor('pointerenter', {
        ...pointerOpts,
        bubbles: false
      }));
      target.dispatchEvent(new PointerEventCtor('pointerdown', pointerOpts));
    }
    target.dispatchEvent(new view.MouseEvent('mouseover', mouseOpts));
    target.dispatchEvent(new view.MouseEvent('mouseenter', {
      ...mouseOpts,
      bubbles: false
    }));
    target.dispatchEvent(new view.MouseEvent('mousedown', mouseOpts));
    node.focus?.({
      preventScroll: true
    });
    if (PointerEventCtor) {
      target.dispatchEvent(new PointerEventCtor('pointerup', pointerOpts));
    }
    target.dispatchEvent(new view.MouseEvent('mouseup', mouseOpts));
    // Fire the activation click on the element that actually acts. elementFromPoint may
    // resolve to a passive inner node — a product-card heading or an <svg> icon — whose
    // bare .click() does nothing AND does not bubble to the wrapping <a href>/<button>, so
    // the tap silently no-ops (the agent then thinks the screen is frozen). resolveActivationTarget
    // climbs to the real control so taps navigate / activate.
    const clickTarget = this.resolveActivationTarget(node, target);
    if (typeof clickTarget.click === 'function') {
      clickTarget.click();
    } else if (typeof node.click === 'function') {
      node.click();
    } else {
      clickTarget.dispatchEvent(new view.MouseEvent('click', mouseOpts));
    }
  }
  // Resolve which element a tap should activate. A form control (button/input/select/
  // textarea/contenteditable) acts in place — never hijack it to a parent link. Anything
  // else (a heading, span, image, or [role=button] decoration) that sits inside a navigating
  // <a href>/<button> activates that ancestor, because a bare click on the inner element does
  // not bubble to it. This is the noon product-card case: the card is one big <a href> and the
  // title heading is indexed separately; tapping the heading must still open the product.
  resolveActivationTarget(node, target) {
    const FORM_CONTROL = 'button, input, select, textarea, [contenteditable="true"]';
    if (node && typeof node.matches === 'function' && node.matches(FORM_CONTROL)) return node;
    const nav =
      (node && typeof node.closest === 'function' && node.closest('a[href], button')) ||
      (target && target !== node && typeof target.closest === 'function' && target.closest('a[href], button'));
    if (nav) return nav;
    return target;
  }
  // Long-press == press-and-hold that raises a `contextmenu` (the web/touch
  // equivalent of RN onLongPress). Deliberately omits `click()` so handlers can
  // distinguish a hold from a tap.
  async dispatchLongPressSequence(node, holdMs = 600) {
    const view = this.getView(node);
    if (!view) return;
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hitTarget = node.ownerDocument?.elementFromPoint?.(x, y);
    const target = isHTMLElementLike(hitTarget) && node.contains(hitTarget) ? hitTarget : node;
    const pointerOpts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerType: 'mouse'
    };
    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    };
    const PointerEventCtor = view.PointerEvent;
    if (PointerEventCtor) {
      target.dispatchEvent(new PointerEventCtor('pointerover', pointerOpts));
      target.dispatchEvent(new PointerEventCtor('pointerenter', {
        ...pointerOpts,
        bubbles: false
      }));
      target.dispatchEvent(new PointerEventCtor('pointerdown', pointerOpts));
    }
    target.dispatchEvent(new view.MouseEvent('mouseover', mouseOpts));
    target.dispatchEvent(new view.MouseEvent('mousedown', mouseOpts));
    node.focus?.({
      preventScroll: true
    });
    await new Promise(resolve => setTimeout(resolve, holdMs));
    target.dispatchEvent(new view.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 2
    }));
    if (PointerEventCtor) {
      target.dispatchEvent(new PointerEventCtor('pointerup', pointerOpts));
    }
    target.dispatchEvent(new view.MouseEvent('mouseup', mouseOpts));
  }
  setNativeValue(node, value) {
    const prototype = Object.getPrototypeOf(node);
    const descriptor = prototype ? Object.getOwnPropertyDescriptor(prototype, 'value') : undefined;
    if (descriptor?.set) {
      descriptor.set.call(node, value);
      return;
    }
    node.value = value;
  }
  dispatchTextInputEvents(node, text) {
    const doc = node.ownerDocument;
    const view = this.getView(node);
    if (!view) return;
    const InputEventCtor = view.InputEvent;
    if (InputEventCtor) {
      node.dispatchEvent(new InputEventCtor('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    }
    node.dispatchEvent(new view.Event('input', {
      bubbles: true
    }));
    node.dispatchEvent(new view.Event('change', {
      bubbles: true
    }));
  }
  // Mirror the dehydrator's effective-rect logic: a control whose own box is
  // zero-area (float-collapse, display:contents, inline wrapper) still renders via
  // its children, so highlight where it actually appears instead of skipping it.
  _effectiveRect(node) {
    const own = node.getBoundingClientRect();
    if (own && own.width > 0 && own.height > 0) return own;
    let union = null;
    const children = node.children ? Array.from(node.children) : [];
    for (const child of children) {
      if (typeof child.getBoundingClientRect !== 'function') continue;
      const r = child.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      union = union
        ? { left: Math.min(union.left, r.left), top: Math.min(union.top, r.top), right: Math.max(union.right, r.right), bottom: Math.max(union.bottom, r.bottom) }
        : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    if (!union) return own;
    return { left: union.left, top: union.top, right: union.right, bottom: union.bottom, width: union.right - union.left, height: union.bottom - union.top };
  }
  getViewportRect(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = this._effectiveRect(node);
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    let offsetX = 0;
    let offsetY = 0;
    let doc = node.ownerDocument;
    while (doc) {
      const win = doc.defaultView;
      if (!win || win === win.parent) break;
      try {
        const frame = win.frameElement;
        if (!frame) break;
        const frameRect = frame.getBoundingClientRect();
        offsetX += frameRect.left;
        offsetY += frameRect.top;
        doc = frame.ownerDocument;
      } catch { break; }
    }
    if (offsetX === 0 && offsetY === 0) return rect;
    return { left: rect.left + offsetX, top: rect.top + offsetY, width: rect.width, height: rect.height, right: rect.right + offsetX, bottom: rect.bottom + offsetY };
  }
  async showActionHighlight(node, action, durationMs = 600) {
    if (!node || typeof node.getBoundingClientRect !== 'function' || !this.options.onGuide) {
      return;
    }
    const rect = this.getViewportRect(node);
    if (!rect) {
      return;
    }
    this.options.onGuide({
      targetRect: rect,
      targetNode: node,
      message: '',
      action,
      autoRemoveAfterMs: durationMs + 400
    });
    // Give the ring a frame to paint before the action mutates/navigates the DOM.
    const view = this.getView(node);
    await new Promise(resolve => {
      // Same hidden-tab hazard as waitForScrollSettle: if rAF is paused, the inner
      // setTimeout is never scheduled and this await hangs the action forever. Race a
      // fallback timer so the highlight delay always elapses and the action proceeds.
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      const raf = view?.requestAnimationFrame ? callback => view.requestAnimationFrame(callback) : callback => setTimeout(callback, 16);
      raf(() => setTimeout(finish, 340));
      setTimeout(finish, 800);
    });
  }
  async tap(index, intendedLabel) {
    const resolved = this.resolveInteractiveElement(index, 'tap', intendedLabel);
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!node) {
      return `❌ Element with index ${resolvedIndex} not found.`;
    }
    this.scrollNodeIntoView(node);
    await this.showActionHighlight(node, 'tap');
    this.dispatchPointerSequence(node);
    return `✅ Tapped [${resolvedIndex}] "${label}"`;
  }
  // tap_at: coordinate-click FALLBACK for a control the agent can SEE (screenshot) but that isn't
  // in the element list. Hit-test the point, then run the same realistic click sequence tap() uses.
  async tapAt(x, y, label) {
    const cx = Number(x);
    const cy = Number(y);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return `❌ tap_at needs numeric x and y.`;
    const root = this.options.getRoot?.();
    const doc = isDocumentNode(root) ? root : (root?.ownerDocument || (typeof document !== 'undefined' ? document : null));
    if (!doc || typeof doc.elementFromPoint !== 'function') return `❌ tap_at: no document to click into.`;
    const node = doc.elementFromPoint(cx, cy);
    if (!node || typeof node.dispatchEvent !== 'function') {
      return `❌ tap_at: nothing clickable at (${cx}, ${cy}) — it may be off-screen. Scroll or look again, then retry.`;
    }
    try {
      this.scrollNodeIntoView(node);
      await this.showActionHighlight(node, 'tap');
      this.dispatchPointerSequence(node);
      return `✅ Clicked "${label || 'target'}" at (${cx}, ${cy}).`;
    } catch (err) {
      return `❌ tap_at failed: ${err?.message || 'unknown error'}`;
    }
  }
  async longPress(index, intendedLabel) {
    const resolved = this.resolveInteractiveElement(index, 'long_press', intendedLabel);
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!node) {
      return `❌ Element with index ${resolvedIndex} not found.`;
    }
    this.scrollNodeIntoView(node);
    await this.showActionHighlight(node, 'tap');
    await this.dispatchLongPressSequence(node);
    return `✅ Long-pressed [${resolvedIndex}] "${label}"`;
  }
  dispatchInputEvents(node) {
    const doc = node.ownerDocument;
    const view = doc?.defaultView;
    if (!view) return;
    node.dispatchEvent(new view.Event('input', {
      bubbles: true
    }));
    node.dispatchEvent(new view.Event('change', {
      bubbles: true
    }));
  }
  async typeText(index, text, submit, intendedLabel) {
    const resolved = this.resolveInteractiveElement(index, 'type', intendedLabel);
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!node) {
      return `❌ Element with index ${resolvedIndex} not found.`;
    }
    if (isSecretField(node)) {
      return `🔒 Refused to type into [${resolvedIndex}] "${label}" — it is a password or other secret field. For the user's security a credential must NEVER pass through the AI or be filled by it. Do not attempt to fill it and do not ask for it in chat. Instead, ask the user to type it directly into this field on the page themselves (you cannot see it), and continue once they confirm it is filled.`;
    }
    if (isInputElement(node) || isTextAreaElement(node)) {
      this.scrollNodeIntoView(node);
      await this.showActionHighlight(node, 'type');
      node.focus();
      this.setNativeValue(node, text);
      this.dispatchTextInputEvents(node, text);
      const submitted = submit ? this.submitFromNode(node) : false;
      return `✅ Typed "${text}" into [${resolvedIndex}] "${label}"${submitted ? ' and submitted' : (submit ? ' — but it did NOT submit (no form). Do not rely on Enter; TAP a matching autocomplete suggestion or the search button (magnifying-glass) to run the search' : '')}`;
    }
    if (node.isContentEditable) {
      this.scrollNodeIntoView(node);
      await this.showActionHighlight(node, 'type');
      node.focus();
      node.textContent = text;
      this.dispatchTextInputEvents(node, text);
      const submitted = submit ? this.submitFromNode(node) : false;
      return `✅ Typed "${text}" into [${resolvedIndex}] "${label}"${submitted ? ' and submitted' : (submit ? ' — but it did NOT submit (no form). Do not rely on Enter; TAP a matching autocomplete suggestion or the search button (magnifying-glass) to run the search' : '')}`;
    }
    return `❌ Element [${resolvedIndex}] "${label}" is not a typeable text input.`;
  }
  // Submit the form/field the agent just typed into — pressing Enter the way a user
  // would. Invoked ONLY when the agent passes submit:true (it decides, based on its
  // goal — no brittle guessing about which inputs are "searches"). Dispatches a full
  // Enter key sequence (for SPA keydown/keyup handlers) AND requestSubmit()s the owning
  // form, because a synthetic Enter does NOT trigger native form submission on its own.
  // Returns true ONLY when a real submission path was taken (form submit OR a submit/search
  // button click). A formless search box where we could only fire a synthetic Enter returns
  // false — the caller then steers the model to tap the search button, instead of falsely
  // claiming success and looping on a no-op Enter.
  submitFromNode(node) {
    try {
      const view = node.ownerDocument?.defaultView || (typeof window !== 'undefined' ? window : null);
      // 1) Synthetic Enter key sequence — fires SPA inputs that search on keydown/keyup.
      if (view && view.KeyboardEvent) {
        for (const evtType of ['keydown', 'keypress', 'keyup']) {
          node.dispatchEvent(new view.KeyboardEvent(evtType, {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true,
          }));
        }
      }
      // 2a) AUTOCOMPLETE / COMBOBOX (Algolia Autocomplete, react-select, etc.): the widget keeps
      //     its OWN query state, and its wrapping <form> has an EMPTY native input value — so
      //     submitting the form navigates to the search action with NO query → wrong page / a
      //     reload to home that tears down the session (the aldiwan.net bug). Do NOT submit the
      //     form. The synthetic Enter above may trigger the widget; otherwise return false so the
      //     caller steers the agent to TAP a suggestion (the reliable path for autocompletes).
      const getAttr = typeof node.getAttribute === 'function' ? (a) => node.getAttribute(a) : () => null;
      const role = String(getAttr('role') || '').toLowerCase();
      const isAutocomplete = role === 'combobox'
        || !!getAttr('aria-autocomplete')
        || getAttr('aria-expanded') != null
        || /(^|\s)aa-Input(\s|$)/.test(String(node.className || ''));
      if (isAutocomplete) return false;
      // 2b) Plain owning <form> → native submission. A synthetic Enter does NOT trigger the
      //     browser's implicit form submission, so this is required even for real forms.
      const form = node.form || (typeof node.closest === 'function' ? node.closest('form') : null);
      if (form && (typeof form.requestSubmit === 'function' || typeof form.submit === 'function')) {
        try { form.requestSubmit ? form.requestSubmit() : form.submit(); }
        catch { try { form.submit(); } catch { /* ignore */ } }
        return true;
      }
      // 3) No <form>: a synthetic Enter alone does NOT trigger a formless SPA search (not a
      //    trusted event). Do NOT auto-click a "nearby button" — on real sites that grabs a
      //    logo/nav/menu control and navigates AWAY (regressed: search Enter → home). Report
      //    honestly instead so the caller steers the model to tap the actual search button or a
      //    matching autocomplete suggestion itself — both of which it can see in the element list.
      return false;
    } catch {
      return false;
    }
  }
  // Press Enter on a text input to submit a search/form. A standalone action because
  // the model reasons sequentially ("type… then press Enter") and reliably reaches for
  // this verb, whereas it ignored the optional submit param on type().
  async pressEnter(index) {
    const resolved = this.resolveInteractiveElement(index, 'type');
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!node) return `❌ Element with index ${resolvedIndex} not found.`;
    this.scrollNodeIntoView(node);
    await this.showActionHighlight(node, 'type');
    node.focus();
    const ok = this.submitFromNode(node);
    return ok
      ? `✅ Pressed Enter on [${resolvedIndex}] "${label}" to submit.`
      : `⚠️ Enter did NOT run a search on [${resolvedIndex}] "${label}" — this search box has no form, so pressing Enter does nothing here (and can reload the page). Do NOT press Enter again. After typing, the site shows autocomplete SUGGESTIONS — TAP the matching suggestion in the element list, or TAP the search button (magnifying-glass icon). That is how this search runs.`;
  }
  async scroll(direction, amount, containerIndex) {
    const root = this.options.getRoot();
    const doc = isDocumentNode(root) ? root : root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!win || !doc) {
      return '❌ Could not find a scrollable target.';
    }
    const delta = amount === 'toEnd' || amount === 'toStart' ? undefined : (win.innerHeight || 700) * 0.85;
    let target = win;
    if (typeof containerIndex === 'number') {
      const element = this.getDomNode(containerIndex);
      if (!element) {
        return `❌ Element with index ${containerIndex} not found.`;
      }
      await this.showActionHighlight(element, 'scroll');
      // Fall back to the WINDOW when the indexed element has no overflow-scroll
      // ancestor. Many sites (e.g. noon) scroll the product list with the window, not
      // an inner container — so resolving a containerIndex to null used to fail with
      // "Could not find a scrollable target" even though the page scrolls fine.
      target = findScrollableTarget(element, win) || PageControllerWeb.findNearestScrollableContainer(element) || win;
    } else if (isHTMLElementLike(doc.activeElement) && !isInsideAgentUI(doc.activeElement)) {
      // Default to the WINDOW (the main page). Only divert to the focused element's
      // scroll container when the window genuinely CANNOT scroll the requested
      // direction — e.g. content lives in a modal/inner panel. Otherwise the focused
      // element is often a control in a SMALL sidebar (e.g. a price-filter input on a
      // results page); diverting there scrolled the 943px sidebar to its bottom in one
      // step while the product list never moved — the agent then "scroll-looped" on a
      // page that was scrolling nothing. Keep the window unless it's maxed out.
      const wPos = getScrollPosition(win);
      const wLim = getScrollLimits(win, doc);
      const windowCanScroll = direction === 'down' ? wPos.top < wLim.top - 1 : wPos.top > 1;
      if (!windowCanScroll) {
        const candidate = findScrollableTarget(doc.activeElement, win);
        if (candidate && !isInsideAgentUI(candidate)) {
          target = candidate;
        }
      }
    }
    if (!target) {
      // Last resort: the window always exists and usually scrolls the page.
      target = win;
    }
    const topDirection = direction === 'down' ? 1 : -1;
    const before = getScrollPosition(target);
    const limits = getScrollLimits(target, doc);
    const canScrollTo = 'scrollTo' in target && typeof target.scrollTo === 'function';
    const canScrollBy = 'scrollBy' in target && typeof target.scrollBy === 'function';
    if (amount === 'toStart' && canScrollTo) {
      target.scrollTo({
        top: 0,
        behavior: 'auto'
      });
    } else if (amount === 'toEnd' && canScrollTo) {
      target.scrollTo({
        top: isHTMLElementLike(target) ? target.scrollHeight : (doc?.body?.scrollHeight || 0),
        behavior: 'auto'
      });
    } else if (canScrollBy) {
      // 'page' (the default) and any other value scroll by one screenful.
      // Previously 'page' fell into the scrollTo branch, matched neither
      // toStart/toEnd, and silently scrolled nothing — so normal "scroll down"
      // requests no-opped and the agent reported it could not scroll.
      target.scrollBy({
        top: (delta || 0) * topDirection,
        behavior: 'auto'
      });
    } else if (canScrollTo) {
      // Fallback: target exposes scrollTo but not scrollBy.
      target.scrollTo({
        top: getScrollPosition(target).top + (delta || 0) * topDirection,
        behavior: 'auto'
      });
    }
    await waitForScrollSettle(win);
    const after = getScrollPosition(target);
    const moved = after.top - before.top;
    const targetName = getScrollTargetName(target);
    if (Math.abs(moved) < 1) {
      if (topDirection > 0 && before.top >= limits.top - 1) {
        return `⚠️ Already at the bottom of ${targetName}. Cannot scroll down further.`;
      }
      if (topDirection < 0 && before.top <= 1) {
        return `⚠️ Already at the top of ${targetName}. Cannot scroll up further.`;
      }
      return `⚠️ Tried to scroll ${targetName}, but its scroll position did not change.`;
    }
    if (topDirection > 0 && after.top >= limits.top - 1) {
      return `✅ Scrolled ${targetName} by ${Math.round(moved)}px. Reached the bottom.`;
    }
    if (topDirection < 0 && after.top <= 1) {
      return `✅ Scrolled ${targetName} by ${Math.round(moved)}px. Reached the top.`;
    }
    return `✅ Scrolled ${targetName} by ${Math.round(moved)}px.`;
  }
  async adjustSlider(index, value) {
    const resolved = this.resolveInteractiveElement(index, 'adjust_slider');
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!isInputElement(node) || node.type !== 'range') {
      return `❌ Element [${resolvedIndex}] is not a slider.`;
    }
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) {
      return `❌ Slider value must be between 0.0 and 1.0, got ${value}`;
    }
    // The slider tool contract is a normalized 0–1 value; map it to the input's
    // real min/max range (DOM range defaults: min 0, max 100). Previously the
    // raw value was written, mis-setting any slider whose range ≠ 0–1.
    const min = Number(node.min !== '' && node.min != null ? node.min : 0);
    const max = Number(node.max !== '' && node.max != null ? node.max : 100);
    const actual = min + normalized * (max - min);
    this.scrollNodeIntoView(node);
    await this.showActionHighlight(node, 'fill');
    this.setNativeValue(node, String(actual));
    this.dispatchInputEvents(node);
    return `✅ Adjusted slider [${resolvedIndex}] "${label}" to ${Math.round(normalized * 100)}% (value: ${actual})`;
  }
  async selectPicker(index, value) {
    const resolved = this.resolveInteractiveElement(index, 'select_picker');
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!isSelectElement(node)) {
      return `❌ Element [${resolvedIndex}] is not a picker.`;
    }
    this.scrollNodeIntoView(node);
    await this.showActionHighlight(node, 'fill');
    const valueLower = String(value).toLowerCase();
    let matched = false;
    for (const opt of node.options) {
      if (opt.value === value || opt.text.trim().toLowerCase() === valueLower) {
        this.setNativeValue(node, opt.value);
        matched = true;
        break;
      }
    }
    if (!matched) {
      for (const opt of node.options) {
        if (opt.value.toLowerCase().includes(valueLower) || opt.text.trim().toLowerCase().includes(valueLower)) {
          this.setNativeValue(node, opt.value);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      const available = Array.from(node.options).map(o => o.text.trim()).filter(Boolean);
      return `❌ Value "${value}" not found in picker [${resolvedIndex}] "${label}". Available: ${available.join(', ')}`;
    }
    this.dispatchInputEvents(node);
    return `✅ Selected "${value}" in [${resolvedIndex}] "${label}"`;
  }
  async setDate(index, date) {
    const resolved = this.resolveInteractiveElement(index, 'set_date');
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, label, node } = resolved;
    if (!isInputElement(node)) {
      return `❌ Element [${resolvedIndex}] is not a date input.`;
    }
    this.scrollNodeIntoView(node);
    await this.showActionHighlight(node, 'fill');
    this.setNativeValue(node, date);
    this.dispatchTextInputEvents(node, date);
    return `✅ Set date on [${resolvedIndex}] "${label}" to ${date}`;
  }
  async dismissKeyboard() {
    // Resolve activeElement from the agent's controlled root document (handles
    // iframe / shadow-root mounts), not the ambient global document.
    const root = this.options.getRoot?.();
    const doc = isDocumentNode(root) ? root : root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const active = doc?.activeElement;
    if (isHTMLElementLike(active)) {
      active.blur();
    }
    return '✅ Dismissed active input focus.';
  }
  // Close an open modal / dialog / popup. The agent previously had NO way to do this:
  // a corner close "X" frequently fails the top-layer hit-test and never enters the
  // interactive set (see isInOpenModal in PageControllerWeb), and a synthetic backdrop
  // click rarely satisfies a target-gated handler. Escape is the universal, framework-
  // agnostic close path (native <dialog>, Radix, headless-ui, MUI, Bootstrap, etc.), so
  // dispatch a real Escape key sequence to the modal + active element + document, and
  // call <dialog>.close() directly when the modal is a native dialog. Best-effort and
  // never throws; reports whether a dialog still appears open afterwards.
  async dismissModal() {
    const root = this.options.getRoot?.();
    const doc = isDocumentNode(root) ? root : root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
    if (!doc || !win) return '❌ Could not access the page to dismiss a modal.';
    const MODAL_SELECTOR = '[aria-modal="true"], [role="dialog"], dialog[open]';
    const isVisibleEl = (el) => {
      try {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const s = win.getComputedStyle(el);
        return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
      } catch { return true; }
    };
    const openModals = () => Array.from(doc.querySelectorAll(MODAL_SELECTOR))
      .filter(el => isHTMLElementLike(el) && isVisibleEl(el));
    const before = openModals();
    // Topmost when stacked = last in document order.
    const modal = before[before.length - 1] || null;

    // Native <dialog open> closes deterministically.
    if (modal && modal.tagName?.toLowerCase() === 'dialog' && typeof modal.close === 'function') {
      try { modal.close(); } catch { /* fall through to Escape */ }
    }

    // Real Escape key sequence to the modal, the focused element, and the document —
    // covers libraries that listen on the dialog, on the active descendant, or globally.
    const targets = [];
    const active = doc.activeElement;
    if (modal) targets.push(modal);
    if (isHTMLElementLike(active) && active !== modal) targets.push(active);
    targets.push(doc.body || doc.documentElement);
    for (const target of targets) {
      if (!target || typeof target.dispatchEvent !== 'function' || !win.KeyboardEvent) continue;
      for (const evtType of ['keydown', 'keyup']) {
        try {
          target.dispatchEvent(new win.KeyboardEvent(evtType, {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true,
          }));
        } catch { /* a target that can't receive events — skip */ }
      }
    }

    // Let the close transition settle, then report honestly.
    try { if (typeof this.waitForStable === 'function') await this.waitForStable(600); } catch { /* best-effort */ }
    if (before.length === 0) return 'ℹ️ No open modal/dialog was found to dismiss.';
    return openModals().length < before.length || openModals().length === 0
      ? '✅ Closed the open modal/dialog.'
      : '⚠️ Sent Escape to the modal but a dialog still appears open. Try tapping its visible "X" or Close button, or click outside it.';
  }
  async guideUser(index, message, autoRemoveAfterMs, action) {
    const resolved = this.resolveInteractiveElement(index, 'guide_user');
    if (!resolved.ok) return resolved.message;
    const { index: resolvedIndex, node } = resolved;
    if (!node) {
      return `❌ Element with index ${resolvedIndex} not found.`;
    }
    this.scrollNodeIntoView(node);
    const label = (typeof message === 'string' && message.trim())
      ? message.trim()
      : defaultGuideLabel(action);
    const rect = this.getViewportRect(node);
    if (!rect) return `❌ Element [${resolvedIndex}] has no visible layout.`;
    this.options.onGuide?.({
      targetRect: rect,
      targetNode: node,
      message: label,
      action,
      autoRemoveAfterMs
    });
    return `✅ Highlighted [${resolvedIndex}] with guidance "${label}"`;
  }
  async simplifyZone(zoneId) {
    const zone = globalZoneRegistry.get(zoneId);
    if (zone && zone._controller) {
      zone._controller.simplify();
      return `✅ Successfully requested simplification for zone "${zoneId}".`;
    }
    return `❌ Cannot simplify zone "${zoneId}": Controller not attached.`;
  }
  async renderBlock(zoneId, blockType, rawProps, lifecycle = 'dismissible') {
    if (!globalZoneRegistry.isActionAllowed(zoneId, 'block')) {
      return `❌ Cannot render block into zone "${zoneId}": Zone does not exist or allowInjectBlock is false.`;
    }
    const zone = globalZoneRegistry.get(zoneId);
    if (!zone) {
      return `❌ Cannot render block into zone "${zoneId}": Zone does not exist.`;
    }
    const allowedBlocks = getAllowedZoneBlocks(zone);
    if (allowedBlocks.length === 0) {
      return `❌ Cannot render block into zone "${zoneId}": No blocks are registered for this zone.`;
    }
    const blockDefinition = allowedBlocks.find(candidate => candidate.name === blockType) || globalBlockRegistry.get(blockType);
    if (!blockDefinition) {
      const availableBlocks = allowedBlocks.map(candidate => candidate.name).join(', ');
      return `❌ Cannot render block into zone "${zoneId}": Block "${blockType}" is not registered for this zone. Available blocks: ${availableBlocks || 'none'}.`;
    }
    const zoneAllowsIntervention = zone.interventionEligible === true || zone.allowInjectCard === true || Array.isArray(zone.templates) && zone.templates.length > 0;
    const blockAllowsIntervention = blockDefinition.interventionEligible !== false;
    if (!zoneAllowsIntervention || !blockAllowsIntervention) {
      return `❌ Cannot render block "${blockType}" into zone "${zoneId}": Block or zone is not eligible for screen intervention.`;
    }
    let sanitizedProps;
    try {
      sanitizedProps = parsePropsArg(rawProps);
    } catch (error) {
      return `❌ Cannot render block into zone "${zoneId}": Invalid props JSON. ${error.message}`;
    }
    const validation = globalBlockRegistry.validateProps(blockDefinition.name, sanitizedProps);
    if (!validation.valid) {
      return `❌ Cannot render block into zone "${zoneId}": ${validation.errors.join(' ')}`;
    }
    if (!zone._controller?.renderBlock && !zone._controller?.injectCard) {
      return `❌ Cannot render block into zone "${zoneId}": Controller not attached.`;
    }
    const blockElement = /*#__PURE__*/React.createElement(blockDefinition.component, sanitizedProps);
    if (zone._controller?.renderBlock) {
      zone._controller.renderBlock(blockElement, lifecycle);
    } else {
      zone._controller.injectCard(blockElement);
    }
    logger.info('WebPlatformAdapter', `Rendered ${blockDefinition.name} into zone: ${zoneId}`);
    return `✅ Rendered "${blockDefinition.name}" in zone "${zoneId}". Tell the user where to look on screen.`;
  }
  async injectCard(zoneId, templateName, rawProps) {
    let result = await this.renderBlock(zoneId, templateName, rawProps, 'dismissible');
    result = result.replace('allowInjectBlock is false', 'allowInjectCard is false').replace(`Block "${templateName}" is not registered for this zone.`, `Template "${templateName}" is not registered for this zone.`).replace('Cannot render block', 'Cannot inject card').replace('Rendered', 'Injected');
    if (result.startsWith('✅')) {
      return `${result} inject_card() is deprecated; prefer render_block().`;
    }
    return result;
  }
  async restoreZone(zoneId) {
    const zone = globalZoneRegistry.get(zoneId);
    if (!zone) {
      return `❌ Cannot restore zone "${zoneId}": Zone does not exist.`;
    }
    if (zone._controller) {
      zone._controller.restore();
      return `✅ Successfully restored zone "${zoneId}" to its default state.`;
    }
    return `❌ Cannot restore zone "${zoneId}": Controller not attached.`;
  }
  async navigate(screen, params) {
    const href = this.resolveNavigationHref(screen, params);
    if (href && this.options.router?.push) {
      this.options.router.push(href);
      return `✅ Navigated to "${href}"${href !== screen ? ` for "${screen}"` : ''}`;
    }
    if (href && this.options.router?.navigate) {
      this.options.router.navigate(href, params);
      return `✅ Navigated to "${href}"${href !== screen ? ` for "${screen}"` : ''}`;
    }
    if (href && typeof window !== 'undefined') {
      // Already on this exact URL → do NOT reload. A full reload here aborts the
      // server run and triggers a resume; if the model then re-picks the current
      // page (common on MPAs), that becomes a navigate→reload→resume loop. Treat
      // navigating to the current page as a no-op so the agent reads it instead.
      if (this._isSameDocument(href)) {
        return `✅ Already on "${href}" — staying here.`;
      }
      // No SPA router adapter → this is a real navigation. pushState only rewrites
      // the URL bar WITHOUT loading the page, which silently breaks multi-page sites
      // (content never changes) and skips the beforeunload resume-save. location.assign
      // does a full document load for a different path, and an in-page scroll for a
      // pure #fragment — both correct, and a full load fires beforeunload so the agent
      // can resume the task on the next page.
      window.location.assign(href);
      return `✅ Navigated to "${href}"${href !== screen ? ` for "${screen}"` : ''}`;
    }
    if (this.options.router?.navigate) {
      this.options.router.navigate(screen, params);
      return `✅ Navigated to "${screen}"`;
    }
    return `❌ Cannot navigate to "${screen}" on web without a router adapter or absolute path.`;
  }
  // True when href resolves to the page we're already on (same origin + path +
  // query + hash, ignoring trailing-slash and percent-encoding differences).
  _isSameDocument(href) {
    try {
      const norm = (u) =>
        u.origin + decodeURIComponent(u.pathname).replace(/\/+$/, '') + u.search + u.hash;
      return norm(new URL(href, window.location.href)) === norm(new URL(window.location.href));
    } catch {
      return false;
    }
  }
  resolveNavigationHref(screen, params) {
    const target = typeof screen === 'string' ? screen.trim() : '';
    if (!target) return null;
    if (target.startsWith('/') || target.startsWith('#')) return target;
    const root = this.options.getRoot?.();
    const doc = getDocumentFromRoot(root);
    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
    const queryRoot = isDocumentNode(root) ? root : root || doc;
    let best = null;
    collectRouteAnchors(queryRoot).forEach(anchor => {
      if (!isHTMLElementLike(anchor) || anchor.closest?.('[data-ai-ignore="true"]')) return;
      const href = normalizeHref(anchor.getAttribute('href') || '', anchor.ownerDocument?.defaultView || win);
      if (!href) return;
      const score = routeMatchScore(target, anchor, href);
      if (score > 0 && (!best || score > best.score)) {
        best = {
          href,
          score
        };
      }
    });
    if (best?.href) return best.href;
    const resolved = this.options.router?.resolveHref?.(target, params);
    if (resolved) return resolved;
    return null;
  }
}
