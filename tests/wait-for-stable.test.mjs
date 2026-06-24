import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { waitForPageStable } from "../module/web/core/waitForStable.js";

// waitForPageStable() returns TRUE when the page settled (readyState complete + URL stable),
// FALSE when it hit the timeout while still loading. The server's dead-action guard relies
// on this: an unchanged screen is only a dead loop when the page actually settled — never
// while it's still loading.

test("resolves TRUE when document is complete and URL is stable", async () => {
  const dom = new JSDOM("<!doctype html><html><body>ready</body></html>", {
    url: "https://example.com/x",
  });
  // jsdom starts at readyState 'loading'; force 'complete' to model a settled page.
  Object.defineProperty(dom.window.document, "readyState", {
    configurable: true,
    get: () => "complete",
  });
  const settled = await waitForPageStable(dom.window, dom.window.document, 1500);
  assert.equal(settled, true);
});

test("resolves FALSE (still loading) when readyState never completes", async () => {
  const dom = new JSDOM("<!doctype html><html><body>loading</body></html>", {
    url: "https://example.com/y",
  });
  Object.defineProperty(dom.window.document, "readyState", {
    configurable: true,
    get: () => "loading",
  });
  const start = Date.now();
  const settled = await waitForPageStable(dom.window, dom.window.document, 200); // small cap, fast test
  assert.equal(settled, false);
  assert.ok(Date.now() - start >= 180, "should have waited out the timeout");
});

test("returns true when there is no DOM (SSR/non-browser)", async () => {
  const settled = await waitForPageStable(null, null, 100);
  assert.equal(settled, true);
});
