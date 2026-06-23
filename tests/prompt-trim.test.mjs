import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";

function withDom(body, fn) {
  const dom = new JSDOM(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`, {
    url: "https://shop.example.com/p",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const keys = ["window", "document", "Document", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLButtonElement", "HTMLAnchorElement", "ShadowRoot", "NodeFilter", "Event", "MouseEvent"];
  const prev = new Map();
  keys.forEach((k) => { prev.set(k, globalThis[k]); globalThis[k] = window[k]; });
  const origRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 200, height: 40, top: 20, left: 20, right: 220, bottom: 60 });
  try {
    return fn(dom);
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = origRect;
    keys.forEach((k) => { const v = prev.get(k); if (v === undefined) delete globalThis[k]; else globalThis[k] = v; });
  }
}

test("elementsText never emits selector= (the agent acts by index, not CSS)", () => {
  withDom(`
    <main>
      <a href="/cart" class="nav-link primary cart-cta" data-id="x">Cart</a>
      <button class="btn btn-lg checkout-button">Place order</button>
      <a href="/home" id="home-anchor" class="header__nav-item">Home</a>
    </main>
  `, (dom) => {
    const controller = new PageControllerWeb(dom.window.document);
    const t = controller.buildScreenSnapshot("/p", ["/p"]).elementsText;
    assert.ok(/Place order/.test(t), "control should still be listed");
    assert.doesNotMatch(t, /selector="/, "selector hint must not be emitted to the model");
  });
});

test("on-screen context for a bare-number date cell is never trimmed", () => {
  // Regression guard: gating nearby by label "strength" dropped the month context from
  // bare-number calendar cells ("15"/"17") — the agent could no longer pick a check-out
  // date and looped on the check-in cell. On-screen text is grounding and always ships.
  withDom(`
    <section>
      <h2>July 2026</h2>
      <p>Select your check-out date</p>
      <button>16</button><button>17</button><button>18</button>
    </section>
  `, (dom) => {
    const controller = new PageControllerWeb(dom.window.document);
    const t = controller.buildScreenSnapshot("/p", ["/p"]).elementsText;
    assert.doesNotMatch(t, /selector="/, "selector (a CSS path, not on-screen text) stays dropped");
    const cell17 = t.split("\n").find((l) => /<pressable>17/.test(l)) || "";
    assert.match(cell17, /nearby="/, "numeric date cell must keep its on-screen context (the month)");
    assert.match(cell17, /July 2026/, "the disambiguating month must be present");
  });
});
