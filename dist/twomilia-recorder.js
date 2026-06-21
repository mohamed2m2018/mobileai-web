/*
 * Twomilia standalone screen-map recorder (bookmarklet edition).
 *
 * Loaded by a bookmarklet into ANY page — no Twomilia SDK install required.
 * Captures screens + navigation edges as the user browses their own (logged-in)
 * site and streams them to the dashboard's public ingest endpoint. Reads its
 * config from the injecting <script> tag's data-* attributes:
 *    data-endpoint  -> absolute URL of POST /api/v1/screenmap-ingest
 *    data-key       -> project analyticsKey (public)
 *
 * SPA navigations (pushState) are captured in one click. Full-page (MPA) reloads
 * drop the script, so accumulated state is kept in sessionStorage and restored
 * if the user clicks the bookmarklet again on the next page; everything captured
 * is already streamed server-side regardless.
 */
(function () {
  "use strict";
  if (window.__twmRecorderActive) return;
  window.__twmRecorderActive = true;

  var me = document.currentScript;
  var ENDPOINT = (me && me.dataset.endpoint) || "";
  var KEY = (me && me.dataset.key) || "";
  if (!ENDPOINT || !KEY) {
    window.__twmRecorderActive = false;
    return;
  }

  var STATE_KEY = "twm_bm_state";
  var PENDING_KEY = "twm_bm_pending";

  var screens = {};
  var edges = [];
  var interactions = [];
  var lastScreen = null;
  var lastClick = null;
  var postTimer = null;

  // --- shared capture helpers (vanilla JS, no deps) ---
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return '';
    try {
      if (el.id) return '#' + CSS.escape(el.id);
      var attrs = ['data-testid','data-test','data-cy','data-id','name','aria-label'];
      for (var i = 0; i < attrs.length; i++) {
        var v = el.getAttribute && el.getAttribute(attrs[i]);
        if (v) return el.tagName.toLowerCase() + '[' + attrs[i] + '="' + ('' + v).slice(0, 40).replace(/"/g, '') + '"]';
      }
      var parts = [], node = el, depth = 0;
      while (node && node.nodeType === 1 && depth < 3) {
        var part = node.tagName.toLowerCase();
        if (node.classList && node.classList.length) {
          part += '.' + Array.prototype.slice.call(node.classList, 0, 2).map(function (c) { return CSS.escape(c); }).join('.');
        }
        var parent = node.parentElement;
        if (parent) {
          var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
          if (sibs.length > 1) part += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
        }
        parts.unshift(part); node = parent; depth++;
      }
      return parts.join(' > ');
    } catch (e) { return ''; }
  }
  function snapState() {
    try {
      return { href: location.href, len: (document.body ? (document.body.innerText || '').length : 0),
        dialog: !!document.querySelector('[role="dialog"],dialog[open],.modal:not([hidden])'),
        kids: document.querySelectorAll('*').length };
    } catch (e) { return { href: location.href, len: 0, dialog: false, kids: 0 }; }
  }
  function diffEffect(b, a) {
    if (!b || !a) return '';
    if (!b.dialog && a.dialog) return 'opened a dialog/menu';
    var dk = a.kids - b.kids, dt = a.len - b.len;
    if (dk > 15 || dt > 150) return 'revealed more content on the page';
    if (dk < -15 || dt < -150) return 'hid or closed content';
    return '';
  }

  function normalizeScreenName(name) {
    if (typeof name !== "string" || !name) return name || "/";
    if (name.indexOf("/") === -1) return name;
    var path = name.split(/[?#]/)[0];
    var norm = path
      .split("/")
      .map(function (seg) {
        if (!seg) return seg;
        if (/^\d+$/.test(seg)) return ":id";
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
        if (/^[0-9a-f]{16,}$/i.test(seg)) return ":id";
        if (/\d/.test(seg) && /[a-z]/i.test(seg) && seg.length >= 12) return ":id";
        return seg;
      })
      .join("/");
    return norm || "/";
  }

  function currentName() {
    return normalizeScreenName(location.pathname || "/");
  }

  function labelFor(el) {
    if (!el) return "";
    var t = el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || el.value || "";
    return String(t).replace(/\s+/g, " ").trim().slice(0, 120);
  }

  function captureScreen(name) {
    if (!name) return;
    var title = document.title || "";
    var h1 = document.querySelector("h1");
    var desc = (h1 && h1.textContent ? h1.textContent : title || name).replace(/\s+/g, " ").trim();
    var route = (location.pathname || "") + (location.search || "");
    var prev = screens[name] || {};
    screens[name] = {
      description: (desc || prev.description || name).slice(0, 500),
      title: (title || prev.title || "").slice(0, 120) || undefined,
      route: (route || prev.route || "").slice(0, 120) || undefined,
    };
  }

  function recordEdge(from, to, trigger, selector) {
    if (!from || !to || from === to) return;
    var ex = edges.find(function (e) { return e.from === from && e.to === to; });
    if (ex) {
      ex.count = (ex.count || 1) + 1;
      if (!ex.trigger && trigger) ex.trigger = trigger;
      if (!ex.selector && selector) ex.selector = selector;
    } else {
      edges.push({ from: from, to: to, trigger: trigger || undefined, selector: selector || undefined, count: 1 });
    }
  }

  function recordInteraction(screen, clickInfo, effect) {
    if (!screen || !clickInfo || !effect) return;
    var keySel = clickInfo.selector || clickInfo.label;
    var ex = interactions.find(function (it) {
      return it.screen === screen && (it.selector || it.label) === keySel;
    });
    if (ex) {
      ex.count = (ex.count || 1) + 1;
    } else {
      interactions.push({
        screen: screen,
        label: clickInfo.label || undefined,
        selector: clickInfo.selector || undefined,
        effect: effect,
        count: 1,
      });
    }
    update();
  }

  function getMap() {
    return { screens: screens, edges: edges, interactions: interactions };
  }

  function persist() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(getMap()));
    } catch (e) {}
  }

  function restore() {
    try {
      var s = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
      if (s && s.screens) { screens = s.screens; edges = s.edges || []; interactions = s.interactions || []; }
      var p = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      if (p && p.from) { lastScreen = p.from; lastClick = p.trigger ? { label: p.trigger } : null; }
      sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {}
  }

  function postNow() {
    var body = JSON.stringify({ analyticsKey: KEY, map: getMap() });
    try {
      fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  function schedulePost() {
    if (postTimer) clearTimeout(postTimer);
    postTimer = setTimeout(postNow, 1200);
  }

  function onChange() {
    var to = currentName();
    if (to && to !== lastScreen) {
      recordEdge(lastScreen, to, lastClick && lastClick.label, lastClick && lastClick.selector);
      captureScreen(to);
      lastScreen = to;
      lastClick = null;
      update();
    }
  }

  // ── banner ──
  var banner, countEl;
  function showBanner() {
    banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:12px 18px;background:#0f172a;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);border-bottom:3px solid #ef4444";
    banner.innerHTML =
      '<span style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;white-space:nowrap"><span style="width:11px;height:11px;border-radius:50%;background:#ef4444;animation:twmpulse 1s infinite"></span>Recording your site</span>' +
      '<span style="font-size:13px;line-height:1.35;opacity:.92">Browse normally — open every page, menu, product, finish checkout. We map each screen automatically.</span>' +
      '<span data-c style="margin-left:auto;font-size:12px;font-weight:600;white-space:nowrap;opacity:.85">0 screens · 0 links</span>' +
      '<button data-f style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;background:#22c55e;color:#06210f;font:700 13px system-ui;white-space:nowrap">✓ Finish</button>' +
      "<style>@keyframes twmpulse{50%{opacity:.25}}</style>";
    document.body.appendChild(banner);
    document.body.style.marginTop = banner.offsetHeight + "px";
    countEl = banner.querySelector("[data-c]");
    banner.querySelector("[data-f]").addEventListener("click", finish);
  }

  function updateBanner() {
    if (!countEl) return;
    var s = Object.keys(screens).length, e = edges.length;
    countEl.textContent = s + " screen" + (s === 1 ? "" : "s") + " · " + e + " link" + (e === 1 ? "" : "s");
  }

  function update() {
    updateBanner();
    persist();
    schedulePost();
  }

  function finish() {
    postNow();
    try { sessionStorage.removeItem(STATE_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    document.body.style.marginTop = "";
    window.__twmRecorderActive = false;
    teardown();
    alert("Recording finished and sent to your dashboard. You can close this and review/publish the map there.");
  }

  // ── listeners ──
  var origPush = history.pushState, origReplace = history.replaceState;
  function fire() { window.dispatchEvent(new Event("twm:loc")); }
  function onClick(ev) {
    var el = ev.target && ev.target.closest && ev.target.closest('a,[role="link"],button,[role="button"],[onclick]');
    if (el) {
      lastClick = { label: labelFor(el), selector: selectorFor(el) };
      var before = snapState();
      var clickInfo = lastClick;
      var screenAtClick = currentName();
      setTimeout(function () {
        if (currentName() !== screenAtClick) return;        // navigated -> the edge path already recorded it
        var eff = diffEffect(before, snapState());
        if (eff) recordInteraction(screenAtClick, clickInfo, eff);
      }, 600);
    }
  }
  function onLoc() { setTimeout(onChange, 400); }
  function onUnload() {
    persist();
    if (lastScreen) {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ from: lastScreen, trigger: (lastClick && lastClick.label) || "" })); } catch (e) {}
    }
  }
  function teardown() {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("twm:loc", onLoc);
    window.removeEventListener("popstate", onLoc);
    window.removeEventListener("hashchange", onLoc);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("beforeunload", onUnload);
  }

  // ── start ──
  restore();
  var name = currentName();
  if (lastScreen && name && name !== lastScreen) recordEdge(lastScreen, name, lastClick && lastClick.label, lastClick && lastClick.selector);
  captureScreen(name);
  lastScreen = name;
  lastClick = null;

  history.pushState = function () { var r = origPush.apply(history, arguments); fire(); return r; };
  history.replaceState = function () { var r = origReplace.apply(history, arguments); fire(); return r; };
  window.addEventListener("twm:loc", onLoc);
  window.addEventListener("popstate", onLoc);
  window.addEventListener("hashchange", onLoc);
  document.addEventListener("click", onClick, true);
  window.addEventListener("beforeunload", onUnload);

  showBanner();
  update();
})();
