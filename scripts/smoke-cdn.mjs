// Smoke test: load dist/mobileai.js in jsdom, mount via window.MobileAI.init,
// assert a Shadow DOM widget attaches and tears down cleanly.

import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const code = fs.readFileSync('dist/mobileai.js', 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://example.com/',
});
const { window } = dom;

// jsdom is missing a few browser APIs the agent touches; stub them.
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
window.fetch = window.fetch || (() => Promise.reject(new Error('no network in smoke test')));
window.WebSocket = window.WebSocket || function () { this.close = () => {}; this.send = () => {}; };
window.scrollTo = window.scrollTo || (() => {});

const fail = (m) => { console.error('FAIL:', m); process.exit(1); };

const el = window.document.createElement('script');
el.textContent = code;
window.document.body.appendChild(el);

if (typeof window.MobileAI !== 'object') fail('window.MobileAI not defined');
if (typeof window.MobileAI.init !== 'function') fail('window.MobileAI.init not a function');
console.log('✓ window.MobileAI.init exposed');

let handle;
try {
  handle = window.MobileAI.init({
    proxyUrl: 'https://mobileai.cloud/api/v1/hosted-proxy/text',
    proxyHeaders: { Authorization: 'Bearer mobileai_pub_test' },
    analyticsKey: 'mobileai_pub_test',
  });
} catch (e) {
  fail('init() threw: ' + (e && e.stack || e));
}

const root = window.document.querySelector('[data-mobileai-root]');
if (!root) fail('no [data-mobileai-root] attached to body');
if (!root.shadowRoot) fail('host has no shadowRoot');
const childCount = root.shadowRoot.childNodes.length;
if (childCount === 0) fail('shadow root rendered nothing');
console.log(`✓ mounted into Shadow DOM (shadow child nodes: ${childCount})`);

if (typeof handle.destroy !== 'function') fail('handle.destroy missing');
handle.destroy();
if (window.document.querySelector('[data-mobileai-root]')) fail('destroy() did not remove host');
console.log('✓ destroy() removed the widget');

console.log('\nSMOKE PASS — framework-agnostic Preact bundle mounts + tears down.');
process.exit(0);
