"use strict";

import { FactCard } from "../blocks/FactCard.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Built-in card template for AI injection.
 *
 * IMPORTANT: displayName must be set explicitly here.
 * In production/minified builds, the function name is mangled (e.g. `a`, `b`),
 * so `injectCardTool` cannot identify templates by inferred name alone.
 * Always look up templates by `T.displayName`, never by `T.name`.
 */
export function InfoCard({
  title = 'Info',
  body = ''
}) {
  return /*#__PURE__*/_jsx(FactCard, {
    title: title,
    body: body
  });
}

// Must be explicit — minification mangles function.name in production builds.
InfoCard.displayName = 'InfoCard';
//# sourceMappingURL=InfoCard.js.map