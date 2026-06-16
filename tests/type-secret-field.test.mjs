import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { WebPlatformAdapter } from "../module/web/core/WebPlatformAdapter.js";

function installDomGlobals(window) {
  const previous = new Map();
  const keys = ['window', 'document', 'Document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLIFrameElement', 'ShadowRoot', 'NodeFilter', 'MouseEvent', 'Event', 'InputEvent', 'PopStateEvent', 'DOMRect'];
  keys.forEach(key => {
    previous.set(key, globalThis[key]);
    globalThis[key] = window[key];
  });
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 320, height: 48, top: 0, left: 0, right: 320, bottom: 48 };
  };
  return () => {
    keys.forEach(key => {
      const value = previous.get(key);
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    });
  };
}

function createDom(body, url = "https://example.com/signin") {
  const dom = new JSDOM(`<!doctype html><html><head><title>Sign in</title></head><body>${body}</body></html>`, { url, pretendToBeVisual: true });
  return { dom, cleanup: installDomGlobals(dom.window) };
}

// Map each indexed snapshot element to its live DOM node so the assertions do
// not depend on label-extraction details.
function indexByPredicate(adapter, snapshot, predicate) {
  for (const el of snapshot.elements) {
    if (el.index == null) continue;
    const node = adapter.getDomNode(el.index);
    if (node && predicate(node)) return el.index;
  }
  return undefined;
}

test("WebPlatformAdapter refuses to type into a password field; value never lands", async () => {
  const { dom, cleanup } = createDom(`
    <main><form>
      <input type="text" aria-label="Email" />
      <input type="password" aria-label="Password" />
    </form></main>
  `);
  try {
    const { document } = dom.window;
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      getCurrentScreenName: () => '/signin',
      getAvailableScreens: () => [],
    });
    const snapshot = adapter.getScreenSnapshot();
    const emailIndex = indexByPredicate(adapter, snapshot, n => n.tagName === 'INPUT' && n.type === 'text');
    const pwIndex = indexByPredicate(adapter, snapshot, n => n.tagName === 'INPUT' && n.type === 'password');
    assert.ok(emailIndex != null, 'email input indexed');
    assert.ok(pwIndex != null, 'password input indexed');

    // Non-secret field types normally.
    const emailRes = await adapter.executeAction({ type: 'type', index: emailIndex, text: 'sam@acme.com' });
    assert.match(emailRes, /✅ Typed/);
    assert.equal(document.querySelector('input[type=text]').value, 'sam@acme.com');

    // Password field is refused and the secret never reaches the DOM.
    const pwRes = await adapter.executeAction({ type: 'type', index: pwIndex, text: 'hunter2' });
    assert.match(pwRes, /🔒 Refused/);
    assert.equal(document.querySelector('input[type=password]').value, '');
  } finally {
    cleanup();
  }
});

test("WebPlatformAdapter refuses card-number and CVV autocomplete fields", async () => {
  const { dom, cleanup } = createDom(`
    <main><form>
      <input type="text" autocomplete="cc-number" aria-label="Card number" />
      <input type="text" autocomplete="cc-csc" aria-label="CVV" />
    </form></main>
  `);
  try {
    const { document } = dom.window;
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      getCurrentScreenName: () => '/pay',
      getAvailableScreens: () => [],
    });
    const snapshot = adapter.getScreenSnapshot();
    const ccIndex = indexByPredicate(adapter, snapshot, n => n.getAttribute?.('autocomplete') === 'cc-number');
    const cvvIndex = indexByPredicate(adapter, snapshot, n => n.getAttribute?.('autocomplete') === 'cc-csc');
    assert.ok(ccIndex != null, 'card-number input indexed');
    assert.ok(cvvIndex != null, 'cvv input indexed');

    assert.match(await adapter.executeAction({ type: 'type', index: ccIndex, text: '4111111111111111' }), /🔒 Refused/);
    assert.match(await adapter.executeAction({ type: 'type', index: cvvIndex, text: '123' }), /🔒 Refused/);
    assert.equal(document.querySelector('input[autocomplete=cc-number]').value, '');
  } finally {
    cleanup();
  }
});
