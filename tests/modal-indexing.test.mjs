import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";

// Minimal DOM harness (PageControllerWeb is react-free, so this runs without the web
// SDK's react peer dep). Stubs a non-zero layout rect so isVisible/isTopElement behave.
function withDom(body, fn) {
  const dom = new JSDOM(`<!doctype html><html><head><title>t</title></head><body>${body}</body></html>`, {
    url: "https://shop.example.com/checkout",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const keys = ["window", "document", "Document", "HTMLElement", "ShadowRoot", "NodeFilter", "Event", "MouseEvent"];
  const prev = new Map();
  keys.forEach((k) => { prev.set(k, globalThis[k]); globalThis[k] = window[k]; });
  const origRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 280, height: 44, top: 20, left: 20, right: 300, bottom: 64 });
  try {
    return fn(dom);
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = origRect;
    keys.forEach((k) => { const v = prev.get(k); if (v === undefined) delete globalThis[k]; else globalThis[k] = v; });
  }
}

test("modal close 'X' is indexed even when a backdrop wins the hit-test", () => {
  // Reported bug: agent sees the dialog but its corner close "X" never enters the
  // interactive set — a full-screen backdrop wins elementFromPoint at the X's center
  // → isTopElement=false → dropped. Fix: a control inside an open modal is top-layer.
  withDom(`
    <main><button id="page-btn">Page button</button></main>
    <div class="backdrop" style="position:fixed"></div>
    <div role="dialog" aria-modal="true">
      <h2>Edit address</h2>
      <button class="modal-x" aria-label="Close">&times;</button>
      <button>Save Address</button>
    </div>
  `, (dom) => {
    const backdrop = dom.window.document.querySelector(".backdrop");
    // Every center-point hit returns the backdrop, never the element itself.
    dom.window.document.elementFromPoint = () => backdrop;

    const controller = new PageControllerWeb(dom.window.document);
    const snapshot = controller.buildScreenSnapshot("/checkout", ["/checkout"]);
    const labels = snapshot.elements.map((e) => e.label || "");

    assert.ok(labels.some((l) => /close/i.test(l)), `modal close "X" should be indexed (got: ${labels.join(" | ")})`);
    assert.ok(labels.some((l) => /save address/i.test(l)), "modal Save should be indexed");
    // A non-modal control occluded by the same backdrop stays dropped — the fix is
    // scoped to open modals, NOT a blanket hit-test bypass.
    assert.ok(!labels.some((l) => /page button/i.test(l)), "occluded non-modal button should NOT be indexed");
  });
});
