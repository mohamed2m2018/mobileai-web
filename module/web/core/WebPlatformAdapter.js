"use strict";

import React from 'react';
import { globalBlockRegistry } from "../../core/BlockRegistry.js";
import { globalZoneRegistry } from "../../core/ZoneRegistry.js";
import { logger } from "../../utils/logger.js";
import { PageControllerWeb } from "./PageControllerWeb.js";
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
    const schedule = win?.requestAnimationFrame ? callback => win.requestAnimationFrame(callback) : callback => setTimeout(callback, 16);
    schedule(() => schedule(resolve));
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
export class WebPlatformAdapter {
  lastSnapshot = null;
  lastController = null;
  constructor(options) {
    this.options = options;
  }
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
    const controller = new PageControllerWeb(this.options.getRoot());
    const snapshot = controller.buildScreenSnapshot(this.getCurrentScreenName(), this.getAvailableScreens());
    this.lastController = controller;
    this.lastSnapshot = snapshot;
    return snapshot;
  }
  async captureScreenshot() {
    if (!this.options.captureScreenshot) return undefined;
    return this.options.captureScreenshot();
  }
  async executeAction(intent) {
    switch (intent.type) {
      case 'tap':
        return this.tap(intent.index);
      case 'long_press':
        return '❌ long_press is not supported on web yet.';
      case 'type':
        return this.typeText(intent.index, intent.text);
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
      case 'guide_user':
        return this.guideUser(intent.index, intent.message, intent.autoRemoveAfterMs);
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
    target.click?.();
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
  async tap(index) {
    const element = this.getSnapshotElement(index);
    const node = this.getDomNode(index);
    if (!element || !node) {
      return `❌ Element with index ${index} not found.`;
    }
    this.scrollNodeIntoView(node);
    this.dispatchPointerSequence(node);
    return `✅ Tapped [${index}] "${element.label}"`;
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
  async typeText(index, text) {
    const element = this.getSnapshotElement(index);
    const node = this.getDomNode(index);
    if (!element || !node) {
      return `❌ Element with index ${index} not found.`;
    }
    if (isInputElement(node) || isTextAreaElement(node)) {
      this.scrollNodeIntoView(node);
      node.focus();
      this.setNativeValue(node, text);
      this.dispatchTextInputEvents(node, text);
      return `✅ Typed "${text}" into [${index}] "${element.label}"`;
    }
    if (node.isContentEditable) {
      this.scrollNodeIntoView(node);
      node.focus();
      node.textContent = text;
      this.dispatchTextInputEvents(node, text);
      return `✅ Typed "${text}" into [${index}] "${element.label}"`;
    }
    return `❌ Element [${index}] "${element.label}" is not a typeable text input.`;
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
      target = findScrollableTarget(element, win) || PageControllerWeb.findNearestScrollableContainer(element);
    } else if (isHTMLElementLike(doc.activeElement)) {
      target = findScrollableTarget(doc.activeElement, win) || win;
    }
    if (!target) {
      return '❌ Could not find a scrollable target.';
    }
    const topDirection = direction === 'down' ? 1 : -1;
    const before = getScrollPosition(target);
    const limits = getScrollLimits(target, doc);
    if ('scrollTo' in target && typeof target.scrollTo === 'function' && amount) {
      if (amount === 'toStart') {
        target.scrollTo({
          top: 0,
          behavior: 'auto'
        });
      } else if (amount === 'toEnd') {
        if (isHTMLElementLike(target)) {
          target.scrollTo({
            top: target.scrollHeight,
            behavior: 'auto'
          });
        } else {
          target.scrollTo({
            top: doc?.body?.scrollHeight || 0,
            behavior: 'auto'
          });
        }
      }
    } else if ('scrollBy' in target && typeof target.scrollBy === 'function') {
      target.scrollBy({
        top: (delta || 0) * topDirection,
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
    const element = this.getSnapshotElement(index);
    const node = this.getDomNode(index);
    if (!element || !isInputElement(node) || node.type !== 'range') {
      return `❌ Element [${index}] is not a slider.`;
    }
    this.scrollNodeIntoView(node);
    this.setNativeValue(node, String(value));
    this.dispatchInputEvents(node);
    return `✅ Adjusted slider [${index}] to ${value}`;
  }
  async selectPicker(index, value) {
    const element = this.getSnapshotElement(index);
    const node = this.getDomNode(index);
    if (!element || !isSelectElement(node)) {
      return `❌ Element [${index}] is not a picker.`;
    }
    this.scrollNodeIntoView(node);
    node.value = value;
    this.dispatchInputEvents(node);
    return `✅ Selected "${value}" in [${index}] "${element.label}"`;
  }
  async setDate(index, date) {
    const element = this.getSnapshotElement(index);
    const node = this.getDomNode(index);
    if (!element || !isInputElement(node)) {
      return `❌ Element [${index}] is not a date input.`;
    }
    this.scrollNodeIntoView(node);
    this.setNativeValue(node, date);
    this.dispatchTextInputEvents(node, date);
    return `✅ Set date on [${index}] "${element.label}" to ${date}`;
  }
  async dismissKeyboard() {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (isHTMLElementLike(active)) {
      active.blur();
    }
    return '✅ Dismissed active input focus.';
  }
  async guideUser(index, message, autoRemoveAfterMs) {
    const node = this.getDomNode(index);
    if (!node) {
      return `❌ Element with index ${index} not found.`;
    }
    const rect = node.getBoundingClientRect();
    this.options.onGuide?.({
      targetRect: rect,
      message,
      autoRemoveAfterMs
    });
    return `✅ Highlighted [${index}] with guidance "${message}"`;
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
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return `✅ Navigated to "${href}"${href !== screen ? ` for "${screen}"` : ''}`;
    }
    if (this.options.router?.navigate) {
      this.options.router.navigate(screen, params);
      return `✅ Navigated to "${screen}"`;
    }
    return `❌ Cannot navigate to "${screen}" on web without a router adapter or absolute path.`;
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
    Array.from(queryRoot?.querySelectorAll?.('a[href]') || []).forEach(anchor => {
      if (!isHTMLElementLike(anchor) || anchor.closest?.('[data-mobileai-ignore="true"]')) return;
      const href = normalizeHref(anchor.getAttribute('href') || '', win);
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
//# sourceMappingURL=WebPlatformAdapter.js.map
