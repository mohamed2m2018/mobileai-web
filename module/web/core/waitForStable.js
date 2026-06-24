// Page-settle detection, framework-free so it stays unit-testable. (WebPlatformAdapter,
// which calls this, imports React — which test environments here don't have installed.)
//
// Resolves TRUE when the page reaches a settled state (document.readyState === 'complete'
// AND the URL has been stable for QUIET_MS), FALSE when it hits maxMs while still loading.
// The server's dead-action guard relies on this: an unchanged screen is only a dead loop
// when the page actually settled — never while it's still loading.
export function waitForPageStable(win, doc, maxMs = 1800) {
  if (!win || !doc) return Promise.resolve(true);
  const start = Date.now();
  const QUIET_MS = 250;
  let lastUrl = win.location.href;
  let lastChange = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const now = Date.now();
      if (win.location.href !== lastUrl) { lastUrl = win.location.href; lastChange = now; }
      const settled = now - lastChange >= QUIET_MS && doc.readyState === 'complete';
      if (settled) { resolve(true); return; }
      if (now - start >= maxMs) { resolve(false); return; }
      setTimeout(tick, 50);
    };
    setTimeout(tick, 50);
  });
}
