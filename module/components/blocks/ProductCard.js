"use strict";

import { StyleSheet, Text, View } from 'react-native';
import { useActionBridge } from "../../core/ActionBridge.js";
import { useRichUITheme } from "../rich-content/RichUIContext.js";
import { ActionRow, CardSurface, MediaFrame, PriceTag } from "./primitives/index.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ProductCard({
  title,
  name,
  subtitle,
  description,
  imageUrl,
  image,
  price,
  compareAtPrice,
  badges = [],
  actions = [],
  appearance
}) {
  const theme = useRichUITheme();
  const bridge = useActionBridge();
  const resolvedTitle = title || name || 'Recommended item';
  const resolvedImageUrl = imageUrl || image;
  const hasHeroMedia = Boolean(resolvedImageUrl);
  const palette = {
    text: appearance?.textColor || theme.colors.primaryText,
    muted: appearance?.mutedTextColor || theme.colors.secondaryText,
    accent: appearance?.accentColor || theme.colors.primaryAccent
  };
  const heroPriceAppearance = {
    ...appearance,
    priceBackgroundColor: 'rgba(23, 20, 17, 0.86)',
    priceTextColor: theme.colors.inverseText
  };
  return /*#__PURE__*/_jsxs(CardSurface, {
    appearance: appearance,
    children: [hasHeroMedia ? /*#__PURE__*/_jsxs(View, {
      style: styles.mediaWrap,
      children: [/*#__PURE__*/_jsx(MediaFrame, {
        uri: resolvedImageUrl,
        appearance: appearance
      }), /*#__PURE__*/_jsx(View, {
        style: styles.heroScrim
      }), price ? /*#__PURE__*/_jsx(View, {
        style: styles.floatingPrice,
        children: /*#__PURE__*/_jsx(PriceTag, {
          label: price,
          strikeThrough: compareAtPrice,
          appearance: heroPriceAppearance
        })
      }) : null, /*#__PURE__*/_jsxs(View, {
        style: styles.heroContent,
        children: [subtitle ? /*#__PURE__*/_jsx(Text, {
          style: [styles.subtitleEyebrow, {
            color: theme.colors.inverseText
          }],
          children: subtitle
        }) : null, /*#__PURE__*/_jsx(Text, {
          style: [styles.heroTitle, {
            color: theme.colors.inverseText
          }],
          children: resolvedTitle
        })]
      })]
    }) : null, /*#__PURE__*/_jsxs(View, {
      style: [styles.content, {
        gap: theme.spacing.sm,
        marginTop: hasHeroMedia ? 2 : 0,
        backgroundColor: appearance?.raisedSurfaceColor || theme.colors.raisedSurface,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: [!hasHeroMedia ? /*#__PURE__*/_jsxs(View, {
        style: styles.compactHeader,
        children: [/*#__PURE__*/_jsxs(View, {
          style: styles.compactTitleWrap,
          children: [subtitle ? /*#__PURE__*/_jsx(Text, {
            style: [styles.compactSubtitle, {
              color: palette.muted
            }],
            children: subtitle
          }) : null, /*#__PURE__*/_jsx(Text, {
            style: [styles.compactTitle, {
              color: palette.text
            }],
            children: resolvedTitle
          })]
        }), price ? /*#__PURE__*/_jsx(PriceTag, {
          label: price,
          strikeThrough: compareAtPrice,
          appearance: appearance
        }) : null]
      }) : null, /*#__PURE__*/_jsxs(View, {
        style: styles.kickerRow,
        children: [/*#__PURE__*/_jsx(View, {
          style: [styles.kickerBar, {
            backgroundColor: palette.accent
          }]
        }), /*#__PURE__*/_jsx(Text, {
          style: [styles.kickerText, {
            color: palette.muted
          }],
          children: "AI pick"
        })]
      }), description ? /*#__PURE__*/_jsx(Text, {
        style: [styles.description, {
          color: palette.text
        }],
      children: description
      }) : null, badges.length ? /*#__PURE__*/_jsx(View, {
        style: [styles.badgesRow, {
          gap: theme.spacing.xs
        }],
        children: badges.map(badge => /*#__PURE__*/_jsx(View, {
          style: [styles.badge, {
            backgroundColor: theme.colors.blockSurface,
            borderColor: theme.colors.subtleBorder
          }],
          children: /*#__PURE__*/_jsx(Text, {
            style: [styles.badgeText, {
              color: palette.text
            }],
            children: badge
          })
        }, badge))
      }) : null, !price && compareAtPrice ? /*#__PURE__*/_jsx(Text, {
        style: [styles.compareAtPrice, {
          color: theme.colors.strikeThroughPrice
        }],
        children: compareAtPrice
      }) : null]
    }), /*#__PURE__*/_jsx(ActionRow, {
      actions: actions,
      appearance: appearance,
      onAction: actionId => {
        bridge.invoke({
          actionId
        });
      }
    })]
  });
}
ProductCard.displayName = 'ProductCard';
export const ProductCardDefinition = {
  name: 'ProductCard',
  component: ProductCard,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'decision_support',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string',
      required: true
    },
    name: {
      type: 'string'
    },
    subtitle: {
      type: 'string'
    },
    description: {
      type: 'string'
    },
    imageUrl: {
      type: 'string'
    },
    image: {
      type: 'string'
    },
    price: {
      type: 'string'
    },
    compareAtPrice: {
      type: 'string'
    },
    badges: {
      type: 'array'
    },
    actions: {
      type: 'array'
    }
  },
  previewTextBuilder: props => [props.title, props.price, props.description].filter(part => typeof part === 'string').join(' — '),
  styleSlots: ['surface', 'media', 'price', 'actions']
};
const styles = StyleSheet.create({
  mediaWrap: {
    position: 'relative'
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12, 10, 8, 0.16)'
  },
  floatingPrice: {
    position: 'absolute',
    right: 14,
    bottom: 14
  },
  heroContent: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    gap: 6
  },
  subtitleEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    opacity: 0.88
  },
  heroTitle: {
    fontSize: 29,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.8,
    maxWidth: '74%'
  },
  content: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12
  },
  compactTitleWrap: {
    flex: 1,
    gap: 6
  },
  compactSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  compactTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: -0.6
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  kickerBar: {
    width: 28,
    height: 4,
    borderRadius: 999
  },
  kickerText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  description: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500'
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700'
  },
  compareAtPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through',
    fontWeight: '600'
  }
});
//# sourceMappingURL=ProductCard.js.map
