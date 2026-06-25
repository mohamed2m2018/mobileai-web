import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";

// Part A — compact TSV screen encoding (idx⇥kind⇥label⇥link⇥flags). Cuts the uncached
// per-step screen ~2× (more on real product SERPs whose hrefs are 100+ char tracking URLs)
// by replacing the verbose `[idx]<type>label</> href="…" region="…"` line. It must stay
// LOSSLESS for everything the agent acts on: indices unchanged, native form constraints,
// on-screen prices + nearby text, and a STRUCTURAL link intent (no content guessing).

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

// a checkout FORM + a faceted SERP with product cards, a filter link, an external link,
// an in-page anchor, and a tracking-param product href.
const HTML = `<!doctype html><html><body>
<form>
 <label>Email<input id=e type=email required maxlength=60 placeholder="you@x.com"></label>
 <label>Qty<input id=q type=number min=1 max=10 value=2></label>
 <select id=country><option>Egypt</option><option>UAE</option></select>
 <label><input type=checkbox id=tos> I agree to terms</label>
 <div role=radio aria-checked=true tabindex=0>Cash on delivery</div>
 <div role=radio aria-checked=false tabindex=0>Bank transfer</div>
 <button id=sub disabled>Place order</button>
</form>
<section aria-label="Results">
 <a href="/egypt-en/p-soundcore-q11i-12345?o=abc&utm_source=ggl" class="product">Soundcore Q11i Headphones</a>
 <div class="product"><a href="/egypt-en/p-sodo-999">SODO Wireless</a><span>990 EGP</span></div>
 <div class="product"><a href="/egypt-en/p-anker-egp">Anker Q20i</a><span>EGP 1,299</span></div>
 <a href="/egypt-en/search?f[brand]=anker&page=2">Anker brand</a>
 <a href="https://external.example.com/deal">See external deal</a>
 <a href="#reviews">Jump to reviews</a>
 <a href="/cart">Go to Cart</a>
</section></body></html>`;

function snapshot(compact) {
  const dom = new JSDOM(HTML, { url: "https://www.noon.com/egypt-en/search?q=headphones" });
  const restore = installDom(dom.window);
  try {
    const c = new PageControllerWeb(dom.window.document.body, { compactScreen: compact });
    c.analyze();
    return { lines: c.buildInteractiveLines(), interactives: c.interactives };
  } finally { restore(); }
}

test("compact TSV is smaller than the verbose format and keeps every index", () => {
  const oldS = snapshot(false), newS = snapshot(true);
  const oldTxt = oldS.lines.join("\n"), newTxt = newS.lines.join("\n");
  assert.ok(newTxt.length < oldTxt.length * 0.7, `compact is meaningfully smaller (${oldTxt.length} -> ${newTxt.length})`);
  // index stability — same idx set in both formats (the agent acts by idx)
  const newIdx = new Set([...newTxt.matchAll(/(?:^|\n)\*?(\d+)\t/g)].map(m => +m[1]));
  for (const e of newS.interactives) assert.ok(newIdx.has(e.index), `idx ${e.index} present in compact output`);
});

test("native form constraints are serialized structurally (no static type-list)", () => {
  const t = snapshot(true).lines.join("\n");
  assert.match(t, /i:email\([^)]*req/, "email input: type + required");
  assert.match(t, /i:number\([^)]*min=1[^)]*max=10/, "number input: min/max from native attrs");
  assert.match(t, /len<=60/, "maxLength constraint");
  assert.match(t, /k(=Egypt)?\[Egypt\|UAE\]/, "<select> options listed");
  assert.match(t, /\bs:off\b/, "checkbox state");
  // CUSTOM selection controls (role=radio + aria-checked) must expose selected state too —
  // the agent was blind to a custom payment radio's selection and re-tapped it into a surrender.
  assert.match(t, /s:on\tCash on delivery/, "custom aria-checked=true radio shows s:on");
  assert.match(t, /s:off\tBank transfer/, "custom aria-checked=false radio shows s:off");
  assert.match(t, /Place order\t[^\n]*disabled/, "disabled (gated) flag on the submit button");
});

test("link is a structural intent — query data kept, tracking dropped, external/anchor marked", () => {
  const t = snapshot(true).lines.join("\n");
  assert.match(t, /\?[^\t\n]*brand=anker/, "filter query params decoded into the link");
  assert.match(t, /\?[^\t\n]*page=2/, "pagination param kept");
  assert.match(t, /↗/, "external link marked");
  assert.match(t, /#in-page/, "in-page anchor marked");
  assert.doesNotMatch(t, /utm_source|o=abc/, "tracking params dropped");
  assert.doesNotMatch(t, /href="\/egypt-en\/p-soundcore/, "no raw 100-char tracking href emitted");
});

test("on-screen price + nearby text are never trimmed (currency in either order)", () => {
  const t = snapshot(true).lines.join("\n");
  assert.match(t, /SODO Wireless 990 ?EGP/, "number-first price pulled into the label");
  // Currency-FIRST (EGP 1,299) is the norm on Egyptian/Gulf sites — the old regex dropped it,
  // so the agent hunted for the price via read_more and the give-up guard surrendered the run.
  assert.match(t, /Anker Q20i[^\t\n]*EGP\s?1,299/, "currency-first price is pulled into the label");
});

test("kill-switch: compactScreen:false restores the verbose [idx]<type> format", () => {
  const t = snapshot(false).lines.join("\n");
  assert.match(t, /\[\d+\]<(pressable|text-input|picker|switch)>/, "verbose format still available");
  assert.doesNotMatch(t, /^\d+\ti:/m, "no TSV rows when disabled");
});
