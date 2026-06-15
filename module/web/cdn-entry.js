"use strict";

// IIFE entry for the CDN build (dist/mobileai.js). Exposes window.MobileAI.
// Bundled by scripts/build-cdn.mjs with react/react-dom aliased to preact/compat,
// so the host page needs zero React (or any framework).

import { init } from "./init.js";

const MobileAI = { init };

if (typeof window !== 'undefined') {
  window.MobileAI = MobileAI;

  // Optional zero-JS auto-init: configure straight from the <script> tag, e.g.
  // <script src=".../mobileai.js"
  //   data-proxy-url="https://mobileai.cloud/api/v1/hosted-proxy/text"
  //   data-analytics-key="mobileai_pub_..."
  //   data-auth-token="mobileai_pub_..."></script>
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

export default MobileAI;
