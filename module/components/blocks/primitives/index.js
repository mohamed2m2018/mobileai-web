"use strict";

import React from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRichUITheme } from "../../rich-content/RichUIContext.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function useAppearance(appearance) {
  const theme = useRichUITheme();
  return {
    surfaceColor: appearance?.surfaceColor || theme.colors.blockSurface,
    raisedSurfaceColor: appearance?.raisedSurfaceColor || theme.colors.raisedSurface,
    borderColor: appearance?.borderColor || theme.colors.border,
    textColor: appearance?.textColor || theme.colors.primaryText,
    mutedTextColor: appearance?.mutedTextColor || theme.colors.mutedText,
    accentColor: appearance?.accentColor || theme.colors.primaryAccent,
    priceBackgroundColor: appearance?.priceBackgroundColor || theme.colors.priceTagBackground,
    priceTextColor: appearance?.priceTextColor || theme.colors.priceTagText
  };
}
export function CardSurface({
  children,
  appearance
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  return /*#__PURE__*/_jsx(View, {
    style: [styles.cardSurface, {
      backgroundColor: palette.surfaceColor,
      borderColor: theme.colors.subtleBorder,
      borderRadius: theme.shape.cardRadius,
      padding: theme.spacing.md
    }],
    children: children
  });
}
export function MediaFrame({
  uri
}) {
  const theme = useRichUITheme();
  return uri ? /*#__PURE__*/_jsx(Image, {
    source: {
      uri
    },
    style: [styles.media, {
      borderRadius: theme.shape.mediaRadius,
      borderColor: theme.colors.mediaBorder
    }],
    resizeMode: "cover"
  }) : /*#__PURE__*/_jsx(View, {
    style: [styles.media, {
      borderRadius: theme.shape.mediaRadius,
      backgroundColor: theme.colors.imagePlaceholder,
      borderColor: theme.colors.mediaBorder
    }]
  });
}
export function PriceTag({
  label,
  strikeThrough,
  appearance
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  if (!label) return null;
  return /*#__PURE__*/_jsxs(View, {
    style: [styles.priceTag, {
      backgroundColor: palette.priceBackgroundColor,
      borderColor: theme.colors.priceTagBorder
    }],
    children: [/*#__PURE__*/_jsx(Text, {
      style: [styles.priceText, {
        color: palette.priceTextColor
      }],
      children: label
    }), strikeThrough ? /*#__PURE__*/_jsx(Text, {
      style: [styles.strikeText, {
        color: theme.colors.strikeThroughPrice
      }],
      children: strikeThrough
    }) : null]
  });
}
export function BadgeRow({
  badges = [],
  appearance
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  if (!badges.length) return null;
  return /*#__PURE__*/_jsx(View, {
    style: [styles.row, {
      gap: theme.spacing.xs,
      flexWrap: 'wrap'
    }],
    children: badges.map(badge => /*#__PURE__*/_jsx(View, {
      style: [styles.badge, {
        backgroundColor: theme.colors.chipFilledBackground,
        borderRadius: theme.shape.chipRadius
      }],
      children: /*#__PURE__*/_jsx(Text, {
        style: [styles.badgeText, {
          color: palette.textColor
        }],
        children: badge
      })
    }, badge))
  });
}
export function MetaRow({
  items = [],
  appearance
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  if (!items.length) return null;
  return /*#__PURE__*/_jsx(View, {
    style: [styles.column, {
      gap: theme.spacing.xs
    }],
    children: items.map(item => /*#__PURE__*/_jsxs(View, {
      style: styles.metaRow,
      children: [/*#__PURE__*/_jsx(Text, {
        style: [styles.metaLabel, {
          color: palette.mutedTextColor
        }],
        children: item.label
      }), /*#__PURE__*/_jsx(Text, {
        style: [styles.metaValue, {
          color: palette.textColor
        }],
        children: item.value
      })]
    }, item.label))
  });
}
export function ActionRow({
  actions = [],
  appearance,
  onAction
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  if (!actions.length) return null;
  return /*#__PURE__*/_jsx(View, {
    style: [styles.row, {
      gap: theme.spacing.sm,
      flexWrap: 'wrap'
    }],
    children: actions.map(action => {
      const isPrimary = action.variant !== 'secondary' && action.variant !== 'chip';
      return /*#__PURE__*/_jsx(Pressable, {
        style: [styles.actionButton, {
          backgroundColor: action.variant === 'chip' ? theme.colors.chipOutlinedBorder : isPrimary ? palette.accentColor : palette.raisedSurfaceColor,
          borderColor: palette.borderColor,
          borderRadius: action.variant === 'chip' ? theme.shape.chipRadius : theme.shape.controlRadius
        }],
        onPress: () => onAction?.(action.id),
        children: /*#__PURE__*/_jsx(Text, {
          style: [styles.actionLabel, {
            color: action.variant === 'secondary' ? palette.textColor : theme.colors.inverseText
          }],
          children: action.label
        })
      }, action.id);
    })
  });
}
export function FieldRow({
  label,
  value,
  placeholder,
  appearance,
  onChangeText
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  return /*#__PURE__*/_jsxs(View, {
    style: [styles.column, {
      gap: theme.spacing.xs
    }],
    children: [/*#__PURE__*/_jsx(Text, {
      style: [styles.metaLabel, {
        color: palette.mutedTextColor
      }],
      children: label
    }), /*#__PURE__*/_jsx(TextInput, {
      value: value,
      onChangeText: onChangeText,
      placeholder: placeholder,
      placeholderTextColor: theme.colors.placeholder,
      style: [styles.field, {
        backgroundColor: theme.colors.fieldBackground,
        borderColor: theme.colors.fieldBorder,
        color: palette.textColor,
        borderRadius: theme.shape.controlRadius
      }]
    })]
  });
}
export function SectionTitle({
  title,
  subtitle,
  appearance
}) {
  const theme = useRichUITheme();
  const palette = useAppearance(appearance);
  return /*#__PURE__*/_jsxs(View, {
    style: [styles.column, {
      gap: theme.spacing.xxs
    }],
    children: [/*#__PURE__*/_jsx(Text, {
      style: [styles.title, {
        color: palette.textColor
      }],
      children: title
    }), subtitle ? /*#__PURE__*/_jsx(Text, {
      style: [styles.subtitle, {
        color: palette.mutedTextColor
      }],
      children: subtitle
    }) : null]
  });
}
const styles = StyleSheet.create({
  cardSurface: {
    borderWidth: 1,
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10
    },
    elevation: 4
  },
  media: {
    width: '100%',
    aspectRatio: 1.35,
    borderWidth: 1
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  column: {
    flexDirection: 'column'
  },
  priceTag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2
  },
  strikeText: {
    fontSize: 12,
    textDecorationLine: 'line-through'
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600'
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  metaValue: {
    flex: 1,
    fontSize: 13,
    textAlign: 'right'
  },
  actionButton: {
    minHeight: 42,
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700'
  },
  field: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18
  }
});
//# sourceMappingURL=index.js.map