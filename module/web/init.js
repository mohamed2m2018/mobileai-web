"use strict";

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AIAgent } from "./components/AIAgent.js";

/**
 * Framework-agnostic imperative mount.
 *
 * Renders the MobileAI agent into a Shadow DOM root so host-page CSS can't
 * bleed in (and the widget's styles can't leak out). Works with any stack —
 * React, Vue, Angular, Svelte, vanilla — and from a plain <script> tag.
 *
 * @param {object} config - AIAgent props (proxyUrl, proxyHeaders, analyticsKey, ...)
 *   plus optional `target` (an Element to mount into; defaults to document.body).
 * @returns {{ el: HTMLElement, destroy: () => void }} handle
 */
export function init(config = {}) {
  if (typeof document === 'undefined') {
    throw new Error('[MobileAI] init() must run in a browser environment.');
  }

  const { target, ...agentProps } = config;

  // Host element: zero-footprint anchor. The widget itself is position:fixed,
  // so it escapes this 0x0 box and positions against the viewport.
  const host = document.createElement('div');
  host.setAttribute('data-mobileai-root', '');
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000;';

  const parent = (target instanceof Element ? target : document.body);
  parent.appendChild(host);

  // Shadow DOM isolates styles in both directions. AIAgent uses inline styles
  // only (no @keyframes, no stylesheet injection), so nothing extra to inject.
  const shadow = host.attachShadow({ mode: 'open' });
  const mount = document.createElement('div');
  shadow.appendChild(mount);

  const root = createRoot(mount);
  root.render(createElement(AIAgent, agentProps));

  let destroyed = false;
  return {
    el: host,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { root.unmount(); } catch { /* already gone */ }
      host.remove();
    },
  };
}
