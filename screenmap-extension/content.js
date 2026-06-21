/*
 * Twomilia recorder content script. Runs on EVERY page (manifest <all_urls>) but
 * stays dormant unless recording is toggled on from the popup. Because it is a
 * content script, it re-injects automatically on every page load — so it survives
 * full-page (multi-page) navigations, unlike a bookmarklet. State is kept in
 * chrome.storage.local so the map accumulates across pages and tabs.
 */
(function () {
  "use strict";
  if (window.__twmExtActive) return;
  window.__twmExtActive = true;

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

  var KEYS = ["twm_recording", "twm_endpoint", "twm_key", "twm_map", "twm_last", "twm_click", "twm_origin"];

  var endpoint = "";
  var key = "";
  var screens = {};
  var edges = [];
  var interactions = [];
  var lastScreen = null;
  var lastClick = null;
  var running = false;
  var postTimer = null;
  var banner = null;
  var countEl = null;

  function normalizeScreenName(name) {
    if (typeof name !== "string" || !name) return name || "/";
    if (name.indexOf("/") === -1) return name;
    var path = name.split(/[?#]/)[0];
    return (
      path
        .split("/")
        .map(function (seg) {
          if (!seg) return seg;
          if (/^\d+$/.test(seg)) return ":id";
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
          if (/^[0-9a-f]{16,}$/i.test(seg)) return ":id";
          if (/\d/.test(seg) && /[a-z]/i.test(seg) && seg.length >= 12) return ":id";
          return seg;
        })
        .join("/") || "/"
    );
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
      edges.push({ from: from, to: to, count: 1, trigger: trigger || undefined, selector: selector || undefined });
    }
  }

  // step 4: in-page interaction (click that changes UI without navigating)
  function recordInteraction(screen, clickInfo, effect) {
    if (!running || !screen || !clickInfo || !effect) return;
    var key2 = clickInfo.selector || clickInfo.label;
    var ex = interactions.find(function (it) {
      return it.screen === screen && (it.selector || it.label) === key2;
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

  function getMap() { return { screens: screens, edges: edges, interactions: interactions }; }

  function save() {
    try {
      chrome.storage.local.set({ twm_map: getMap(), twm_last: lastScreen, twm_click: lastClick });
    } catch (e) {}
  }

  function postNow() {
    try {
      chrome.runtime.sendMessage({ type: "TWM_POST", endpoint: endpoint, key: key, map: getMap() });
    } catch (e) {}
  }

  function schedulePost() {
    if (postTimer) clearTimeout(postTimer);
    postTimer = setTimeout(postNow, 1000);
  }

  function update() {
    if (countEl) {
      var s = Object.keys(screens).length, e = edges.length;
      countEl.textContent = s + " screen" + (s === 1 ? "" : "s") + " · " + e + " link" + (e === 1 ? "" : "s");
    }
    save();
    schedulePost();
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
  function showBanner() {
    if (banner) return;
    banner = document.createElement("div");
    banner.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483647;box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:12px 18px;background:#0f172a;color:#fff;font-family:system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.35);border-bottom:3px solid #ef4444";
    banner.innerHTML =
      '<span style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;white-space:nowrap"><span style="width:11px;height:11px;border-radius:50%;background:#ef4444;animation:twmpulse 1s infinite"></span>Recording your site</span>' +
      '<span style="font-size:13px;line-height:1.35;opacity:.92">Browse normally across all your pages — we map every screen + link. Navigation is fully tracked.</span>' +
      '<span data-c style="margin-left:auto;font-size:12px;font-weight:600;white-space:nowrap;opacity:.85">0 screens · 0 links</span>' +
      '<button data-f style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;background:#22c55e;color:#06210f;font:700 13px system-ui;white-space:nowrap">✓ Finish</button>' +
      "<style>@keyframes twmpulse{50%{opacity:.25}}</style>";
    (document.body || document.documentElement).appendChild(banner);
    try { document.body.style.marginTop = banner.offsetHeight + "px"; } catch (e) {}
    countEl = banner.querySelector("[data-c]");
    banner.querySelector("[data-f]").addEventListener("click", finish);
  }

  function hideBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    try { document.body.style.marginTop = ""; } catch (e) {}
    banner = null;
    countEl = null;
  }

  function finish() {
    postNow();
    running = false;
    try { chrome.storage.local.set({ twm_recording: false }); } catch (e) {}
    teardown();
    hideBanner();
    alert("Recording finished and sent to your dashboard. Review and publish the map there.");
  }

  // ── listeners ──
  var origPush = history.pushState, origReplace = history.replaceState, patched = false;
  function fire() { window.dispatchEvent(new Event("twm:loc")); }
  function onClick(ev) {
    var el = ev.target && ev.target.closest && ev.target.closest('a,[role="link"],button,[role="button"],[onclick]');
    if (el) {
      lastClick = { label: labelFor(el), selector: selectorFor(el) };
      save();
      var before = snapState();
      var clickInfo = lastClick;
      var screenAtClick = currentName();
      setTimeout(function () {
        if (currentName() !== screenAtClick) return; // navigated -> the edge path already recorded it
        var eff = diffEffect(before, snapState());
        if (eff) recordInteraction(screenAtClick, clickInfo, eff);
      }, 600);
    }
  }
  function onLoc() { setTimeout(onChange, 400); }

  function setup() {
    if (patched) return;
    patched = true;
    history.pushState = function () { var r = origPush.apply(history, arguments); fire(); return r; };
    history.replaceState = function () { var r = origReplace.apply(history, arguments); fire(); return r; };
    window.addEventListener("twm:loc", onLoc);
    window.addEventListener("popstate", onLoc);
    window.addEventListener("hashchange", onLoc);
    document.addEventListener("click", onClick, true);
  }
  function teardown() {
    if (!patched) return;
    patched = false;
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener("twm:loc", onLoc);
    window.removeEventListener("popstate", onLoc);
    window.removeEventListener("hashchange", onLoc);
    document.removeEventListener("click", onClick, true);
  }

  function start(st) {
    if (running) return;
    // Origin lock: only the site where the user clicked Start records. Without
    // this, the global twm_recording flag (broadcast via storage.onChanged + the
    // resume-on-load below) would make EVERY open tab record — so unrelated tabs
    // (YouTube, Gemini, …) leaked in as screens.
    if (st.twm_origin && location.origin !== st.twm_origin) return;
    endpoint = st.twm_endpoint || endpoint;
    key = st.twm_key || key;
    if (!endpoint || !key) return;
    screens = (st.twm_map && st.twm_map.screens) || {};
    edges = (st.twm_map && st.twm_map.edges) || [];
    interactions = (st.twm_map && st.twm_map.interactions) || [];
    lastScreen = st.twm_last || null;
    lastClick = st.twm_click || null;
    running = true;

    var name = currentName();
    if (lastScreen && name && name !== lastScreen) recordEdge(lastScreen, name, lastClick && lastClick.label, lastClick && lastClick.selector);
    captureScreen(name);
    lastScreen = name;
    lastClick = null;

    setup();
    showBanner();
    update();
  }

  function stop() {
    running = false;
    teardown();
    hideBanner();
  }

  // One-click connect: the dashboard posts its ingest URL + project key to the
  // page; we (a content script on the dashboard tab) catch it and save the config
  // — so the user never copy-pastes anything into the extension.
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (d && d.source === "twomilia-connect" && d.endpoint && d.key) {
      try {
        chrome.storage.local.set({ twm_endpoint: d.endpoint, twm_key: d.key });
        window.postMessage({ source: "twomilia-connect-ack" }, "*");
      } catch (e) {}
    }
  });

  // React to popup toggles + storage changes (e.g. Finish in another tab).
  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg) return;
    if (msg.type === "TWM_START") chrome.storage.local.get(KEYS, start);
    else if (msg.type === "TWM_STOP") stop();
  });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.twm_recording) return;
    if (changes.twm_recording.newValue) chrome.storage.local.get(KEYS, start);
    else stop();
  });

  // On every page load, resume if a recording is in progress.
  chrome.storage.local.get(KEYS, function (st) {
    if (st.twm_recording) start(st);
  });
})();
