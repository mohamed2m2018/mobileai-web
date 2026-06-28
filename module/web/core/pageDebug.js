// Lightweight in-page capture of console messages + network requests, so the agent can DIAGNOSE
// silent failures (e.g. "did the search XHR actually fire, and with what query?"). Installs once,
// idempotently, and NEVER throws into the page. Privacy: we record request METADATA only (method,
// url, status, duration) — never request/response BODIES — and redact known-secret query params.

const MAX = 60;
const consoleBuf = [];
const networkBuf = [];
let installed = false;

// Known-secret query-param NAMES (not content matching) — their values are redacted so a captured
// URL can't leak a token/key while still showing the useful parts (e.g. a search query q=...).
const SECRET_PARAM = /^(token|key|api[_-]?key|auth|authorization|password|pwd|secret|session|sid|access[_-]?token|refresh[_-]?token|otp|code)$/i;

function push(buf, entry) {
  buf.push(entry);
  if (buf.length > MAX) buf.shift();
}

function fmtArg(a) {
  try { return typeof a === 'string' ? a : JSON.stringify(a); }
  catch { return String(a); }
}

function scrubUrl(u) {
  try {
    const base = (typeof window !== 'undefined' && window.location) ? window.location.href : undefined;
    const x = new URL(String(u), base);
    for (const k of [...x.searchParams.keys()]) {
      if (SECRET_PARAM.test(k)) x.searchParams.set(k, '***');
    }
    return (x.origin + x.pathname + (x.search || '')).slice(0, 300);
  } catch {
    return String(u).split('#')[0].slice(0, 300);
  }
}

export function installPageDebug() {
  if (installed) return;
  installed = true;
  try {
    if (typeof window === 'undefined') return;

    // ── console ──
    for (const level of ['log', 'info', 'warn', 'error']) {
      const orig = console[level];
      if (typeof orig !== 'function') continue;
      console[level] = function (...args) {
        try { push(consoleBuf, { level, text: args.map(fmtArg).join(' ').slice(0, 300), t: Date.now() }); } catch { /* never break logging */ }
        return orig.apply(this, args);
      };
    }

    // ── fetch ──
    if (typeof window.fetch === 'function') {
      const origFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = ((init && init.method) || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();
        const start = Date.now();
        const record = (status) => { try { push(networkBuf, { method, url: scrubUrl(url), status, ms: Date.now() - start, t: start }); } catch { /* ignore */ } };
        return origFetch(input, init).then(
          (res) => { record(res.status); return res; },
          (err) => { record('ERR'); throw err; },
        );
      };
    }

    // ── XMLHttpRequest ──
    const XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        try { this.__dbg = { method: String(method || 'GET').toUpperCase(), url: scrubUrl(url || ''), start: 0 }; } catch { /* ignore */ }
        return open.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        try {
          if (this.__dbg) {
            this.__dbg.start = Date.now();
            this.addEventListener('loadend', () => {
              try { push(networkBuf, { method: this.__dbg.method, url: this.__dbg.url, status: this.status || 'ERR', ms: Date.now() - this.__dbg.start, t: this.__dbg.start }); } catch { /* ignore */ }
            });
          }
        } catch { /* ignore */ }
        return send.apply(this, arguments);
      };
    }
  } catch {
    /* instrumentation must NEVER break the host page */
  }
}

export function getConsole(limit = 30) {
  const items = consoleBuf.slice(-Math.max(1, limit));
  if (!items.length) return 'No console messages captured since the agent loaded.';
  return items.map((e) => `[${e.level}] ${e.text}`).join('\n');
}

export function getNetwork(limit = 30) {
  const items = networkBuf.slice(-Math.max(1, limit));
  if (!items.length) return 'No network requests captured since the agent loaded.';
  return items.map((e) => `${e.method} ${e.url} → ${e.status} (${e.ms}ms)`).join('\n');
}
