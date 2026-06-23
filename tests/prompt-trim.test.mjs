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

test("nearby is kept for form controls, dropped for strong-labeled buttons", () => {
  withDom(`
    <form>
      <label for="qty">Quantity per box</label>
      <select id="qty"><option>1</option><option>2</option></select>
      <div>Shipping options for your order</div>
      <button>Continue to payment</button>
    </form>
  `, (dom) => {
    const controller = new PageControllerWeb(dom.window.document);
    const t = controller.buildScreenSnapshot("/p", ["/p"]).elementsText;
    // The select (form control) keeps its nearby context...
    const selectLine = t.split("\n").find((l) => /<picker>/.test(l)) || "";
    assert.match(selectLine, /nearby="/, "form control should keep nearby");
    // ...the strong-labeled button does not carry a redundant nearby.
    const btnLine = t.split("\n").find((l) => /Continue to payment/.test(l)) || "";
    assert.doesNotMatch(btnLine, /nearby="/, "strong-labeled button should not carry nearby");
  });
});
