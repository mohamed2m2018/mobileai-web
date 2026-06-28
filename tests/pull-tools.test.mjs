import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";

// Pull tools (P3): getMainText backs get_page_text; collectInteractives is the FULL element
// list that find ranks. Both are exercised here against a real (jsdom) DOM.

const DOM_KEYS = ['window','document','Document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement','HTMLButtonElement','HTMLAnchorElement','HTMLIFrameElement','ShadowRoot','NodeFilter','MouseEvent','Event','InputEvent','DOMRect','Node'];
function installDom(window) {
  const prev = new Map();
  for (const k of DOM_KEYS) { prev.set(k, globalThis[k]); globalThis[k] = window[k]; }
  if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 200, height: 32, top: 10, left: 10, right: 210, bottom: 42, x: 10, y: 10 };
  };
  window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  return () => { for (const k of DOM_KEYS) { const v = prev.get(k); if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } };
}

// Mirror of WebPlatformAdapter.findElements ranking, run over PageControllerWeb.collectInteractives()
// — so this validates the same {index,type,label,nearbyText} contract the adapter consumes.
function rankFind(controller, query, limit = 12) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(t => t.length > 1);
  if (!tokens.length) return [];
  const scored = [];
  for (const entry of controller.collectInteractives() || []) {
    if (!entry || entry.index == null) continue;
    const hay = [entry.label, entry.type, entry.props?.nearbyText].filter(Boolean).join(' ').toLowerCase();
    if (!hay) continue;
    let score = 0;
    for (const t of tokens) if (hay.includes(t)) score += 1;
    if (!score) continue;
    if (hay.includes(q)) score += tokens.length;
    if (typeof entry.label === 'string' && entry.label.toLowerCase().includes(q)) score += 1;
    scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ entry }) => ({ index: entry.index, type: entry.type || 'element', label: entry.label || '' }));
}

test("getMainText extracts the <main> article prose, not nav/footer chrome", () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <nav><a href="/">Home</a><a href="/cart">Cart</a></nav>
    <main><article><h1>Return Policy</h1><p>You may return items within 30 days for a full refund.</p>
    <script>var tracking = 1;</script></article></main>
    <footer>Copyright 2026 Acme</footer>
  </body></html>`, { url: "https://x.test/policy" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body);
    const text = c.getMainText();
    assert.match(text, /return items within 30 days/i, "returns the main article prose");
    assert.doesNotMatch(text, /var tracking/, "drops nested <script> content");
    assert.doesNotMatch(text, /Copyright 2026/, "does not include the footer chrome");
  } finally { restore(); }
});

test("find: a natural-language query surfaces the right control by index", () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <button id="a">Add to cart — Blue Backpack</button>
    <button id="b">Add to cart — Red Bike Light</button>
    <button id="c">Proceed to Checkout</button>
    <input id="e" aria-label="Email address" />
  </body></html>`, { url: "https://x.test/shop" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body);
    c.buildScreenSnapshot("Shop", []);

    const checkout = rankFind(c, "checkout button");
    assert.ok(checkout.length >= 1, "found a match for 'checkout'");
    assert.match(checkout[0].label, /Checkout/i, "top match is the Checkout control");

    const blue = rankFind(c, "add to cart blue backpack");
    assert.match(blue[0].label, /Blue Backpack/i, "phrase query ranks the blue backpack button first");

    const email = rankFind(c, "email field");
    assert.match(email[0].label, /Email/i, "finds the email input by its aria-label");

    assert.equal(rankFind(c, "nonexistent zzz widget").length, 0, "no false matches for an absent control");
  } finally { restore(); }
});
