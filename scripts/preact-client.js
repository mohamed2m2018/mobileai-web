// react-dom/client adapter for the Preact CDN build.
// preact/compat (current build) doesn't expose a named ESM `createRoot`, so we
// provide a tiny React 18-style root over preact's render. Used only by the
// esbuild alias `react-dom/client` -> this file.

import { render } from 'preact';

export function createRoot(container) {
  return {
    render: (vnode) => render(vnode, container),
    unmount: () => render(null, container),
  };
}

export default { createRoot };
