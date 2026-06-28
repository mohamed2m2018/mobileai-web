// Locate the submit/search control for a FORMLESS input — STRUCTURALLY, with no label-keyword
// guessing. SPA search boxes usually aren't wrapped in a <form>, so a synthetic Enter does
// nothing; the site submits via a button. We find that button by structure: an explicit submit
// control, else the nearest button inside the input's search/form-like container (search boxes
// wrap the input and its button together), walking up a few levels.
//
// Pure (takes a DOM node, returns a node or null) so it can be unit-tested without the
// React-importing adapter. Used by WebPlatformAdapter.submitFromNode.
export function findSubmitControl(node) {
  try {
    if (!node) return null;
    let scope = (typeof node.closest === 'function'
      && node.closest('[role="search"], form, search')) || null;
    if (!scope) {
      let cur = node.parentElement;
      let hops = 0;
      while (cur && hops < 4) {
        if (cur.querySelector && cur.querySelector('button, [role="button"], input[type="submit"]')) {
          scope = cur;
          break;
        }
        cur = cur.parentElement;
        hops += 1;
      }
    }
    if (!scope || typeof scope.querySelector !== 'function') return null;
    // Prefer an explicit submit control; else the first interactive button in the container.
    const explicit = scope.querySelector('button[type="submit"], input[type="submit"]');
    if (explicit && explicit !== node) return explicit;
    const candidates = Array.from(scope.querySelectorAll('button, [role="button"], input[type="submit"]'))
      .filter(el => el !== node);
    return candidates[0] || null;
  } catch {
    return null;
  }
}
