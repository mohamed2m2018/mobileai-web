import { JSDOM } from "jsdom";
import { PageControllerWeb } from "../module/web/core/PageControllerWeb.js";
import { WebPlatformAdapter } from "../module/web/core/WebPlatformAdapter.js";

const DEFAULT_URLS = [
  "https://react.dev/",
  "https://nextjs.org/docs",
  "https://tailwindcss.com/docs/installation",
  "https://github.com/features/actions",
  "https://vercel.com/",
  "https://linear.app/",
  "https://stripe.com/",
  "https://shopify.com/",
  "https://www.wikipedia.org/",
  "https://developer.mozilla.org/en-US/docs/Web/API",
  "https://news.ycombinator.com/",
  "https://www.bbc.com/news",
  "https://www.airbnb.com/"
];

const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS;

function patchWindow(window) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1440
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 900
  });
  const originalRect = window.HTMLElement.prototype.getBoundingClientRect;
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: 240,
      height: 40,
      top: 10,
      left: 10,
      right: 250,
      bottom: 50
    };
  };
  if (!window.HTMLElement.prototype.scrollIntoView) {
    window.HTMLElement.prototype.scrollIntoView = () => {};
  }
  return () => {
    window.HTMLElement.prototype.getBoundingClientRect = originalRect;
  };
}

function normalizeHref(rawHref, baseUrl) {
  if (!rawHref || /^(javascript|mailto|tel):/i.test(rawHref)) return null;
  try {
    const url = new URL(rawHref, baseUrl);
    const base = new URL(baseUrl);
    if (url.origin !== base.origin) return url.href;
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return rawHref.startsWith("/") || rawHref.startsWith("#") ? rawHref : null;
  }
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chooseNavigationSamples(document, baseUrl) {
  const seen = new Set();
  return Array.from(document.querySelectorAll("a[href]"))
    .map(anchor => ({
      label: cleanText(anchor.getAttribute("aria-label") || anchor.getAttribute("title") || anchor.textContent),
      href: normalizeHref(anchor.getAttribute("href") || "", baseUrl)
    }))
    .filter(item => item.href && item.label && item.label.length >= 3 && item.label.length <= 80)
    .filter(item => {
      const key = `${item.label}|${item.href}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

async function resolveNavigation(document, pageUrl, label) {
  let pushedHref = null;
  const adapter = new WebPlatformAdapter({
    getRoot: () => document,
    router: {
      resolveHref: screen => `/${String(screen).toLowerCase().replace(/\s+/g, "-")}`,
      push: href => {
        pushedHref = href;
      }
    },
    getCurrentScreenName: () => new URL(pageUrl).pathname || "/",
    getAvailableScreens: () => []
  });
  await adapter.executeAction({
    type: "navigate",
    screen: label
  });
  return pushedHref;
}

async function runOne(url) {
  const started = Date.now();
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 MobileAI route discovery smoke test",
      accept: "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(15000)
  });
  const html = await response.text();
  if (!response.ok) {
    return {
      url,
      status: response.status,
      blocked: true,
      expected: "reachable HTML page",
      actual: `HTTP ${response.status}`
    };
  }

  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true
  });
  const cleanup = patchWindow(dom.window);
  try {
    const controller = new PageControllerWeb(dom.window.document);
    const snapshot = controller.buildScreenSnapshot(new URL(url).pathname || "/", []);
    const routesLine = snapshot.elementsText.split("\n").find(line => line.startsWith("Page routes:")) || "";
    const routeCount = routesLine ? routesLine.replace(/^Page routes:\s*/, "").split(", ").filter(Boolean).length : 0;
    const samples = chooseNavigationSamples(dom.window.document, url);
    const checks = [];

    for (const sample of samples) {
      const actual = await resolveNavigation(dom.window.document, url, sample.label);
      checks.push({
        label: sample.label,
        expected: sample.href,
        actual,
        ok: actual === sample.href
      });
    }

    return {
      url,
      status: response.status,
      expected: "at least one discovered route and all sampled labels resolve to observed hrefs",
      actual: `${routeCount} routes, ${checks.filter(check => check.ok).length}/${checks.length} labels resolved`,
      routeCount,
      checkedLabels: checks.length,
      ok: routeCount > 0 && checks.every(check => check.ok),
      failedChecks: checks.filter(check => !check.ok),
      ms: Date.now() - started
    };
  } finally {
    cleanup();
    dom.window.close();
  }
}

const results = [];
for (const url of urls) {
  try {
    results.push(await runOne(url));
  } catch (error) {
    results.push({
      url,
      expected: "snapshot generation should not throw",
      actual: error?.message || String(error),
      error: true
    });
  }
}

const actionable = results.filter(result => !result.blocked);
const summary = {
  total: results.length,
  checked: actionable.length,
  blocked: results.filter(result => result.blocked).length,
  passed: actionable.filter(result => result.ok).length,
  failed: actionable.filter(result => result.error || result.ok === false).length
};

console.log(JSON.stringify({
  expectedForLibrary: [
    "Generate a useful Page routes line from ordinary website anchors.",
    "Normalize same-origin, relative, hash, query, and cross-origin hrefs.",
    "Resolve a human-visible link label to the exact observed href.",
    "Avoid crashing on real framework class names or markup.",
    "Report fetch blocking separately from SDK behavior."
  ],
  summary,
  results
}, null, 2));

if (summary.failed > 0 || summary.checked === 0) {
  process.exitCode = 1;
}
