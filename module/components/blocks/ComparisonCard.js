"use strict";

import { Image, StyleSheet, Text, View } from 'react-native';
import { useRichUITheme } from "../rich-content/RichUIContext.js";
import { BadgeRow, CardSurface, PriceTag, SectionTitle } from "./primitives/index.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ComparisonCard({
  title = 'Compare options',
  items = [],
  appearance
}) {
  const theme = useRichUITheme();
  const accentColor = appearance?.accentColor || theme.colors.primaryAccent;
  return /*#__PURE__*/_jsxs(CardSurface, {
    appearance: appearance,
    children: [/*#__PURE__*/_jsxs(View, {
      style: styles.header,
      children: [/*#__PURE__*/_jsx(View, {
        style: [styles.headerBar, {
          backgroundColor: accentColor
        }]
      }), /*#__PURE__*/_jsx(SectionTitle, {
        title: title,
        appearance: appearance
      })]
    }), /*#__PURE__*/_jsx(View, {
      style: styles.list,
      children: items.map((item, index) => /*#__PURE__*/_jsxs(View, {
        style: [styles.item, {
          borderColor: appearance?.borderColor || theme.colors.subtleBorder,
          backgroundColor: appearance?.raisedSurfaceColor || theme.colors.raisedSurface
        }],
        children: [item.imageUrl || item.image ? /*#__PURE__*/_jsx(Image, {
          source: {
            uri: item.imageUrl || item.image
          },
          style: [styles.itemImage, {
            borderColor: theme.colors.mediaBorder
          }],
          resizeMode: "cover"
        }) : null, /*#__PURE__*/_jsxs(View, {
          style: styles.itemTopRow,
          children: [/*#__PURE__*/_jsxs(View, {
            style: styles.itemTitleWrap,
            children: [/*#__PURE__*/_jsx(Text, {
              style: [styles.rank, {
                color: appearance?.mutedTextColor || theme.colors.mutedText
              }],
              children: String(index + 1).padStart(2, '0')
            }), /*#__PURE__*/_jsx(View, {
              style: styles.itemCopy,
              children: /*#__PURE__*/_jsx(SectionTitle, {
                title: item.title || item.name || `Option ${index + 1}`,
                subtitle: item.subtitle,
                appearance: appearance
              })
            })]
          }), /*#__PURE__*/_jsx(PriceTag, {
            label: item.price,
            appearance: appearance
          })]
        }), item.summary || item.description ? /*#__PURE__*/_jsx(Text, {
          style: [styles.summary, {
            color: appearance?.textColor || theme.colors.primaryText
          }],
          children: item.summary || item.description
        }) : null, /*#__PURE__*/_jsx(BadgeRow, {
          badges: item.badges,
          appearance: appearance
        })]
      }, item.title || item.name || `item-${index}`))
    })]
  });
}
ComparisonCard.displayName = 'ComparisonCard';
export const ComparisonCardDefinition = {
  name: 'ComparisonCard',
  component: ComparisonCard,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'decision_support',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
    },
    items: {
      type: 'array',
      required: true
    }
  },
  previewTextBuilder: props => [props.title].filter(part => typeof part === 'string').join(' — '),
  styleSlots: ['surface', 'comparisonItems', 'price']
};
const styles = StyleSheet.create({
  header: {
    gap: 12
  },
  headerBar: {
    width: 42,
    height: 4,
    borderRadius: 999
  },
  list: {
    gap: 12
  },
  item: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 12
  },
  itemImage: {
    width: '100%',
    aspectRatio: 1.8,
    borderRadius: 16,
    borderWidth: 1
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  itemTitleWrap: {
    flexDirection: 'row',
    gap: 12,
    flex: 1
  },
  itemCopy: {
    flex: 1
  },
  rank: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 4
  },
  summary: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500'
  }
});
//# sourceMappingURL=ComparisonCard.js.map