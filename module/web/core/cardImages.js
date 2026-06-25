'use strict';
// Product-card images, enriched CLIENT-SIDE (zero model-token cost). The agent tags a card item
// (or a ProductCard's props) with `sourceIndex` = the product's on-screen element index. Here we
// resolve that index back to its DOM node via the page controller, find the product photo, and
// fill `imageUrl`. The renderer already shows `item.imageUrl`. Image URLs never enter the model
// prompt — the client already has the DOM + the images, so this costs no tokens.

/**
 * Find a product photo URL INSIDE an element. Descendants ONLY — never climb to ancestors:
 * climbing into a shared product-list container grabbed a SIBLING product's photo (a card whose
 * own <img> was a data: placeholder picked up the next card's image). If this element has no
 * usable image, return null and show none (graceful) rather than the wrong one. So `sourceIndex`
 * should point at the element that WRAPS the product (its link/card), not a nested button.
 */
export function findProductImageSrc(node) {
  if (!node || typeof node.querySelectorAll !== 'function') return null;
  const imgs = Array.from(node.querySelectorAll('img'));
  for (const img of imgs) {
    const src = img.currentSrc || img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) continue;
    const r = typeof img.getBoundingClientRect === 'function'
      ? img.getBoundingClientRect()
      : { width: 64, height: 64 };
    if (r.width >= 32 && r.height >= 32) return src; // skip tiny icons / sprites
  }
  return null;
}

/**
 * Walk a rich reply (array of blocks) and fill `imageUrl` on any ComparisonCard item or
 * ProductCard props that carry a `sourceIndex`, resolving the photo from the live DOM via the
 * platform adapter's controller. Returns a new array (does not mutate). No-ops safely when the
 * reply isn't an array, the controller is unavailable, or an item already has an image.
 */
export function enrichReplyImages(reply, platformAdapter) {
  if (!Array.isArray(reply)) return reply;
  const ctrl = platformAdapter && platformAdapter.getController && platformAdapter.getController();
  if (!ctrl || typeof ctrl.getElement !== 'function') return reply;
  const imgFor = (idx) => {
    if (typeof idx !== 'number') return null;
    try { return findProductImageSrc(ctrl.getElement(idx)); } catch { return null; }
  };
  const fillItem = (item) => {
    if (item && typeof item === 'object' && !item.imageUrl && !item.image) {
      const src = imgFor(item.sourceIndex);
      if (src) return { ...item, imageUrl: src };
    }
    return item;
  };
  return reply.map((block) => {
    if (!block || typeof block !== 'object') return block;
    const props = block.props && typeof block.props === 'object' ? block.props : block;
    const next = { ...block };
    const nextProps = block.props ? { ...props } : next;
    let touched = false;
    if (Array.isArray(props.items)) { nextProps.items = props.items.map(fillItem); touched = true; }
    if (typeof props.sourceIndex === 'number' && !props.imageUrl && !props.image) {
      const src = imgFor(props.sourceIndex);
      if (src) { nextProps.imageUrl = src; touched = true; }
    }
    if (!touched) return block;
    if (block.props) next.props = nextProps;
    return next;
  });
}
