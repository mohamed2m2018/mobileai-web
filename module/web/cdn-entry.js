"use strict";

// IIFE entry for the CDN build (dist/twomilia.js). Exposes window.Twomilia.
// Bundled by scripts/build-cdn.mjs with react/react-dom aliased to preact/compat,
// so the host page needs zero React (or any framework).

import { init } from "./init.js";

const Twomilia = { init };

if (typeof window !== 'undefined') {
  window.Twomilia = Twomilia;
  window.MobileAI = Twomilia; // backwards-compatible alias

  // Optional zero-JS auto-init: configure straight from the <script> tag, e.g.
  // <script src=".../twomilia.js"
  //   data-proxy-url="https://twomilia.com/api/v1/hosted-proxy/text"
  //   data-analytics-key="twomilia_pub_..."
  //   data-auth-token="twomilia_pub_..."></script>
  const tag = typeof document !== 'undefined' ? document.currentScript : null;
  const ds = tag && tag.dataset;
  if (ds && ds.proxyUrl) {
    init({
      proxyUrl: ds.proxyUrl,
      analyticsKey: ds.analyticsKey,
      proxyHeaders: ds.authToken ? { Authorization: 'Bearer ' + ds.authToken } : undefined,
    });
  }
}

export default Twomilia;
