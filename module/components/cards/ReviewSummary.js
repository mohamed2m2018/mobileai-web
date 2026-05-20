"use strict";

import { ProductCard } from "../blocks/ProductCard.js";
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Built-in card template that shows a product/service review summary.
 * Injected by the AI agent to surface social proof at decision points.
 *
 * IMPORTANT: displayName is set explicitly to survive minification.
 * The injectCardTool resolves templates by `T.displayName`, not `T.name`.
 */
export function ReviewSummary({
  rating = 0,
  reviewCount = 0,
  headline = 'Customer Reviews',
  sentiment = 'neutral'
}) {
  return /*#__PURE__*/_jsx(ProductCard, {
    title: headline,
    subtitle: `${rating.toFixed(1)} · ${reviewCount.toLocaleString()} reviews`,
    badges: [sentiment],
    description: "Compatibility wrapper around the new ProductCard block."
  });
}

// Explicit — function.name is mangled in minified production builds.
ReviewSummary.displayName = 'ReviewSummary';
//# sourceMappingURL=ReviewSummary.js.map