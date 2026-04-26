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
      height: 44,
      top: 12,
      left: 12,
      right: 332,
      bottom: 56
    };
  };
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}

function installDomGlobals(window) {
  const previous = new Map();
  const keys = [
    "window",
    "document",
    "Document",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLSelectElement",
    "HTMLButtonElement",
    "HTMLAnchorElement",
    "HTMLIFrameElement",
    "ShadowRoot",
    "NodeFilter",
    "MouseEvent",
    "Event",
    "InputEvent",
    "PopStateEvent",
    "DOMRect"
  ];
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

function createDom(body, url = "https://app.example.com/dashboard") {
  const dom = new JSDOM(`<!doctype html><html><head><title>Fixture app</title></head><body>${body}</body></html>`, {
    url,
    pretendToBeVisual: true
  });
  const cleanup = installDomGlobals(dom.window);
  return {
    dom,
    cleanup
  };
}

function routesLineFor(document, screenName = "/dashboard") {
  const controller = new PageControllerWeb(document);
  const snapshot = controller.buildScreenSnapshot(screenName, []);
  return snapshot.elementsText.split("\n").find(line => line.startsWith("Page routes:")) || "";
}

async function resolveNavigation(document, label) {
  let pushedHref = null;
  const adapter = new WebPlatformAdapter({
    getRoot: () => document,
    router: {
      resolveHref: screen => `/${String(screen).toLowerCase().replace(/\s+/g, "-")}`,
      push: href => {
        pushedHref = href;
      }
    },
    getCurrentScreenName: () => "/dashboard",
    getAvailableScreens: () => []
  });
  await adapter.executeAction({
    type: "navigate",
    screen: label
  });
  return pushedHref;
}

const routeRequirements = [
  {
    name: "same-origin absolute route",
    html: `<a href="/pricing">Pricing</a>`,
    includes: ["/pricing (Pricing)"],
    navigate: ["Pricing", "/pricing"]
  },
  {
    name: "relative route with query string",
    html: `<a href="settings?tab=billing">Billing settings</a>`,
    includes: ["/settings?tab=billing (Billing settings)"],
    navigate: ["Billing settings", "/settings?tab=billing"]
  },
  {
    name: "same-page hash route",
    html: `<a href="#api-reference">API reference</a>`,
    includes: ["/dashboard#api-reference (API reference)"],
    navigate: ["API reference", "/dashboard#api-reference"]
  },
  {
    name: "cross-origin route",
    html: `<a href="https://docs.example.com/start">Read docs</a>`,
    includes: ["https://docs.example.com/start (Read docs)"],
    navigate: ["Read docs", "https://docs.example.com/start"]
  },
  {
    name: "aria-label route",
    html: `<a href="/cart" aria-label="Cart"></a>`,
    includes: ["/cart (Cart)"],
    navigate: ["Cart", "/cart"]
  },
  {
    name: "invalid route schemes are excluded",
    html: `
      <a href="javascript:void(0)">Open menu</a>
      <a href="mailto:support@example.com">Email support</a>
      <a href="tel:+15550123">Call support</a>
      <a href="/safe">Safe route</a>
    `,
    includes: ["/safe (Safe route)"],
    excludes: ["javascript:", "mailto:", "tel:"],
    navigate: ["Safe route", "/safe"]
  },
  {
    name: "ignored MobileAI overlay route is excluded",
    html: `
      <a data-mobileai-ignore="true" href="/overlay-action">Overlay action</a>
      <a href="/real-action">Real action</a>
    `,
    includes: ["/real-action (Real action)"],
    excludes: ["/overlay-action"],
    navigate: ["Real action", "/real-action"]
  },
  {
    name: "duplicate hrefs are listed once with first label",
    html: `
      <a href="/reports">Reports</a>
      <a href="/reports">Duplicate reports</a>
    `,
    includes: ["/reports (Reports)"],
    excludes: ["Duplicate reports"],
    navigate: ["Reports", "/reports"]
  }
];

test("route discovery matches generic website requirements", async () => {
  for (const requirement of routeRequirements) {
    const {
      dom,
      cleanup
    } = createDom(`<main>${requirement.html}</main>`);
    try {
      const routesLine = routesLineFor(dom.window.document);
      requirement.includes.forEach(expected => {
        assert.ok(routesLine.includes(expected), `${requirement.name}: expected route line to include ${expected}, got ${routesLine}`);
      });
      (requirement.excludes || []).forEach(unexpected => {
        assert.ok(!routesLine.includes(unexpected), `${requirement.name}: expected route line not to include ${unexpected}, got ${routesLine}`);
      });
      if (requirement.navigate) {
        const [label, expectedHref] = requirement.navigate;
        assert.equal(await resolveNavigation(dom.window.document, label), expectedHref, `${requirement.name}: expected navigation by label`);
      }
    } finally {
      cleanup();
    }
  }
});

test("route discovery covers modern embedding surfaces needed by real apps", async () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <section class=":pb-3>* [grid-area:items] hover:[&>*]:underline">
        <a href="/framework-route">Framework route</a>
      </section>
      <div id="shadow-host"></div>
      <iframe id="same-origin-frame" title="Embedded app"></iframe>
    </main>
  `);
  try {
    const {
      document
    } = dom.window;
    document.getElementById("shadow-host").attachShadow({
      mode: "open"
    }).innerHTML = `<a href="/shadow/settings">Shadow settings</a>`;
    const iframe = document.getElementById("same-origin-frame");
    const restoreIframePatch = patchWindowForTests(iframe.contentWindow);
    iframe.contentDocument.body.innerHTML = `<a href="/embedded/reports">Embedded reports</a>`;

    const routesLine = routesLineFor(document);
    const expectedRoutes = [
      "/framework-route (Framework route)",
      "/shadow/settings (Shadow settings)",
      "/embedded/reports (Embedded reports)"
    ];
    expectedRoutes.forEach(expected => {
      assert.ok(routesLine.includes(expected), `expected embedded route ${expected}, got ${routesLine}`);
    });
    assert.equal(await resolveNavigation(document, "Framework route"), "/framework-route");
    assert.equal(await resolveNavigation(document, "Shadow settings"), "/shadow/settings");
    assert.equal(await resolveNavigation(document, "Embedded reports"), "/embedded/reports");
    restoreIframePatch();
  } finally {
    cleanup();
  }
});

test("navigation resolution prefers observed website routes over guessed router fallbacks", async () => {
  const {
    dom,
    cleanup
  } = createDom(`
    <main>
      <a href="/analytics/funnels">Where people drop off</a>
      <a href="/settings/billing">Billing</a>
    </main>
  `);
  try {
    assert.equal(await resolveNavigation(dom.window.document, "Where people drop off"), "/analytics/funnels");
    assert.equal(await resolveNavigation(dom.window.document, "Billing"), "/settings/billing");
  } finally {
    cleanup();
  }
});
