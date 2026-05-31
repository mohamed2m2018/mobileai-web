"use strict";

import { dehydrateScreen } from "../../core/ScreenDehydrator.js";
const INTERACTIVE_SELECTOR = ['button', 'a[href]', 'input', 'textarea', 'select', '[role="button"]', '[role="link"]', '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="combobox"]', '[role="slider"]', '[role="spinbutton"]', '[role="scrollbar"]', '[role="treeitem"]', '[contenteditable="true"]', '[tabindex]', '[onclick]'].join(', ');
const HEADING_SELECTOR = 'h1, h2, h3, h4';
const SEMANTIC_SELECTOR = ['main', '[role="main"]', 'nav', '[role="navigation"]', 'header', 'footer', 'section', 'section[aria-label]', 'section[aria-labelledby]', 'article', 'aside', 'form', 'dialog', '[role="region"]', '[role="dialog"]', '[role="complementary"]', 'table', 'ul', 'ol', '[role="list"]', '[role="grid"]', '.page-header', '.surface-card', '.metric-card', '.toolbar-surface', '[data-mobileai-summary="true"]'].join(', ');
const TEXT_CONTAINER_SELECTOR = 'p, li, td, th, dt, dd, figcaption, summary, blockquote';
const DEFAULT_CONFIG = {
  viewportMode: 'full',
  viewportExpansion: 600,
  traverseShadowRoots: true,
  traverseIframes: true
};
const STRUCTURE_VIEWPORT_CONFIG = {
  ...DEFAULT_CONFIG,
  viewportMode: 'expanded',
  viewportExpansion: 240
};
const BROAD_CONTAINER_KINDS = new Set(['main', 'section', 'article', 'aside', 'dialog', 'header', 'footer']);
function isHTMLElement(value) {
  return !!value && typeof value === 'object' && 'tagName' in value;
}
function normalizeText(value) {
  return value?.replace(/\s+/g, ' ').trim() || '';
}
function truncateText(value, maxLength = 180) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}
function getDocument(root) {
  if (!root) return null;
  if ('ownerDocument' in root && root.ownerDocument) return root.ownerDocument;
  if ('documentElement' in root) return root;
  return null;
}
function getWindow(root) {
  const doc = getDocument(root);
  return doc?.defaultView || null;
}
function getRootElement(root, doc) {
  if (isHTMLElement(root)) return root;
  return doc?.body || null;
}
function getNodeWindow(node) {
  return node?.ownerDocument?.defaultView || null;
}
function getViewConstructor(node, constructorName) {
  return getNodeWindow(node)?.[constructorName] || null;
}
function isInstanceOf(node, constructorName) {
  const Ctor = getViewConstructor(node, constructorName);
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
function isButtonElement(node) {
  return isInstanceOf(node, 'HTMLButtonElement');
}
function isAnchorElement(node) {
  return isInstanceOf(node, 'HTMLAnchorElement');
}
function isIFrameElement(node) {
  return isInstanceOf(node, 'HTMLIFrameElement') || node?.tagName?.toLowerCase() === 'iframe';
}
function isShadowRootNode(node) {
  return !!node && typeof node === 'object' && 'host' in node && typeof node.querySelectorAll === 'function';
}
function isIgnoredByAgent(element) {
  return !!element.closest('[data-mobileai-ignore="true"]');
}
function isIgnoredHitTarget(target) {
  return !!target && typeof target.closest === 'function' && !!target.closest('[data-mobileai-ignore="true"]');
}
function getClientRectsSafe(element) {
  try {
    const rects = typeof element.getClientRects === 'function' ? Array.from(element.getClientRects()) : [];
    return rects.length > 0 ? rects : [element.getBoundingClientRect()];
  } catch {
    return [];
  }
}
function getViewportMode(config) {
  return config.viewportMode || 'full';
}
function getViewportExpansion(config) {
  const raw = Number(config.viewportExpansion);
  return Number.isFinite(raw) ? raw : DEFAULT_CONFIG.viewportExpansion;
}
function rectIntersectsViewport(rect, win, config) {
  const mode = getViewportMode(config);
  if (mode === 'full') return true;
  const expansion = mode === 'expanded' ? getViewportExpansion(config) : 0;
  return !(rect.bottom < -expansion || rect.top > win.innerHeight + expansion || rect.right < -expansion || rect.left > win.innerWidth + expansion);
}
function elementIntersectsViewport(element, win, config = STRUCTURE_VIEWPORT_CONFIG) {
  if (!win || !isHTMLElement(element)) return false;
  return getClientRectsSafe(element).some(rect => rectIntersectsViewport(rect, win, config));
}
function isVisible(element, win, config = DEFAULT_CONFIG) {
  if (!win) return false;
  const rects = getClientRectsSafe(element);
  if (rects.length === 0) return false;
  const hasGeometry = rects.some(rect => rect.width > 0 && rect.height > 0);
  if (!hasGeometry) return false;
  if (!win.getComputedStyle) return true;
  const style = win.getComputedStyle(element);
  if (!style) return true;
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  if (modeRequiresViewport(config)) {
    return rects.some(rect => rectIntersectsViewport(rect, win, config));
  }
  return true;
}
function modeRequiresViewport(config) {
  return getViewportMode(config) !== 'full';
}
function isTopElement(element, win, config = DEFAULT_CONFIG) {
  if (!win || typeof element.getBoundingClientRect !== 'function') return true;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (!rectIntersectsViewport(rect, win, {
    ...config,
    viewportMode: 'viewport'
  })) {
    return getViewportMode(config) === 'full';
  }
  const centerX = Math.min(win.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const centerY = Math.min(win.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  try {
    const root = element.getRootNode?.();
    const pointTarget = root && typeof root.elementFromPoint === 'function' ? root.elementFromPoint(centerX, centerY) : element.ownerDocument?.elementFromPoint?.(centerX, centerY);
    if (!pointTarget) return true;
    if (isIgnoredHitTarget(pointTarget)) {
      return true;
    }
    if (isShadowRootNode(root) && pointTarget === root.host) {
      return true;
    }
    return pointTarget === element || element.contains(pointTarget) || pointTarget.contains?.(element);
  } catch {
    return true;
  }
}
function getLabelFromAria(element, doc) {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy || !doc) return '';
  return labelledBy.split(/\s+/).map(id => doc.getElementById(id)?.textContent?.trim() || '').filter(Boolean).join(' ').trim();
}
function getTextContent(element) {
  return normalizeText(element.textContent);
}
function getDirectText(element) {
  const chunks = [];
  element.childNodes.forEach(node => {
    if (node.nodeType === 3) {
      const text = normalizeText(node.textContent || '');
      if (text) chunks.push(text);
    }
  });
  return normalizeText(chunks.join(' '));
}
function getAssociatedLabelText(element, doc) {
  if (!doc) return '';
  const id = element.getAttribute('id');
  if (id) {
    const fromFor = Array.from(doc.querySelectorAll(`label[for="${id}"]`)).map(label => normalizeText(label.textContent || '')).filter(Boolean).join(' ');
    if (fromFor) return fromFor;
  }
  const wrappingLabel = element.closest('label');
  return normalizeText(wrappingLabel?.textContent || '');
}
function getInputLabel(element) {
  const associatedLabel = getAssociatedLabelText(element, element.ownerDocument);
  if (associatedLabel) return associatedLabel;
  const fallback = 'placeholder' in element && typeof element.placeholder === 'string' ? element.placeholder.trim() : '';
  if (fallback) return fallback;
  if (isSelectElement(element)) {
    return element.name?.trim() || fallback || 'Select option';
  }
  return element.name?.trim() || fallback || 'Input field';
}
function getElementLabel(element, doc) {
  const aria = getLabelFromAria(element, doc);
  if (aria) return aria;
  if (isInputElement(element) || isTextAreaElement(element) || isSelectElement(element)) {
    return getInputLabel(element);
  }
  if (isAnchorElement(element)) {
    return getTextContent(element) || element.href || 'Link';
  }
  if (isButtonElement(element)) {
    return getTextContent(element) || element.name?.trim() || 'Button';
  }
  if (element.isContentEditable) {
    return getTextContent(element) || element.getAttribute('data-placeholder') || 'Editable field';
  }
  const role = element.getAttribute('role');
  if (role === 'tab') return getTextContent(element) || 'Tab';
  if (role === 'menuitem' || role === 'option') return getTextContent(element) || 'Menu item';
  return getTextContent(element) || element.getAttribute('title')?.trim() || role || element.tagName.toLowerCase();
}
function getElementName(element, doc) {
  return normalizeText(getLabelFromAria(element, doc) || element.getAttribute('title') || '');
}
function getScrollData(element, win) {
  if (!win?.getComputedStyle) return null;
  const style = win.getComputedStyle(element);
  if (!style) return null;
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const hasScrollbarSignal = (style.scrollbarWidth && style.scrollbarWidth !== 'auto') || (style.scrollbarGutter && style.scrollbarGutter !== 'auto');
  const scrollableX = overflowX === 'auto' || overflowX === 'scroll' || hasScrollbarSignal;
  const scrollableY = overflowY === 'auto' || overflowY === 'scroll' || hasScrollbarSignal;
  const threshold = 4;
  const right = Math.max(0, element.scrollWidth - element.clientWidth - element.scrollLeft);
  const down = Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop);
  const left = Math.max(0, element.scrollLeft);
  const up = Math.max(0, element.scrollTop);
  if ((!scrollableX && !scrollableY) || right < threshold && down < threshold && left < threshold && up < threshold) {
    return null;
  }
  return {
    left,
    up,
    right,
    down
  };
}
function isScrollable(element, win) {
  return !!getScrollData(element, win);
}
function getZoneId(element) {
  return element.closest('[data-mobileai-zone-id]')?.getAttribute('data-mobileai-zone-id') || undefined;
}
function getElementType(element) {
  const role = element.getAttribute('role');
  const tag = element.tagName.toLowerCase();
  if (tag === 'textarea' || element.isContentEditable) return 'text-input';
  if (tag === 'select' || role === 'combobox') return 'picker';
  if (tag === 'button' || tag === 'a') return 'pressable';
  if (tag === 'input') {
    switch (element.type) {
      case 'checkbox':
        return 'switch';
      case 'radio':
        return 'radio';
      case 'range':
        return 'slider';
      case 'date':
      case 'datetime-local':
      case 'month':
      case 'week':
      case 'time':
        return 'date-picker';
      case 'button':
      case 'submit':
      case 'reset':
        return 'pressable';
      default:
        return 'text-input';
    }
  }
  if (role === 'switch' || role === 'checkbox') return 'switch';
  if (role === 'radio') return 'radio';
  if (role === 'slider' || role === 'spinbutton' || role === 'scrollbar') return 'slider';
  if (role === 'button' || role === 'link' || role === 'tab' || role === 'menuitem' || role === 'option' || role === 'treeitem' || role === 'gridcell' || role === 'rowheader' || role === 'columnheader') return 'pressable';
  if (typeof element.onclick === 'function') return 'pressable';
  return null;
}
function getElementSemanticKind(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute('role');
  if (element.classList.contains('metric-card')) return 'metric-card';
  if (element.classList.contains('surface-card')) return 'surface-card';
  if (element.classList.contains('page-header')) return 'page-header';
  if (element.classList.contains('toolbar-surface')) return 'toolbar';
  if (tag === 'nav' || role === 'navigation' || role === 'menubar' || role === 'menu') return 'navigation';
  if (tag === 'main' || role === 'main') return 'main';
  if (tag === 'form') return 'form';
  if (tag === 'table' || role === 'grid') return 'table';
  if (tag === 'dialog' || role === 'dialog') return 'dialog';
  if (tag === 'header') return 'header';
  if (tag === 'footer') return 'footer';
  if (tag === 'section') return 'section';
  if (tag === 'article') return 'article';
  if (tag === 'aside') return 'aside';
  if (tag === 'iframe') return 'iframe';
  if (role === 'listbox' || tag === 'ul' || tag === 'ol' || role === 'list') return 'list';
  if (element.matches(HEADING_SELECTOR)) return 'heading';
  if (element.matches(TEXT_CONTAINER_SELECTOR)) return 'text';
  return 'generic';
}
function buildElementSelector(element) {
  const parts = [];
  let current = element;
  while (current && parts.length < 5) {
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    const tag = current.tagName.toLowerCase();
    const dataId = current.getAttribute('data-testid') || current.getAttribute('data-mobileai-id');
    if (dataId) {
      parts.unshift(`${tag}[data-id="${dataId}"]`);
      break;
    }
    const className = typeof current.className === 'string' ? current.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    let segment = className ? `${tag}.${className}` : tag;
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(sibling => sibling.tagName === current.tagName);
      if (siblings.length > 1) {
        segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(segment);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
function uniqueStrings(values, maxItems = 5) {
  const seen = new Set();
  const output = [];
  values.forEach(value => {
    const normalized = normalizeText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    output.push(normalized);
  });
  return output.slice(0, maxItems);
}
function collectTextSnippets(root, win, options = {}) {
  const {
    minLength = 12,
    maxItems = 4,
    skipNestedInteractive = false,
    stopAtInteractiveBoundary = false
  } = options;
  const snippets = [];
  const doc = root.ownerDocument;
  const nodeFilter = doc?.defaultView?.NodeFilter || globalThis.NodeFilter;
  if (!doc?.createTreeWalker || !nodeFilter) return snippets;
  const walker = doc.createTreeWalker(root, nodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || !isVisible(parent, win, DEFAULT_CONFIG) || isIgnoredByAgent(parent)) {
        return nodeFilter.FILTER_REJECT;
      }
      if (skipNestedInteractive) {
        const ownerInteractive = parent.closest(INTERACTIVE_SELECTOR);
        if (ownerInteractive && ownerInteractive !== root) {
          return stopAtInteractiveBoundary ? nodeFilter.FILTER_REJECT : nodeFilter.FILTER_SKIP;
        }
      }
      const text = normalizeText(node.textContent || '');
      if (!text || text.length < minLength) {
        return nodeFilter.FILTER_REJECT;
      }
      return nodeFilter.FILTER_ACCEPT;
    }
  });
  let current = walker.nextNode();
  while (current && snippets.length < maxItems) {
    const text = truncateText(normalizeText(current.textContent || ''), 160);
    if (text) {
      snippets.push(text);
    }
    current = walker.nextNode();
  }
  return uniqueStrings(snippets, maxItems);
}
function getNearestSectionLabel(element, doc) {
  let current = element.parentElement;
  while (current) {
    if (current.matches('.surface-card, .page-header, main, [role="main"], section, article, aside, nav, form, table, dialog, [role="region"]')) {
      const heading = current.querySelector('.surface-card__title, .page-header__title, h1, h2, h3');
      const text = normalizeText(heading?.textContent || getElementName(current, doc));
      if (text) return text;
    }
    current = current.parentElement;
  }
  return '';
}
function getVisibleTableHeaders(element, win) {
  return Array.from(element.querySelectorAll('thead th, tr th')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG)).slice(0, 8).map(node => normalizeText(node.textContent || '')).filter(Boolean);
}
function getVisibleTableRows(element, win, maxRows = 4) {
  const bodyRows = Array.from(element.querySelectorAll('tbody tr')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG));
  if (bodyRows.length > 0) {
    return bodyRows.slice(0, maxRows);
  }
  return Array.from(element.querySelectorAll('tr')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG) && node.querySelectorAll('td').length > 0).slice(0, maxRows);
}
function getCellTexts(row, win) {
  return Array.from(row.querySelectorAll('th, td')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG)).map(node => normalizeText(node.textContent || '')).filter(Boolean);
}
function buildTableSamples(element, headers, win, maxRows = 4) {
  const rows = getVisibleTableRows(element, win, maxRows);
  return rows.map(row => {
    const cells = getCellTexts(row, win);
    if (cells.length === 0) return '';
    const preferredHeaders = ['Screen', 'Query / Action', 'Status', 'Time'];
    const prioritized = preferredHeaders.map(header => {
      const index = headers.findIndex(candidate => candidate.toLowerCase() === header.toLowerCase());
      if (index >= 0 && cells[index]) {
        return `${header}: ${truncateText(cells[index], 80)}`;
      }
      return '';
    }).filter(Boolean);
    if (prioritized.length > 0) {
      return prioritized.join(' | ');
    }
    return cells.slice(0, Math.min(cells.length, headers.length || 4)).map((cell, index) => headers[index] ? `${headers[index]}: ${truncateText(cell, 80)}` : truncateText(cell, 80)).join(' | ');
  }).filter(Boolean);
}
function buildTableStatusPattern(element, headers, win) {
  const statusIndex = headers.findIndex(header => header.toLowerCase() === 'status');
  const rows = getVisibleTableRows(element, win, 12);
  if (statusIndex < 0 || rows.length === 0) return '';
  const counts = new Map();
  rows.forEach(row => {
    const cells = getCellTexts(row, win);
    const status = normalizeText(cells[statusIndex] || '');
    if (!status) return;
    counts.set(status, (counts.get(status) || 0) + 1);
  });
  if (counts.size === 0) return '';
  return Array.from(counts.entries()).map(([status, count]) => `${count} ${status}`).join(', ');
}
function buildListSummary(element, win) {
  const items = Array.from(element.querySelectorAll(':scope > li, [role="option"], [role="menuitem"]')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG)).slice(0, 5).map(node => truncateText(getTextContent(node), 100)).filter(Boolean);
  return items.length > 0 ? `List: ${items.join(' | ')}` : '';
}
function getIframeSummary(element) {
  const title = normalizeText(element.getAttribute('title') || element.getAttribute('aria-label') || '');
  try {
    const iframeDoc = element.contentDocument || element.contentWindow?.document;
    if (iframeDoc?.body) {
      const bodyText = truncateText(normalizeText(iframeDoc.body.textContent || ''), 120);
      return `Embedded frame${title ? `: ${title}` : ''}${bodyText ? ` | ${bodyText}` : ''}`;
    }
  } catch {
    return `Embedded frame${title ? `: ${title}` : ''} | cross-origin content not introspectable`;
  }
  return `Embedded frame${title ? `: ${title}` : ''}`;
}
function getStructureSummary(element, doc, win) {
  const kind = getElementSemanticKind(element);
  switch (kind) {
    case 'page-header': {
      const title = normalizeText(element.querySelector('.page-header__title')?.textContent || '');
      const description = normalizeText(element.querySelector('.page-header__description')?.textContent || '');
      return title ? `Page header: ${title}${description ? ` — ${truncateText(description, 140)}` : ''}` : '';
    }
    case 'metric-card': {
      const label = normalizeText(element.querySelector('.metric-card__label')?.textContent || '');
      const value = normalizeText(element.querySelector('.metric-card__value')?.textContent || '');
      const context = normalizeText(element.querySelector('.metric-card__context')?.textContent || '');
      const hint = normalizeText(element.querySelector('a, p, span')?.textContent || '');
      const details = uniqueStrings([value, context, context ? '' : hint], 3);
      return label || details.length > 0 ? `Metric card: ${label || 'Metric'}${details.length > 0 ? `: ${details.join(' | ')}` : ''}` : '';
    }
    case 'surface-card': {
      const title = normalizeText(element.querySelector('.surface-card__title')?.textContent || '');
      const description = normalizeText(element.querySelector('.surface-card__description')?.textContent || '');
      const metrics = Array.from(element.querySelectorAll('.metric-card')).slice(0, 3).map(card => getStructureSummary(card, doc, win).replace(/^Metric card:\s*/, '')).filter(Boolean);
      const parts = uniqueStrings([title, description && truncateText(description, 120), metrics.length > 0 ? `metrics: ${metrics.join(' ; ')}` : ''], 4);
      return parts.length > 0 ? `Section card: ${parts.join(' | ')}` : '';
    }
    case 'toolbar': {
      const actions = Array.from(element.querySelectorAll('button, a[href], select, input, [role="button"], [role="menuitem"], [role="tab"]')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG)).slice(0, 8).map(node => getElementLabel(node, doc)).filter(Boolean);
      return actions.length > 0 ? `Toolbar: ${actions.join(', ')}` : '';
    }
    case 'navigation': {
      const items = Array.from(element.querySelectorAll('a[href], button, [role="link"], [role="button"], [role="tab"], [role="menuitem"]')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG)).slice(0, 8).map(node => {
        const label = getElementLabel(node, doc);
        const current = node.getAttribute('aria-current');
        return current && current !== 'false' ? `${label} (current)` : label;
      }).filter(Boolean);
      const label = getElementName(element, doc) || 'Navigation';
      return items.length > 0 ? `${label}: ${items.join(', ')}` : label;
    }
    case 'table': {
      const headers = getVisibleTableHeaders(element, win);
      const rowCount = element.querySelectorAll('tbody tr, tr').length;
      const statusPattern = buildTableStatusPattern(element, headers, win);
      const samples = buildTableSamples(element, headers, win, 3);
      const parts = [];
      if (headers.length > 0) parts.push(`columns ${headers.join(', ')}`);
      if (rowCount) parts.push(`rows: ${rowCount}`);
      if (statusPattern) parts.push(`visible statuses: ${statusPattern}`);
      if (samples.length > 0) parts.push(`samples: ${samples.join(' ; ')}`);
      return parts.length > 0 ? `Table: ${parts.join(' | ')}` : rowCount ? `Table with ${rowCount} rows` : 'Table';
    }
    case 'list': {
      return buildListSummary(element, win);
    }
    case 'iframe':
      return getIframeSummary(element);
    case 'form': {
      const label = getElementName(element, doc) || 'Form';
      const fields = Array.from(element.querySelectorAll('input, textarea, select, [role="combobox"], [role="switch"]')).filter(node => isHTMLElement(node) && isVisible(node, win, DEFAULT_CONFIG)).slice(0, 6).map(node => getElementLabel(node, doc)).filter(Boolean);
      return fields.length > 0 ? `${label}: fields ${fields.join(', ')}` : label;
    }
    case 'main':
    case 'section':
    case 'article':
    case 'aside':
    case 'dialog':
    case 'header':
    case 'footer': {
      const label = getElementName(element, doc) || normalizeText(element.querySelector('h1, h2, h3')?.textContent || '') || kind;
      const snippets = collectTextSnippets(element, win, {
        minLength: 18,
        maxItems: 2,
        skipNestedInteractive: true
      });
      return label ? `${label}${snippets.length > 0 ? `: ${snippets.join(' | ')}` : ''}` : snippets.join(' | ');
    }
    case 'heading': {
      const text = normalizeText(element.textContent || '');
      return text ? `Heading: ${truncateText(text, 140)}` : '';
    }
    case 'text': {
      const text = normalizeText(element.textContent || '');
      return text.length >= 28 ? `Text: ${truncateText(text, 160)}` : '';
    }
    default: {
      const direct = getDirectText(element);
      return direct.length >= 40 ? `Text: ${truncateText(direct, 160)}` : '';
    }
  }
}
function buildPageStateLines(doc, win, screenName, availableScreens) {
  const pageWidth = Math.max(doc.documentElement?.scrollWidth || 0, doc.body?.scrollWidth || 0, win.innerWidth || 0);
  const pageHeight = Math.max(doc.documentElement?.scrollHeight || 0, doc.body?.scrollHeight || 0, win.innerHeight || 0);
  const scrollX = win.scrollX || doc.documentElement?.scrollLeft || doc.body?.scrollLeft || 0;
  const scrollY = win.scrollY || doc.documentElement?.scrollTop || doc.body?.scrollTop || 0;
  const pixelsBelow = Math.max(0, pageHeight - (scrollY + win.innerHeight));
  const pixelsAbove = Math.max(0, scrollY);
  const totalPages = win.innerHeight > 0 ? pageHeight / win.innerHeight : 1;
  const currentPage = win.innerHeight > 0 ? scrollY / win.innerHeight : 0;
  const lines = [`Current route: ${screenName}`, `Current URL: ${truncateText(win.location?.href || screenName, 160)}`];
  if (availableScreens?.length > 0) {
    lines.push(`Known routes: ${availableScreens.slice(0, 32).join(', ')}`);
  }
  lines.push(`Viewport: ${win.innerWidth}x${win.innerHeight} | Page: ${pageWidth}x${pageHeight}`);
  lines.push(`Scroll position: ${pixelsAbove}px above, ${pixelsBelow}px below, page ${Math.max(1, Math.round(currentPage + 1))} of ${Math.max(1, Math.round(totalPages))}`);
  if (scrollX > 0) {
    lines.push(`Horizontal scroll: ${Math.round(scrollX)}px from the left edge`);
  }
  return lines;
}
function getNearbyTextForElement(element, doc, win) {
  const values = [];
  values.push(getAssociatedLabelText(element, doc));
  values.push(getElementName(element, doc));
  values.push(getNearestSectionLabel(element, doc));
  if (!isInputElement(element) && !isTextAreaElement(element) && !isSelectElement(element)) {
    values.push(...collectTextSnippets(element, win, {
      minLength: 8,
      maxItems: 2,
      skipNestedInteractive: true,
      stopAtInteractiveBoundary: true
    }));
  }
  if (element.parentElement) {
    values.push(...collectTextSnippets(element.parentElement, win, {
      minLength: 8,
      maxItems: 2,
      skipNestedInteractive: true,
      stopAtInteractiveBoundary: true
    }));
  }
  let previous = element.previousElementSibling;
  let previousCount = 0;
  while (previous && previousCount < 2) {
    if (previous.matches(INTERACTIVE_SELECTOR)) break;
    const text = previous.matches(HEADING_SELECTOR) || previous.matches(TEXT_CONTAINER_SELECTOR) ? getTextContent(previous) : getDirectText(previous);
    if (text) {
      values.push(text);
      previousCount += 1;
    }
    previous = previous.previousElementSibling;
  }
  let next = element.nextElementSibling;
  let nextCount = 0;
  while (next && nextCount < 2) {
    if (next.matches(INTERACTIVE_SELECTOR)) break;
    const text = next.matches(HEADING_SELECTOR) || next.matches(TEXT_CONTAINER_SELECTOR) ? getTextContent(next) : getDirectText(next);
    if (text) {
      values.push(text);
      nextCount += 1;
    }
    next = next.nextElementSibling;
  }
  return uniqueStrings(values.map(text => truncateText(text, 120)), 4);
}
function buildProps(element, metadata) {
  const props = {
    domNode: element,
    role: element.getAttribute('role') || element.tagName.toLowerCase(),
    disabled: element.disabled === true,
    aiPriority: element.getAttribute('data-ai-priority') || undefined,
    selector: buildElementSelector(element),
    nearbyText: metadata.nearbyText.join(' | ') || undefined,
    parentSectionLabel: metadata.parentSectionLabel || undefined,
    topLayer: metadata.topLayer
  };
  const scrollData = getScrollData(element, getNodeWindow(element));
  if (scrollData) {
    props.scrollable = true;
    props.scrollData = scrollData;
  }
  if (isInputElement(element) || isTextAreaElement(element) || isSelectElement(element)) {
    props.value = element.value;
    props.placeholder = 'placeholder' in element ? element.placeholder : undefined;
    props.name = element.name || undefined;
  }
  if (isInputElement(element)) {
    props.checked = element.checked;
    props.inputType = element.type;
  }
  return props;
}
function buildScrollableElement(element, index, doc) {
  const scrollData = getScrollData(element, getNodeWindow(element)) || {
    left: 0,
    up: 0,
    right: 0,
    down: 0
  };
  return {
    index,
    type: 'scrollable',
    label: getElementLabel(element, doc) || 'Scrollable area',
    zoneId: getZoneId(element),
    fiberNode: element,
    props: {
      domNode: element,
      role: element.getAttribute('role') || element.tagName.toLowerCase(),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      aiPriority: element.getAttribute('data-ai-priority') || undefined,
      selector: buildElementSelector(element),
      scrollable: true,
      scrollData
    },
    analyticsZoneId: getZoneId(element) || null
  };
}
export class PageControllerWeb {
  root;
  doc;
  win;
  base;
  config;
  flatTree = [];
  interactives = [];
  interactiveNodes = new Map();
  summaryLines = [];
  analysisComplete = false;
  rootNodeId = null;
  constructor(root, config = {}) {
    this.root = root || null;
    this.doc = getDocument(root);
    this.win = getWindow(root);
    this.base = getRootElement(root, this.doc);
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }
  static findNearestScrollableContainer(element) {
    let current = element?.parentElement || null;
    while (current) {
      const doc = current.ownerDocument;
      const win = doc?.defaultView || null;
      if (isScrollable(current, win)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }
  analyze() {
    if (this.analysisComplete) return;
    this.flatTree = [];
    this.interactives = [];
    this.interactiveNodes.clear();
    this.summaryLines = [];
    if (!this.base || !this.doc || !this.win) {
      this.analysisComplete = true;
      return;
    }
    this.rootNodeId = this.walkElement(this.base, null, 0);
    this.collectScrollables();
    this.summaryLines = this.buildStructureLines();
    this.analysisComplete = true;
  }
  walkElement(element, parentId, depth) {
    const win = getNodeWindow(element);
    if (!isHTMLElement(element) || isIgnoredByAgent(element) || !isVisible(element, win, this.config)) {
      return null;
    }
    const id = this.flatTree.length;
    const semanticKind = getElementSemanticKind(element);
    const summary = getStructureSummary(element, element.ownerDocument, win);
    const topLayer = isTopElement(element, win, this.config);
    const node = {
      id,
      parentId,
      depth,
      kind: 'element',
      element,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || undefined,
      semanticKind,
      summary,
      selector: buildElementSelector(element),
      directText: getDirectText(element),
      topLayer,
      ownerDocumentUrl: element.ownerDocument?.location?.href || ''
    };
    this.flatTree.push(node);
    const interactiveType = getElementType(element);
    const shouldIndex = !!interactiveType && (topLayer || !rectIntersectsViewport(element.getBoundingClientRect(), win, {
      ...this.config,
      viewportMode: 'viewport'
    }));
    if (shouldIndex) {
      const metadata = {
        nearbyText: getNearbyTextForElement(element, element.ownerDocument, win),
        parentSectionLabel: getNearestSectionLabel(element, element.ownerDocument),
        topLayer
      };
      const interactive = {
        index: this.interactives.length,
        type: interactiveType,
        label: getElementLabel(element, element.ownerDocument),
        aiPriority: element.getAttribute('data-ai-priority') || undefined,
        zoneId: getZoneId(element),
        fiberNode: element,
        props: buildProps(element, metadata),
        requiresConfirmation: element.getAttribute('data-ai-confirm') === 'true',
        analyticsZoneId: getZoneId(element) || null
      };
      this.interactives.push(interactive);
      this.interactiveNodes.set(interactive.index, element);
      node.interactiveIndex = interactive.index;
    }
    element.childNodes.forEach(child => {
      if (child.nodeType === 3) {
        const text = normalizeText(child.textContent || '');
        if (text && text.length >= 10) {
          this.flatTree.push({
            id: this.flatTree.length,
            parentId: id,
            depth: depth + 1,
            kind: 'text',
            text: truncateText(text, 200)
          });
        }
      } else if (child.nodeType === 1 && isHTMLElement(child)) {
        this.walkElement(child, id, depth + 1);
      }
    });
    if (this.config.traverseShadowRoots && element.shadowRoot) {
      Array.from(element.shadowRoot.childNodes).forEach(child => {
        if (child.nodeType === 1 && isHTMLElement(child)) {
          this.walkElement(child, id, depth + 1);
        }
      });
    }
    if (this.config.traverseIframes && isIFrameElement(element)) {
      try {
        const iframeDoc = element.contentDocument || element.contentWindow?.document;
        if (iframeDoc?.body) {
          Array.from(iframeDoc.body.childNodes).forEach(child => {
            if (child.nodeType === 1 && isHTMLElement(child)) {
              this.walkElement(child, id, depth + 1);
            }
          });
        }
      } catch {
        // Cross-origin iframes remain opaque boundaries.
      }
    }
    return id;
  }
  collectScrollables() {
    const seen = new Set(this.interactives.map(entry => entry.fiberNode));
    const visitRoots = [this.base];
    if (this.config.traverseShadowRoots) {
      Array.from(this.base.querySelectorAll('*')).filter(isHTMLElement).forEach(element => {
        if (element.shadowRoot) {
          visitRoots.push(element.shadowRoot);
        }
      });
    }
    visitRoots.forEach(root => {
      const queryRoot = isShadowRootNode(root) ? root : root;
      Array.from(queryRoot.querySelectorAll?.('*') || []).filter(node => isHTMLElement(node)).filter(element => !isIgnoredByAgent(element) && isVisible(element, getNodeWindow(element), this.config) && isScrollable(element, getNodeWindow(element))).forEach(element => {
        if (seen.has(element)) return;
        const entry = buildScrollableElement(element, this.interactives.length, element.ownerDocument);
        this.interactives.push(entry);
        this.interactiveNodes.set(entry.index, element);
      });
    });
  }
  buildStructureLines() {
    const lines = [];
    lines.push(...buildPageStateLines(this.doc, this.win, this.win.location?.pathname || '/', []));
    const title = normalizeText(this.doc.title);
    if (title) lines.push(`Page title: ${truncateText(title, 140)}`);
    const startNodeId = this.rootNodeId;
    const viewportStructureLines = [];
    const fallbackStructureLines = [];
    const emitted = new Set();
    const emitStructureLine = (target, node, depth) => {
      if (target.length >= 44 || emitted.has(node.id)) return;
      emitted.add(node.id);
      target.push(`${'  '.repeat(Math.max(0, depth))}- ${node.summary}`);
    };
    const walk = (node, depth, parentInViewport = false) => {
      if ((viewportStructureLines.length >= 44 && fallbackStructureLines.length >= 44) || !node) return;
      const nodeInViewport = node.kind === 'element' ? elementIntersectsViewport(node.element, getNodeWindow(node.element), STRUCTURE_VIEWPORT_CONFIG) : parentInViewport;
      if (node.kind === 'element') {
        const summary = node.summary;
        const shouldEmit = !!summary && (node.semanticKind !== 'generic' || node.interactiveIndex === undefined || summary.startsWith('Text:'));
        if (shouldEmit) {
          if (nodeInViewport && !BROAD_CONTAINER_KINDS.has(node.semanticKind)) {
            emitStructureLine(viewportStructureLines, node, depth);
          } else if (fallbackStructureLines.length < 44 && !emitted.has(node.id)) {
            fallbackStructureLines.push(`${'  '.repeat(Math.max(0, depth))}- ${summary}`);
          }
        }
        if (node.semanticKind === 'metric-card') return;
      } else if (node.kind === 'text' && node.text.length >= 48) {
        const line = `${'  '.repeat(Math.max(0, depth))}- Text: ${truncateText(node.text, 160)}`;
        if (nodeInViewport && viewportStructureLines.length < 44) {
          viewportStructureLines.push(line);
        } else if (fallbackStructureLines.length < 44) {
          fallbackStructureLines.push(line);
        }
      }
      const children = this.flatTree.filter(candidate => candidate.parentId === node.id);
      children.forEach(child => walk(child, node.kind === 'element' && node.semanticKind !== 'generic' ? depth + 1 : depth, nodeInViewport));
    };
    const roots = this.flatTree.filter(node => node.parentId === startNodeId);
    roots.forEach(node => walk(node, 0, false));
    const standaloneMetrics = Array.from(this.base.querySelectorAll('.metric-card')).filter(element => isVisible(element, getNodeWindow(element), this.config)).slice(0, 8).map(card => getStructureSummary(card, this.doc, getNodeWindow(card)).replace(/^Metric card:\s*/, '')).filter(Boolean);
    if (standaloneMetrics.length > 0) {
      lines.push('');
      lines.push('Dashboard metrics:');
      standaloneMetrics.forEach(metric => {
        lines.push(`- ${metric}`);
      });
    }
    const structureLines = viewportStructureLines.length > 0 ? viewportStructureLines : fallbackStructureLines;
    if (structureLines.length > 0) {
      lines.push('');
      lines.push(viewportStructureLines.length > 0 ? 'Visible viewport structure:' : 'Visible structure:');
      lines.push(...structureLines);
    }
    const interactiveLines = this.buildInteractiveLines();
    if (interactiveLines.length > 1) {
      lines.push('');
      lines.push(...interactiveLines);
    }
    return lines;
  }
  buildInteractiveLines() {
    const lines = ['Interactive elements:'];
    this.interactives.slice(0, 100).forEach(entry => {
      const node = entry.props?.domNode;
      const hints = [];
      if (isAnchorElement(node)) {
        const href = normalizeText(node.getAttribute('href') || '');
        if (href) hints.push(`href="${truncateText(href, 80)}"`);
      }
      const region = isHTMLElement(node) ? getNearestSectionLabel(node, node.ownerDocument) : '';
      if (region) hints.push(`region="${truncateText(region, 48)}"`);
      const current = isHTMLElement(node) ? node.getAttribute('aria-current') : null;
      if (current && current !== 'false') hints.push('current');
      if (isInputElement(node)) {
        if (node.type && node.type !== 'text') hints.push(`inputType="${node.type}"`);
        if (node.checked) hints.push('checked');
      } else if (isSelectElement(node) && node.value) {
        hints.push(`value="${truncateText(node.value, 40)}"`);
      }
      if (isHTMLElement(node) && (node.disabled === true || node.getAttribute('aria-disabled') === 'true')) {
        hints.push('disabled');
      }
      if (entry.props?.topLayer === false) {
        hints.push('covered');
      }
      if (typeof entry.props?.nearbyText === 'string' && entry.props.nearbyText) {
        hints.push(`nearby="${truncateText(entry.props.nearbyText, 100)}"`);
      }
      const scrollData = entry.props?.scrollData;
      if (scrollData) {
        const scrollHint = ['up', 'down', 'left', 'right'].map(direction => typeof scrollData[direction] === 'number' && scrollData[direction] > 0 ? `${direction}=${Math.round(scrollData[direction])}` : '').filter(Boolean).join(', ');
        if (scrollHint) hints.push(`scroll="${scrollHint}"`);
      }
      const selector = typeof entry.props?.selector === 'string' ? truncateText(entry.props.selector, 80) : '';
      if (selector) hints.push(`selector="${selector}"`);
      const suffix = hints.length > 0 ? ` ${hints.join(' ')}` : '';
      lines.push(`[${entry.index}]<${entry.type}>${truncateText(entry.label || 'Unlabeled element', 120)}</>${suffix}`);
    });
    return lines;
  }
  collectInteractives() {
    this.analyze();
    return this.interactives;
  }
  getElement(index) {
    this.analyze();
    return this.interactiveNodes.get(index) || null;
  }
  getInteractive(index) {
    this.analyze();
    return this.interactives.find(entry => entry.index === index) || null;
  }
  buildScreenSnapshot(screenName, availableScreens) {
    this.analyze();
    const pageStateLines = this.summaryLines.slice();
    if (availableScreens?.length > 0) {
      const existingIndex = pageStateLines.findIndex(line => line.startsWith('Known routes:'));
      const routesLine = `Known routes: ${availableScreens.slice(0, 32).join(', ')}`;
      if (existingIndex >= 0) {
        pageStateLines[existingIndex] = routesLine;
      } else {
        pageStateLines.splice(2, 0, routesLine);
      }
    }
    return dehydrateScreen({
      screenName,
      availableScreens,
      elementsText: pageStateLines.join('\n'),
      elements: this.interactives
    });
  }
}
