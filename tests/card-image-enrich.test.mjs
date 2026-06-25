import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { enrichReplyImages, findProductImageSrc } from "../module/web/core/cardImages.js";

// Product-card images are enriched CLIENT-SIDE from the live DOM (zero model-token cost): the
// agent tags a card item with sourceIndex = the product's element index, and the client resolves
// the photo. Must NEVER show the wrong product's image (the climbing-to-ancestor bug).

function setup(html) {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  for (const k of ["window", "document", "HTMLElement", "Element", "Node"]) globalThis[k] = dom.window[k];
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const w = Number(this.getAttribute && this.getAttribute("width")) || 120;
    return { width: w, height: w, top: 0, left: 0, right: w, bottom: w };
  };
  const byId = (id) => dom.window.document.getElementById(id);
  return { dom, byId };
}

test("fills imageUrl from the product's own element; skips data: + tiny + missing", () => {
  const { byId } = setup(`
    <a id="p5"><img src="https://cdn.x/anker.jpg" width=120 height=120><span>Anker</span></a>
    <a id="p6"><img src="data:image/png;base64,zz"><span>SODO</span></a>
    <a id="p7"><img src="https://cdn.x/icon.png" width=16 height=16><span>Tiny</span></a>
  `);
  const els = { 5: byId("p5"), 6: byId("p6"), 7: byId("p7") };
  const platformAdapter = { getController: () => ({ getElement: (i) => els[i] || null }) };
  const reply = [{ type: "block", blockType: "ComparisonCard", props: { items: [
    { title: "Anker", sourceIndex: 5 },
    { title: "SODO", sourceIndex: 6 },   // data: img → no image
    { title: "Tiny", sourceIndex: 7 },   // 16px icon → no image
    { title: "NoIdx" },                  // no sourceIndex → no image
  ] } }];
  const items = enrichReplyImages(reply, platformAdapter)[0].props.items;
  assert.equal(items[0].imageUrl, "https://cdn.x/anker.jpg", "real product photo filled");
  assert.equal(items[1].imageUrl, undefined, "data: placeholder → no image (not a sibling's!)");
  assert.equal(items[2].imageUrl, undefined, "tiny icon skipped");
  assert.equal(items[3].imageUrl, undefined, "no sourceIndex → untouched");
});

test("never climbs to a sibling product's image (the cross-contamination bug)", () => {
  // p6's own image is a data: placeholder; p5 (a sibling in the same list) has a real one.
  // findProductImageSrc(p6) must return null, NOT p5's photo.
  const { byId } = setup(`
    <div class="list">
      <a id="p5"><img src="https://cdn.x/anker.jpg" width=120 height=120></a>
      <a id="p6"><img src="data:image/png;base64,zz"></a>
    </div>
  `);
  assert.equal(findProductImageSrc(byId("p6")), null, "sibling's image must NOT leak in");
  assert.equal(findProductImageSrc(byId("p5")), "https://cdn.x/anker.jpg");
});

test("ProductCard (single) with sourceIndex on props gets imageUrl", () => {
  const { byId } = setup(`<a id="p3"><img src="https://cdn.x/room.jpg" width=200 height=150></a>`);
  const platformAdapter = { getController: () => ({ getElement: (i) => (i === 3 ? byId("p3") : null) }) };
  const reply = [{ type: "block", blockType: "ProductCard", props: { title: "Suite", sourceIndex: 3 } }];
  const out = enrichReplyImages(reply, platformAdapter);
  assert.equal(out[0].props.imageUrl, "https://cdn.x/room.jpg");
});

test("no-ops safely without a controller / non-array reply / pre-set image", () => {
  assert.deepEqual(enrichReplyImages([{ props: { items: [{ sourceIndex: 1 }] } }], {}), [{ props: { items: [{ sourceIndex: 1 }] } }]);
  assert.equal(enrichReplyImages("not array", {}), "not array");
  const adapter = { getController: () => ({ getElement: () => null }) };
  const pre = [{ props: { items: [{ sourceIndex: 1, imageUrl: "keep.jpg" }] } }];
  assert.equal(enrichReplyImages(pre, adapter)[0].props.items[0].imageUrl, "keep.jpg");
});
