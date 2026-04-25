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
    const delta = amount === 'toEnd' || amount === 'toStart' ? undefined : (win?.innerHeight || 700) * 0.85;
    let target = win;
    if (typeof containerIndex === 'number') {
      target = this.getDomNode(containerIndex);
    }
    if (!target && typeof containerIndex === 'number') {
      const element = this.getDomNode(containerIndex);
      target = PageControllerWeb.findNearestScrollableContainer(element);
    }
    if (!target) {
      return '❌ Could not find a scrollable target.';
    }
    const topDirection = direction === 'down' ? 1 : -1;
    if ('scrollTo' in target && typeof target.scrollTo === 'function' && amount) {
      if (amount === 'toStart') {
        target.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      } else if (amount === 'toEnd') {
        if (isHTMLElementLike(target)) {
          target.scrollTo({
            top: target.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          target.scrollTo({
            top: doc?.body?.scrollHeight || 0,
            behavior: 'smooth'
          });
        }
      }
    } else if ('scrollBy' in target && typeof target.scrollBy === 'function') {
      target.scrollBy({
        top: (delta || 0) * topDirection,
        behavior: 'smooth'
      });
    }
    return `✅ Scrolled ${direction}`;
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
    if (this.options.router?.navigate) {
      this.options.router.navigate(screen, params);
      return `✅ Navigated to "${screen}"`;
    }
    const href = this.options.router?.resolveHref?.(screen, params) || (screen.startsWith('/') ? screen : null);
    if (href && this.options.router?.push) {
      this.options.router.push(href);
      return `✅ Navigated to "${href}"`;
    }
    if (href && typeof window !== 'undefined') {
      window.history.pushState({}, '', href);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return `✅ Navigated to "${href}"`;
    }
    return `❌ Cannot navigate to "${screen}" on web without a router adapter or absolute path.`;
  }
}
//# sourceMappingURL=WebPlatformAdapter.js.map
