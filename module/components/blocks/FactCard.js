"use strict";

import { StyleSheet, Text, View } from 'react-native';
import { useRichUITheme } from "../rich-content/RichUIContext.js";
import { BadgeRow, CardSurface, MetaRow, SectionTitle } from "./primitives/index.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function FactCard({
  title = 'Key details',
  subtitle,
  body,
  facts = [],
  badges = [],
  appearance
}) {
  const theme = useRichUITheme();
  const textColor = appearance?.textColor || theme.colors.primaryText;
  const mutedTextColor = appearance?.mutedTextColor || theme.colors.mutedText;
  const accentColor = appearance?.accentColor || theme.colors.primaryAccent;
  const surfaceColor = appearance?.raisedSurfaceColor || theme.colors.raisedSurface;
  return /*#__PURE__*/_jsxs(CardSurface, {
    appearance: appearance,
    children: [/*#__PURE__*/_jsxs(View, {
      style: [styles.headerPanel, {
        backgroundColor: surfaceColor,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: [/*#__PURE__*/_jsxs(View, {
        style: styles.kickerRow,
        children: [/*#__PURE__*/_jsx(View, {
          style: [styles.kickerBar, {
            backgroundColor: accentColor
          }]
        }), /*#__PURE__*/_jsx(Text, {
          style: [styles.kickerText, {
            color: mutedTextColor
          }],
          children: "Quick brief"
        })]
      }), /*#__PURE__*/_jsx(SectionTitle, {
        title: title,
        subtitle: subtitle,
        appearance: appearance
      })]
    }), body ? /*#__PURE__*/_jsx(Text, {
      style: [styles.body, {
        color: textColor
      }],
      children: body
    }) : null, facts.length ? /*#__PURE__*/_jsx(View, {
      style: [styles.factsPanel, {
        backgroundColor: surfaceColor,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: /*#__PURE__*/_jsx(MetaRow, {
        items: facts,
        appearance: appearance
      })
    }) : null, /*#__PURE__*/_jsx(BadgeRow, {
      badges: badges,
      appearance: appearance
    }), !facts.length && !badges.length && !body ? /*#__PURE__*/_jsx(View, {
      style: [styles.placeholder, {
        backgroundColor: surfaceColor,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: /*#__PURE__*/_jsx(Text, {
        style: [styles.placeholderText, {
          color: textColor
        }],
        children: "Helpful facts will appear here."
      })
    }) : null]
  });
}
FactCard.displayName = 'FactCard';
export const FactCardDefinition = {
  name: 'FactCard',
  component: FactCard,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'contextual_help',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
    },
    subtitle: {
      type: 'string'
    },
    body: {
      type: 'string'
    },
    facts: {
      type: 'array'
    },
    badges: {
      type: 'array'
    }
  },
  previewTextBuilder: props => [props.title, props.subtitle, props.body].filter(part => typeof part === 'string').join(' — '),
  styleSlots: ['surface', 'text', 'meta', 'badges']
};
const styles = StyleSheet.create({
  headerPanel: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10
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
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500'
  },
  factsPanel: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  placeholder: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderRadius: 18
  },
  placeholderText: {
    fontSize: 13,
    fontWeight: '600'
  }
});
//# sourceMappingURL=FactCard.js.map