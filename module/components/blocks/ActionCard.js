"use strict";

import { StyleSheet, Text, View } from 'react-native';
import { useActionBridge } from "../../core/ActionBridge.js";
import { useRichUITheme } from "../rich-content/RichUIContext.js";
import { ActionRow, CardSurface, SectionTitle } from "./primitives/index.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ActionCard({
  title = 'Suggested next step',
  body,
  actions = [],
  appearance
}) {
  const bridge = useActionBridge();
  const theme = useRichUITheme();
  const accentColor = appearance?.accentColor || theme.colors.primaryAccent;
  return /*#__PURE__*/_jsxs(CardSurface, {
    appearance: appearance,
    children: [/*#__PURE__*/_jsxs(View, {
      style: [styles.hero, {
        backgroundColor: appearance?.raisedSurfaceColor || theme.colors.raisedSurface,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: [/*#__PURE__*/_jsx(View, {
        style: [styles.accentOrb, {
          backgroundColor: accentColor
        }]
      }), /*#__PURE__*/_jsxs(View, {
        style: styles.heroCopy,
        children: [/*#__PURE__*/_jsx(Text, {
          style: [styles.eyebrow, {
            color: appearance?.mutedTextColor || theme.colors.mutedText
          }],
          children: "Suggested next step"
        }), /*#__PURE__*/_jsx(SectionTitle, {
          title: title,
          appearance: appearance
        })]
      })]
    }), body ? /*#__PURE__*/_jsx(Text, {
      style: [styles.body, {
        color: appearance?.textColor || theme.colors.primaryText
      }],
      children: body
    }) : null, /*#__PURE__*/_jsx(ActionRow, {
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
ActionCard.displayName = 'ActionCard';
export const ActionCardDefinition = {
  name: 'ActionCard',
  component: ActionCard,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'recovery',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
    },
    body: {
      type: 'string'
    },
    actions: {
      type: 'array'
    }
  },
  previewTextBuilder: props => [props.title, props.body].filter(part => typeof part === 'string').join(' — '),
  styleSlots: ['surface', 'actions']
};
const styles = StyleSheet.create({
  hero: {
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12
  },
  accentOrb: {
    width: 14,
    height: 14,
    borderRadius: 999,
    marginTop: 6
  },
  heroCopy: {
    flex: 1,
    gap: 8
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase'
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500'
  }
});
//# sourceMappingURL=ActionCard.js.map