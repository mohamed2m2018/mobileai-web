import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";
import { WebPlatformAdapter } from "../module/web/core/WebPlatformAdapter.js";

function patchWindowForTests(window) {
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: 320,
      height: 48,
      top: 0,
      left: 0,
      right: 320,
      bottom: 48
    };
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}

function installDomGlobals(window) {
  const previous = new Map();
  const keys = ['window', 'document', 'Document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLAnchorElement', 'HTMLIFrameElement', 'ShadowRoot', 'NodeFilter', 'MouseEvent', 'Event', 'InputEvent', 'PopStateEvent', 'DOMRect'];
  keys.forEach(key => {
    previous.set(key, globalThis[key]);
    globalThis[key] = window[key];
  });
  const restoreWindowPatch = patchWindowForTests(window);
  return () => {
    restoreWindowPatch();
    keys.forEach(key => {
      const value = previous.get(key);
      if (value === undefined) {
        delete globalThis[key];
      } else {
        globalThis[key] = value;
      }
    });
  };
}

function createDom(body, url = "https://example.com/dashboard") {
  const dom = new JSDOM(`<!doctype html><html><head><title>MobileAI Dashboard</title></head><body>${body}</body></html>`, {
    url,
    pretendToBeVisual: true
  });
  const cleanup = installDomGlobals(dom.window);
  return {
    dom,
    cleanup
  };
}

function setRect(element, rect) {
  element.getBoundingClientRect = () => ({
    width: rect.width,
    height: rect.height,
    top: rect.top,
    left: rect.left,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height
  });
}

test("PageControllerWeb builds dashboard-aware screen summaries from DOM structure", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <nav aria-label="Primary navigation">
      <a href="/dashboard" aria-current="page">Dashboard</a>
      <a href="/legal">Legal</a>
    </nav>
    <main>
      <div class="page-header">
        <h1 class="page-header__title">Operations dashboard</h1>
        <p class="page-header__description">Monitor support automation and hotspots.</p>
      </div>
      <section class="surface-card">
        <div class="surface-card__header">
          <h2 class="surface-card__title">Analytics hotspots</h2>
          <p class="surface-card__description">Where support demand is concentrated today.</p>
        </div>
        <div class="metric-card">
          <div class="metric-card__label">Requests handled by AI</div>
          <div class="metric-card__value">53%</div>
          <p class="metric-card__context">Up 7% this week</p>
        </div>
        <button>Export report</button>
      </section>
    </main>
  `);
  try {
    const controller = new PageControllerWeb(dom.window.document);
    const snapshot = controller.buildScreenSnapshot('/dashboard', ['/dashboard', '/legal']);
    assert.match(snapshot.elementsText, /Current route: \/dashboard/);
    assert.match(snapshot.elementsText, /Known routes: \/dashboard, \/legal/);
    assert.match(snapshot.elementsText, /Page header: Operations dashboard/);
    assert.match(snapshot.elementsText, /Section card: Analytics hotspots/);
    assert.match(snapshot.elementsText, /Dashboard metrics:/);
    assert.match(snapshot.elementsText, /Requests handled by AI: 53% \| Up 7% this week/);
    assert.match(snapshot.elementsText, /\[2\]<pressable>Export report/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb serializes visible table rows and status patterns for dashboard traces", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <section class="surface-card">
        <div class="surface-card__header">
          <h2 class="surface-card__title">Action history</h2>
          <p class="surface-card__description">Filter by action type, outcome, and session to isolate problem moments.</p>
        </div>
        <table class="dashboard-table text-sm">
          <thead>
            <tr>
              <th>Time</th>
              <th>Screen</th>
              <th>Query / Action</th>
              <th>Status</th>
              <th>Conversation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>2:35 PM</td>
              <td>/dashboard/agent/traces</td>
              <td>filter changed to agent_step</td>
              <td>Success</td>
              <td><button>conv_12345678</button></td>
            </tr>
            <tr>
              <td>2:34 PM</td>
              <td>/dashboard/agent/traces</td>
              <td>tap -> conversation details</td>
              <td>Success</td>
              <td><button>conv_87654321</button></td>
            </tr>
            <tr>
              <td>2:33 PM</td>
              <td>/dashboard/api-keys</td>
              <td>save api key</td>
              <td>Failed</td>
              <td><button>conv_deadbeef</button></td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  `, "https://example.com/dashboard/agent/traces");
  try {
    const controller = new PageControllerWeb(dom.window.document);
    const snapshot = controller.buildScreenSnapshot('/dashboard/agent/traces', ['/dashboard/agent/traces']);
    assert.match(snapshot.elementsText, /Table: columns Time, Screen, Query \/ Action, Status, Conversation/);
    assert.match(snapshot.elementsText, /visible statuses: 2 Success, 1 Failed/);
    assert.match(snapshot.elementsText, /Screen: \/dashboard\/agent\/traces \| Query \/ Action: filter changed to agent_step \| Status: Success/);
    assert.match(snapshot.elementsText, /Screen: \/dashboard\/api-keys \| Query \/ Action: save api key \| Status: Failed/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb prioritizes the current viewport on long anchor pages", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <aside>
        <a href="#why">Why MobileAI</a>
        <a href="#code">Code Examples</a>
      </aside>
      <section id="why">
        <h2>Why MobileAI</h2>
        <p>Earlier documentation content that is no longer in the viewport.</p>
      </section>
      <section id="code">
        <h2>Code Examples</h2>
        <p>Production-ready snippets for the most common use cases.</p>
        <pre><code>import { AIAgent } from 'experimental-stuff';</code></pre>
      </section>
    </main>
  `, "https://example.com/dashboard/docs#code");
  try {
    const {
      document
    } = dom.window;
    Object.defineProperty(dom.window, 'innerHeight', {
      configurable: true,
      value: 800
    });
    const why = document.getElementById('why');
    const whyHeading = why.querySelector('h2');
    const whyText = why.querySelector('p');
    const code = document.getElementById('code');
    const codeHeading = code.querySelector('h2');
    const codeText = code.querySelector('p');
    const codeBlock = code.querySelector('pre');
    setRect(why, {
      top: -1200,
      left: 280,
      width: 700,
      height: 280
    });
    setRect(whyHeading, {
      top: -1180,
      left: 300,
      width: 240,
      height: 40
    });
    setRect(whyText, {
      top: -1120,
      left: 300,
      width: 520,
      height: 80
    });
    setRect(code, {
      top: 90,
      left: 280,
      width: 700,
      height: 520
    });
    setRect(codeHeading, {
      top: 110,
      left: 300,
      width: 260,
      height: 42
    });
    setRect(codeText, {
      top: 165,
      left: 300,
      width: 580,
      height: 50
    });
    setRect(codeBlock, {
      top: 235,
      left: 300,
      width: 620,
      height: 260
    });

    const controller = new PageControllerWeb(document);
    const snapshot = controller.buildScreenSnapshot('/dashboard/docs', ['/dashboard/docs']);
    const viewportBlock = snapshot.elementsText.split('Interactive elements:')[0];
    assert.match(viewportBlock, /Visible viewport structure:/);
    assert.match(viewportBlock, /Code Examples/);
    assert.match(viewportBlock, /Production-ready snippets/);
    assert.doesNotMatch(viewportBlock, /Earlier documentation content/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb auto-discovers page routes from live anchors", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <nav aria-label="Product">
        <a href="/pricing">Pricing</a>
        <a href="/analytics/funnels">Where people drop off</a>
        <a href="mailto:support@example.com">Email support</a>
      </nav>
    </main>
  `, "https://example.com/app");
  try {
    const controller = new PageControllerWeb(dom.window.document);
    const snapshot = controller.buildScreenSnapshot('/app', []);
    const routesLine = snapshot.elementsText.split('\n').find(line => line.startsWith('Page routes:')) || '';
    assert.match(routesLine, /\/pricing \(Pricing\)/);
    assert.match(routesLine, /\/analytics\/funnels \(Where people drop off\)/);
    assert.doesNotMatch(routesLine, /mailto:/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb lists viewport interactive elements before offscreen elements", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <button id="old-button">Old offscreen action</button>
      <button id="visible-button">Visible action</button>
    </main>
  `);
  try {
    const {
      document
    } = dom.window;
    Object.defineProperty(dom.window, 'innerHeight', {
      configurable: true,
      value: 800
    });
    const oldButton = document.getElementById('old-button');
    const visibleButton = document.getElementById('visible-button');
    setRect(oldButton, {
      top: -900,
      left: 20,
      width: 180,
      height: 40
    });
    setRect(visibleButton, {
      top: 120,
      left: 20,
      width: 180,
      height: 40
    });
    document.elementFromPoint = (_x, y) => y >= 100 && y <= 180 ? visibleButton : null;
    const controller = new PageControllerWeb(document);
    const snapshot = controller.buildScreenSnapshot('/dashboard/docs', ['/dashboard/docs']);
    const visibleLine = snapshot.elementsText.indexOf('Visible action');
    const oldLine = snapshot.elementsText.indexOf('Old offscreen action');
    assert.ok(visibleLine > -1, 'Expected visible action in snapshot');
    assert.ok(oldLine > -1, 'Expected offscreen action in snapshot');
    assert.ok(visibleLine < oldLine, 'Expected visible action before offscreen action');
  } finally {
    cleanup();
  }
});

test("WebPlatformAdapter resolves navigation targets from live anchor labels", async () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <nav>
        <a href="/settings/profile">Account settings</a>
        <a href="/analytics/funnels">Where people drop off</a>
      </nav>
    </main>
  `, "https://example.com/app");
  try {
    const {
      document
    } = dom.window;
    let pushedHref = null;
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      router: {
        push: href => {
          pushedHref = href;
        }
      },
      getCurrentScreenName: () => '/app',
      getAvailableScreens: () => []
    });
    const result = await adapter.executeAction({
      type: 'navigate',
      screen: 'Where people drop off'
    });
    assert.equal(pushedHref, '/analytics/funnels');
    assert.match(result, /Navigated to "\/analytics\/funnels" for "Where people drop off"/);
  } finally {
    cleanup();
  }
});

test("WebPlatformAdapter prefers live anchors over router fallback guesses", async () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <nav>
        <a href="/dashboard/analytics/funnels">Where people drop off</a>
      </nav>
    </main>
  `, "https://example.com/dashboard");
  try {
    const {
      document
    } = dom.window;
    let pushedHref = null;
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      router: {
        resolveHref: screen => `/${String(screen).toLowerCase().replace(/\s+/g, '-')}`,
        push: href => {
          pushedHref = href;
        }
      },
      getCurrentScreenName: () => '/dashboard',
      getAvailableScreens: () => []
    });
    const result = await adapter.executeAction({
      type: 'navigate',
      screen: 'Where people drop off'
    });
    assert.equal(pushedHref, '/dashboard/analytics/funnels');
    assert.match(result, /Navigated to "\/dashboard\/analytics\/funnels" for "Where people drop off"/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb attaches nearby text and filters covered interactive elements", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <section class="surface-card">
        <h2 class="surface-card__title">Filters</h2>
        <div>
          <p>Choose outcome filter</p>
          <label for="outcome-filter">Outcome</label>
          <select id="outcome-filter" name="outcome-filter">
            <option value="">All outcomes</option>
            <option value="true">Successful</option>
          </select>
        </div>
        <button id="covered-button">Covered action</button>
        <div id="overlay"></div>
      </section>
    </main>
  `);
  try {
    const {
      document
    } = dom.window;
    const select = document.getElementById('outcome-filter');
    const coveredButton = document.getElementById('covered-button');
    const overlay = document.getElementById('overlay');
    setRect(select, {
      top: 10,
      left: 10,
      width: 180,
      height: 36
    });
    setRect(coveredButton, {
      top: 70,
      left: 10,
      width: 180,
      height: 36
    });
    setRect(overlay, {
      top: 70,
      left: 10,
      width: 180,
      height: 36
    });
    document.elementFromPoint = (_x, y) => y < 60 ? select : overlay;
    const controller = new PageControllerWeb(document);
    const snapshot = controller.buildScreenSnapshot('/dashboard/agent/traces', ['/dashboard/agent/traces']);
    assert.match(snapshot.elementsText, /\[0\]<picker>Outcome/);
    assert.match(snapshot.elementsText, /nearby="Outcome \| Filters \| Choose outcome filter"/);
    assert.doesNotMatch(snapshot.elementsText, /Covered action/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb does not let ignored MobileAI overlays hide underlying page controls", () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <section class="surface-card">
        <h2 class="surface-card__title">Human response</h2>
        <p>Reply to the customer from this panel.</p>
        <textarea id="reply-draft" placeholder="Reply as a human operator..."></textarea>
        <button id="send-reply">Send reply</button>
        <div id="mobileai-overlay" data-mobileai-ignore="true"></div>
      </section>
    </main>
  `);
  try {
    const {
      document
    } = dom.window;
    const replyDraft = document.getElementById('reply-draft');
    const sendReply = document.getElementById('send-reply');
    const overlay = document.getElementById('mobileai-overlay');
    setRect(replyDraft, {
      top: 10,
      left: 10,
      width: 220,
      height: 80
    });
    setRect(sendReply, {
      top: 100,
      left: 10,
      width: 180,
      height: 36
    });
    setRect(overlay, {
      top: 100,
      left: 10,
      width: 180,
      height: 36
    });
    document.elementFromPoint = (_x, y) => y < 90 ? replyDraft : overlay;
    const controller = new PageControllerWeb(document);
    const snapshot = controller.buildScreenSnapshot('/dashboard/omnichannel', ['/dashboard/omnichannel']);
    assert.match(snapshot.elementsText, /\[0\]<text-input>Reply as a human operator\.\.\./);
    assert.match(snapshot.elementsText, /Human response/);
    assert.match(snapshot.elementsText, /Send reply/);
  } finally {
    cleanup();
  }
});

test("PageControllerWeb traverses shadow roots and same-origin iframes", () => {
  const {
    dom,
    cleanup
  } = createDom(`<main><div id="shadow-host"></div><iframe id="same-origin-frame" title="Embedded support frame"></iframe></main>`);
  try {
    const {
      document
    } = dom.window;
    const host = document.getElementById('shadow-host');
    const shadowRoot = host.attachShadow({
      mode: 'open'
    });
    shadowRoot.innerHTML = `<button id="shadow-button">Open support panel</button>`;
    const shadowButton = shadowRoot.getElementById('shadow-button');
    setRect(host, {
      top: 10,
      left: 10,
      width: 200,
      height: 60
    });
    setRect(shadowButton, {
      top: 12,
      left: 12,
      width: 180,
      height: 36
    });
    const iframe = document.getElementById('same-origin-frame');
    setRect(iframe, {
      top: 100,
      left: 10,
      width: 300,
      height: 120
    });
    const iframeDoc = iframe.contentDocument;
    const restoreIframePatch = patchWindowForTests(iframe.contentWindow);
    iframeDoc.body.innerHTML = `<button id="frame-button">Resolve in frame</button>`;
    const frameButton = iframeDoc.getElementById('frame-button');
    setRect(frameButton, {
      top: 10,
      left: 10,
      width: 180,
      height: 36
    });
    document.elementFromPoint = (_x, y) => y < 80 ? host : iframe;
    iframeDoc.elementFromPoint = () => frameButton;
    const controller = new PageControllerWeb(document);
    const snapshot = controller.buildScreenSnapshot('/dashboard/support', ['/dashboard/support']);
    assert.match(snapshot.elementsText, /Open support panel/);
    assert.match(snapshot.elementsText, /Embedded frame: Embedded support frame/);
    assert.match(snapshot.elementsText, /Resolve in frame/);
    restoreIframePatch();
  } finally {
    cleanup();
  }
});

test("WebPlatformAdapter executes tap, type, select, and container scroll actions", async () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <button id="save-button">Save settings</button>
      <input id="name-field" placeholder="Project name" />
      <select id="route-picker" name="route-picker">
        <option value="">Choose a route</option>
        <option value="/legal">Legal</option>
      </select>
      <div id="scroll-area" style="overflow:auto;height:120px">
        <div style="height:1000px">Very tall content</div>
      </div>
    </main>
  `);
  try {
    const {
      document
    } = dom.window;
    const button = document.getElementById('save-button');
    const input = document.getElementById('name-field');
    const select = document.getElementById('route-picker');
    const scrollArea = document.getElementById('scroll-area');
    setRect(button, {
      top: 10,
      left: 10,
      width: 180,
      height: 36
    });
    setRect(input, {
      top: 60,
      left: 10,
      width: 220,
      height: 36
    });
    setRect(select, {
      top: 110,
      left: 10,
      width: 220,
      height: 36
    });
    setRect(scrollArea, {
      top: 170,
      left: 10,
      width: 260,
      height: 120
    });
    let clickCount = 0;
    const inputEvents = [];
    const selectEvents = [];
    let scrolledBy = null;
    button.addEventListener('click', () => {
      clickCount += 1;
    });
    input.addEventListener('input', () => inputEvents.push('input'));
    input.addEventListener('change', () => inputEvents.push('change'));
    select.addEventListener('change', () => selectEvents.push(select.value));
    document.elementFromPoint = (_x, y) => {
      if (y < 50) return button;
      if (y < 100) return input;
      if (y < 160) return select;
      return scrollArea;
    };
    const originalGetComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    dom.window.getComputedStyle = element => {
      const style = originalGetComputedStyle(element);
      if (element === scrollArea) {
        return {
          ...style,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'block',
          visibility: 'visible',
          opacity: '1'
        };
      }
      return style;
    };
    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      value: 1400
    });
    Object.defineProperty(scrollArea, 'clientHeight', {
      configurable: true,
      value: 120
    });
    scrollArea.scrollBy = options => {
      scrolledBy = options.top;
      scrollArea.scrollTop += options.top;
    };
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      getCurrentScreenName: () => '/dashboard/settings',
      getAvailableScreens: () => ['/dashboard/settings']
    });
    const snapshot = adapter.getScreenSnapshot();
    const byLabel = label => {
      const entry = snapshot.elements.find(element => element.label === label);
      assert.ok(entry, `Expected interactive with label "${label}"`);
      return entry.index;
    };
    const scrollable = snapshot.elements.find(element => element.type === 'scrollable');
    assert.ok(scrollable, 'Expected scrollable area to be indexed');
    assert.equal(scrollable.props.scrollable, true);
    assert.ok(scrollable.props.scrollData.down > 0);
    const tapResult = await adapter.executeAction({
      type: 'tap',
      index: byLabel('Save settings')
    });
    const typeResult = await adapter.executeAction({
      type: 'type',
      index: byLabel('Project name'),
      text: 'Feedyum'
    });
    const selectResult = await adapter.executeAction({
      type: 'select_picker',
      index: byLabel('route-picker'),
      value: '/legal'
    });
    const scrollResult = await adapter.executeAction({
      type: 'scroll',
      direction: 'down',
      containerIndex: scrollable.index
    });
    assert.equal(clickCount, 1);
    assert.equal(input.value, 'Feedyum');
    assert.deepEqual(inputEvents, ['input', 'change']);
    assert.equal(select.value, '/legal');
    assert.deepEqual(selectEvents, ['/legal']);
    assert.equal(typeof scrolledBy, 'number');
    assert.match(tapResult, /Tapped/);
    assert.match(typeResult, /Typed "Feedyum"/);
    assert.match(selectResult, /Selected "\/legal"/);
    assert.match(scrollResult, /Scrolled div#scroll-area by/);
  } finally {
    cleanup();
  }
});

test("WebPlatformAdapter reports when a scroll action does not move", async () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <div id="scroll-area" style="overflow:auto;height:120px">
        <button id="deep-button">Deep action</button>
      </div>
    </main>
  `);
  try {
    const {
      document
    } = dom.window;
    const scrollArea = document.getElementById('scroll-area');
    const button = document.getElementById('deep-button');
    setRect(scrollArea, {
      top: 10,
      left: 10,
      width: 260,
      height: 120
    });
    setRect(button, {
      top: 20,
      left: 20,
      width: 140,
      height: 36
    });
    document.elementFromPoint = () => button;
    const originalGetComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    dom.window.getComputedStyle = element => {
      const style = originalGetComputedStyle(element);
      if (element === scrollArea) {
        return {
          ...style,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'block',
          visibility: 'visible',
          opacity: '1'
        };
      }
      return style;
    };
    Object.defineProperty(scrollArea, 'scrollHeight', {
      configurable: true,
      value: 1200
    });
    Object.defineProperty(scrollArea, 'clientHeight', {
      configurable: true,
      value: 120
    });
    scrollArea.scrollTop = 1080;
    scrollArea.scrollBy = () => {};
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      getCurrentScreenName: () => '/dashboard/docs',
      getAvailableScreens: () => ['/dashboard/docs']
    });
    const snapshot = adapter.getScreenSnapshot();
    const scrollable = snapshot.elements.find(element => element.type === 'scrollable');
    assert.ok(scrollable, 'Expected scrollable area to be indexed');
    const scrollResult = await adapter.executeAction({
      type: 'scroll',
      direction: 'down',
      containerIndex: scrollable.index
    });
    assert.match(scrollResult, /Already at the bottom/);
  } finally {
    cleanup();
  }
});

test("WebPlatformAdapter can act on same-origin iframe elements", async () => {
  const {
    dom,
    cleanup
  } = createDom(`<main><iframe id="action-frame" title="Action frame"></iframe></main>`);
  try {
    const {
      document
    } = dom.window;
    const iframe = document.getElementById('action-frame');
    setRect(iframe, {
      top: 20,
      left: 20,
      width: 320,
      height: 180
    });
    const iframeDoc = iframe.contentDocument;
    const restoreIframePatch = patchWindowForTests(iframe.contentWindow);
    iframeDoc.body.innerHTML = `<button id="frame-action">Apply inside iframe</button>`;
    const frameButton = iframeDoc.getElementById('frame-action');
    setRect(frameButton, {
      top: 12,
      left: 12,
      width: 180,
      height: 36
    });
    let clickCount = 0;
    frameButton.addEventListener('click', () => {
      clickCount += 1;
    });
    document.elementFromPoint = () => iframe;
    iframeDoc.elementFromPoint = () => frameButton;
    const adapter = new WebPlatformAdapter({
      getRoot: () => document,
      getCurrentScreenName: () => '/dashboard/embed',
      getAvailableScreens: () => ['/dashboard/embed']
    });
    const snapshot = adapter.getScreenSnapshot();
    const buttonEntry = snapshot.elements.find(element => element.label === 'Apply inside iframe');
    assert.ok(buttonEntry, 'Expected iframe button to be indexed');
    const result = await adapter.executeAction({
      type: 'tap',
      index: buttonEntry.index
    });
    assert.equal(clickCount, 1);
    assert.match(result, /Tapped/);
    restoreIframePatch();
  } finally {
    cleanup();
  }
});
