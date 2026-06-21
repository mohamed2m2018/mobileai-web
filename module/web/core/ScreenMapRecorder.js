// ScreenMapRecorder — captures the site's screens + navigation edges while a
// client browses their own site inside the dashboard "Train" popup. It is a
// passive observer: it never changes the page. It only runs when the embedding
// AIAgent hands it a valid record token (see AIAgent.js), so it stays fully
// dormant on real end-user sessions.
//
// The dashboard is the authoritative accumulator: this recorder reports the
// screens/edges it has seen *this page load* via onUpdate(); the dashboard merges
// across reloads. The only state that must survive an MPA full-page navigation is
// the in-flight cross-page edge (which screen we left + the control clicked),
// stashed in sessionStorage and re-applied on the next load.

const PENDING_KEY = 'twm_screenmap_pending';
// The full accumulated map, persisted across MPA full-page reloads so the in-page
// banner shows a growing total (not just this page). Keyed by session so a new
// recording in a reused popup starts clean.
const STATE_KEY = 'twm_screenmap_state';

// Collapse id-like path segments so /orders/123 and /orders/456 fold into one
// screen /orders/:id instead of exploding the graph into per-id nodes.
function normalizeScreenName(name) {
  if (typeof name !== 'string' || !name) return name || '/';
  // Router-adapter screen names (e.g. "Cart") have no slashes — leave untouched.
  if (!name.includes('/')) return name;
  const [path] = name.split(/[?#]/);
  const norm = path
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ':id';
      if (/^[0-9a-f]{16,}$/i.test(seg)) return ':id';
      if (/\d/.test(seg) && /[a-z]/i.test(seg) && seg.length >= 12) return ':id';
      return seg;
    })
    .join('/');
  return norm || '/';
}

function labelForElement(el) {
  if (!el) return '';
  const text =
    el.getAttribute?.('aria-label') ||
    el.textContent ||
    el.getAttribute?.('title') ||
    el.value ||
    '';
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 120);
}

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

export class ScreenMapRecorder {
  constructor({ adapter, onUpdate, onDone, sessionId } = {}) {
    this.adapter = adapter;
    this.onUpdate = typeof onUpdate === 'function' ? onUpdate : () => {};
    this.onDone = typeof onDone === 'function' ? onDone : () => {};
    this.sessionId = sessionId || '';
    this.screens = {};
    this.edges = [];
    this.interactions = [];
    this.lastScreen = null;
    this.lastClick = null;
    this.active = false;
    this._banner = null;
    this._debounce = null;
    this._origPushState = null;
    this._origReplaceState = null;
    this._onClick = this._onClick.bind(this);
    this._onPopState = this._onPopState.bind(this);
    this._onHashChange = this._onHashChange.bind(this);
    this._onBeforeUnload = this._onBeforeUnload.bind(this);
  }

  start() {
    if (this.active || typeof window === 'undefined') return;
    this.active = true;

    // Restore the accumulated map from a prior MPA page in THIS session so the
    // banner total keeps climbing across full-page reloads.
    try {
      const saved = JSON.parse(window.sessionStorage.getItem(STATE_KEY) || 'null');
      if (saved && saved.sessionId === this.sessionId && saved.map) {
        this.screens = saved.map.screens || {};
        this.edges = saved.map.edges || [];
        this.interactions = saved.map.interactions || [];
      }
    } catch {
      /* sessionStorage may be unavailable */
    }

    this._showBanner();

    // Re-apply a cross-page edge left pending by an MPA navigation.
    try {
      const pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || 'null');
      if (pending && pending.from) {
        this.lastScreen = pending.from;
        this.lastClick = pending.trigger ? { label: pending.trigger } : null;
      }
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* sessionStorage may be unavailable */
    }

    // Capture the screen we land on. If a pending edge exists, this records it.
    const name = this._currentName();
    if (this.lastScreen && name && name !== this.lastScreen) {
      this._recordEdge(this.lastScreen, name, this.lastClick?.label, this.lastClick?.selector);
    }
    this._captureScreen(name);
    this.lastScreen = name;
    this.lastClick = null;

    // SPA route changes never reload — observe history + hash transitions.
    const h = window.history;
    this._origPushState = h.pushState;
    this._origReplaceState = h.replaceState;
    const fire = () => window.dispatchEvent(new Event('twm:locationchange'));
    h.pushState = (...args) => {
      const r = this._origPushState.apply(h, args);
      fire();
      return r;
    };
    h.replaceState = (...args) => {
      const r = this._origReplaceState.apply(h, args);
      fire();
      return r;
    };
    window.addEventListener('twm:locationchange', this._onPopState);
    window.addEventListener('popstate', this._onPopState);
    window.addEventListener('hashchange', this._onHashChange);
    document.addEventListener('click', this._onClick, true);
    window.addEventListener('beforeunload', this._onBeforeUnload);

    this._emit();
  }

  stop() {
    if (!this.active || typeof window === 'undefined') return;
    this.active = false;
    this._hideBanner();
    const h = window.history;
    if (this._origPushState) h.pushState = this._origPushState;
    if (this._origReplaceState) h.replaceState = this._origReplaceState;
    this._origPushState = null;
    this._origReplaceState = null;
    window.removeEventListener('twm:locationchange', this._onPopState);
    window.removeEventListener('popstate', this._onPopState);
    window.removeEventListener('hashchange', this._onHashChange);
    document.removeEventListener('click', this._onClick, true);
    window.removeEventListener('beforeunload', this._onBeforeUnload);
    if (this._debounce) clearTimeout(this._debounce);
    try {
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }

  getMap() {
    return { screens: this.screens, edges: this.edges, interactions: this.interactions };
  }

  // ─── internals ──────────────────────────────────────────────

  _currentName() {
    let raw = '/';
    try {
      raw = this.adapter?.getCurrentScreenName?.() || '/';
    } catch {
      raw = (typeof window !== 'undefined' && window.location?.pathname) || '/';
    }
    return normalizeScreenName(raw);
  }

  _captureScreen(name) {
    if (!name) return;
    let description = '';
    let title = '';
    let route = '';
    try {
      title = (typeof document !== 'undefined' && document.title) || '';
      const h1 = typeof document !== 'undefined' ? document.querySelector('h1') : null;
      if (h1?.textContent) description = h1.textContent.replace(/\s+/g, ' ').trim();
      if (typeof window !== 'undefined' && window.location) {
        route = (window.location.pathname || '') + (window.location.search || '');
      }
      if (!description) {
        const snap = this.adapter?.getScreenSnapshot?.();
        const firstLine = (snap?.elementsText || '').split('\n').find((l) => l.trim());
        description = (firstLine || title || name).replace(/\s+/g, ' ').trim();
      }
    } catch {
      /* best-effort */
    }
    const prev = this.screens[name] || {};
    this.screens[name] = {
      description: (description || prev.description || name).slice(0, 500),
      ...(title || prev.title ? { title: (title || prev.title).slice(0, 120) } : {}),
      ...(route || prev.route ? { route: (route || prev.route).slice(0, 120) } : {}),
    };
  }

  _recordEdge(from, to, trigger, selector) {
    if (!from || !to || from === to) return;
    const existing = this.edges.find((e) => e.from === from && e.to === to);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      if (!existing.trigger && trigger) existing.trigger = trigger;
      if (!existing.selector && selector) existing.selector = selector;
    } else {
      this.edges.push({ from, to, count: 1, ...(trigger ? { trigger } : {}), ...(selector ? { selector } : {}) });
    }
  }

  _scheduleRouteChange() {
    if (this._debounce) clearTimeout(this._debounce);
    // Let the SPA finish rendering the new view before we snapshot it.
    this._debounce = setTimeout(() => this._onRouteChange(), 400);
  }

  _onRouteChange() {
    if (!this.active) return;
    const to = this._currentName();
    if (!to) return;
    if (to !== this.lastScreen) {
      this._recordEdge(this.lastScreen, to, this.lastClick?.label, this.lastClick?.selector);
      this._captureScreen(to);
      this.lastScreen = to;
      this.lastClick = null;
      this._emit();
    }
  }

  _onPopState() {
    this._scheduleRouteChange();
  }

  _onHashChange() {
    this._scheduleRouteChange();
  }

  _onClick(event) {
    try {
      const target = event.target;
      const el = target?.closest?.('a,[role="link"],button,[role="button"],[onclick]');
      if (!el) return;
      this.lastClick = {
        label: labelForElement(el),
        selector: selectorFor(el),
        href: el.getAttribute?.('href') || '',
        ts: Date.now(),
      };
      // Capture a baseline + schedule a deferred classify so in-page changes
      // (dialogs, expanded panels, revealed content) are detected even when the
      // click does not navigate.
      var before = snapState();
      var clickInfo = this.lastClick;
      var screenAtClick = this._currentName();
      setTimeout(() => {
        if (this._currentName() !== screenAtClick) return; // navigated -> the edge path already recorded it
        var eff = diffEffect(before, snapState());
        if (eff) this._recordInteraction(screenAtClick, clickInfo, eff);
      }, 600);
    } catch {
      /* ignore */
    }
  }

  _recordInteraction(screen, clickInfo, effect) {
    if (!screen || !clickInfo || !effect) return;
    const key = clickInfo.selector || clickInfo.label;
    const existing = this.interactions.find(
      (it) => it.screen === screen && (it.selector || it.label) === key,
    );
    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      this.interactions.push({
        screen,
        ...(clickInfo.label ? { label: clickInfo.label } : {}),
        ...(clickInfo.selector ? { selector: clickInfo.selector } : {}),
        effect,
        count: 1,
      });
    }
    this._emit();
  }

  _onBeforeUnload() {
    // An MPA full navigation will destroy us; stash the in-flight edge + the full
    // accumulated map so the next page load continues the same session.
    if (!this.active) return;
    this._persistState();
    if (!this.lastScreen) return;
    try {
      window.sessionStorage.setItem(
        PENDING_KEY,
        JSON.stringify({ from: this.lastScreen, trigger: this.lastClick?.label || '' }),
      );
    } catch {
      /* ignore */
    }
  }

  _emit() {
    this._updateBanner();
    this._persistState();
    try {
      this.onUpdate(this.getMap());
    } catch {
      /* ignore */
    }
  }

  _persistState() {
    try {
      window.sessionStorage.setItem(STATE_KEY, JSON.stringify({ sessionId: this.sessionId, map: this.getMap() }));
    } catch {
      /* ignore */
    }
  }

  // Clear all persisted session state — called when the user finishes/stops, so a
  // later recording in the same tab starts from scratch.
  clearSession() {
    try {
      window.sessionStorage.removeItem(STATE_KEY);
      window.sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }

  // Big, self-explanatory banner so the person browsing the training popup always
  // knows what to do — independent of any dashboard handshake. Includes a Finish
  // button so they can complete the session right from the popup.
  _showBanner() {
    if (typeof document === 'undefined' || this._banner) return;
    const el = document.createElement('div');
    el.setAttribute('data-twm-screenmap-banner', '');
    el.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:2147483647;box-sizing:border-box;' +
      'display:flex;align-items:center;gap:14px;padding:12px 18px;' +
      'background:#0f172a;color:#fff;font-family:system-ui,sans-serif;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.35);border-bottom:3px solid #ef4444';
    el.innerHTML =
      '<span style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px;white-space:nowrap">' +
      '<span style="width:11px;height:11px;border-radius:50%;background:#ef4444;animation:twmpulse 1s infinite"></span>Recording your site</span>' +
      '<span data-twm-text style="font-size:13px;line-height:1.35;opacity:.92">Browse normally — click into every page, menu, product, and finish checkout. We map each screen automatically.</span>' +
      '<span data-twm-count style="margin-left:auto;font-size:12px;font-weight:600;white-space:nowrap;opacity:.85">0 screens · 0 links</span>' +
      '<button data-twm-finish style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;background:#22c55e;color:#06210f;font:700 13px system-ui;white-space:nowrap">✓ Finish &amp; save</button>' +
      '<style>@keyframes twmpulse{50%{opacity:.25}}</style>';
    document.body.appendChild(el);
    // Nudge the page down so the banner never hides the site's own header.
    try { document.body.style.marginTop = el.offsetHeight + 'px'; } catch { /* ignore */ }
    const btn = el.querySelector('[data-twm-finish]');
    if (btn) {
      this._onFinish = () => { this.onDone(); this.clearSession(); this.stop(); };
      btn.addEventListener('click', this._onFinish);
    }
    this._banner = el;
    this._updateBanner();
  }

  _updateBanner() {
    if (!this._banner) return;
    const count = this._banner.querySelector('[data-twm-count]');
    if (count) {
      const s = Object.keys(this.screens).length;
      const e = this.edges.length;
      count.textContent = `${s} screen${s === 1 ? '' : 's'} · ${e} link${e === 1 ? '' : 's'}`;
    }
  }

  _hideBanner() {
    if (this._banner && this._banner.parentNode) this._banner.parentNode.removeChild(this._banner);
    try { document.body.style.marginTop = ''; } catch { /* ignore */ }
    this._banner = null;
  }
}

export { normalizeScreenName };
