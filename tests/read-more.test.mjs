import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";

// read_more: the dehydrator builds the FULL element/structure lists but SENDS only the
// first ~100 interactive + ~120 structure lines, marks the remainder, and serves it via
// getMoreStructure()/getElementDetail() — so a dense page is never silently blind to its
// overflow, and no scrolling is needed to read already-loaded content.

const DOM_KEYS = ['window','document','Document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','HTMLOptionElement','HTMLButtonElement','HTMLAnchorElement','HTMLIFrameElement','ShadowRoot','NodeFilter','MouseEvent','Event','InputEvent','DOMRect','Node'];
function installDom(window) {
  const prev = new Map();
  for (const k of DOM_KEYS) { prev.set(k, globalThis[k]); globalThis[k] = window[k]; }
  if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};
  // jsdom has no layout — give every element a non-zero rect so isVisible passes.
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 200, height: 32, top: 10, left: 10, right: 210, bottom: 42, x: 10, y: 10 };
  };
  window.HTMLElement.prototype.getClientRects = function () { return [this.getBoundingClientRect()]; };
  return () => { for (const k of DOM_KEYS) { const v = prev.get(k); if (v === undefined) delete globalThis[k]; else globalThis[k] = v; } };
}

function buildBody(n) {
  let html = '';
  for (let i = 0; i < n; i++) html += `<button id="b${i}">Product ${i} — $${(i * 3 + 9)}</button>`;
  // a select with 50 options to exercise getElementDetail
  html += '<select id="sel">' + Array.from({ length: 50 }, (_, i) => `<option value="o${i}">Option ${i}</option>`).join('') + '</select>';
  return html;
}

test("300-element page: sends ~100 interactive lines + a '[+N more]' marker", () => {
  const dom = new JSDOM(`<!doctype html><html><body>${buildBody(300)}</body></html>`, { url: "https://x.test/" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body);
    const snap = c.buildScreenSnapshot("Test", []);
    const interactiveLines = (snap.elementsText.match(/^\*?\[\d+\]</gm) || []).length;
    assert.ok(interactiveLines <= 101 && interactiveLines >= 90, `sent ~100 interactive lines, got ${interactiveLines}`);
    assert.match(snap.elementsText, /\[\+.*more interactive control/, "has a page-level truncation marker");
    assert.match(snap.elementsText, /read_more\(\)/, "marker tells the model to call read_more()");
    // every element is still collected + index-stable (not just the 100 sent)
    assert.ok(c.interactives.length >= 300, `all elements collected, got ${c.interactives.length}`);
  } finally { restore(); }
});

test("getMoreStructure pages the overflow with correct indices; getInteractive resolves a revealed index", () => {
  const dom = new JSDOM(`<!doctype html><html><body>${buildBody(300)}</body></html>`, { url: "https://x.test/" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body);
    c.buildScreenSnapshot("Test", []);
    const page1 = c.getMoreStructure(0);
    assert.ok(page1.total > 0, "there is overflow to page");
    assert.ok(page1.text.length > 0, "first overflow page returns text");
    assert.match(page1.text, /\[1\d\d\]/, "overflow carries real indices >= 100");
    // a revealed index still resolves to a live node (tappable)
    const revealed = c.getInteractive(250);
    assert.ok(revealed, "getInteractive(250) resolves the revealed control");
    // pagination terminates
    let offset = 0, guard = 0, sawEnd = false;
    while (guard++ < 20) {
      const p = c.getMoreStructure(offset);
      offset = p.nextOffset;
      if (!p.hasMore) { sawEnd = true; break; }
    }
    assert.ok(sawEnd, "pagination reaches the end (hasMore=false)");
  } finally { restore(); }
});

test("getElementDetail returns ALL 50 options for a <select> (vs the capped line)", () => {
  const dom = new JSDOM(`<!doctype html><html><body>${buildBody(2)}</body></html>`, { url: "https://x.test/" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body);
    c.buildScreenSnapshot("Test", []);
    const selectEntry = c.interactives.find(e => e.props?.domNode?.tagName?.toLowerCase() === 'select');
    assert.ok(selectEntry, "the select was indexed");
    const detail = c.getElementDetail(selectEntry.index);
    assert.ok(detail.found, "element detail found");
    assert.match(detail.text, /all options \(50\)/, "returns all 50 options");
    assert.match(detail.text, /Option 49/, "includes the last option (not capped)");
  } finally { restore(); }
});

test("getElementDetail on a missing index is graceful", () => {
  const dom = new JSDOM(`<!doctype html><html><body>${buildBody(2)}</body></html>`, { url: "https://x.test/" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body);
    c.buildScreenSnapshot("Test", []);
    const detail = c.getElementDetail(9999);
    assert.equal(detail.found, false);
  } finally { restore(); }
});
