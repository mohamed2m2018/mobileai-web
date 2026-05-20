"use strict";

import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useActionBridge } from "../../core/ActionBridge.js";
import { useRichUITheme } from "../rich-content/RichUIContext.js";
import { ActionRow, CardSurface, FieldRow, SectionTitle } from "./primitives/index.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function FormCard({
  title = 'Complete the details',
  description,
  fields = [],
  submitActionId,
  cancelActionId,
  appearance
}) {
  const theme = useRichUITheme();
  const bridge = useActionBridge();
  const accentColor = appearance?.accentColor || theme.colors.primaryAccent;
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(field => [field.id, field.value || ''])));
  const actions = useMemo(() => [submitActionId ? {
    id: submitActionId,
    label: 'Submit',
    variant: 'primary'
  } : null, cancelActionId ? {
    id: cancelActionId,
    label: 'Cancel',
    variant: 'secondary'
  } : null].filter(Boolean), [submitActionId, cancelActionId]);
  return /*#__PURE__*/_jsxs(CardSurface, {
    appearance: appearance,
    children: [/*#__PURE__*/_jsxs(View, {
      style: [styles.headerPanel, {
        backgroundColor: appearance?.raisedSurfaceColor || theme.colors.raisedSurface,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: [/*#__PURE__*/_jsxs(View, {
        style: styles.headerRow,
        children: [/*#__PURE__*/_jsx(View, {
          style: [styles.headerDot, {
            backgroundColor: accentColor
          }]
        }), /*#__PURE__*/_jsx(Text, {
          style: [styles.headerEyebrow, {
            color: appearance?.mutedTextColor || theme.colors.mutedText
          }],
          children: "Quick input"
        })]
      }), /*#__PURE__*/_jsx(SectionTitle, {
        title: title,
        appearance: appearance
      })]
    }), description ? /*#__PURE__*/_jsx(Text, {
      style: [styles.description, {
        color: appearance?.textColor || theme.colors.primaryText
      }],
      children: description
    }) : null, /*#__PURE__*/_jsx(View, {
      style: [styles.fields, {
        backgroundColor: appearance?.raisedSurfaceColor || theme.colors.raisedSurface,
        borderColor: appearance?.borderColor || theme.colors.subtleBorder
      }],
      children: fields.map(field => /*#__PURE__*/_jsx(FieldRow, {
        label: field.label,
        placeholder: field.placeholder,
        value: values[field.id] || '',
        appearance: appearance,
        onChangeText: nextValue => {
          setValues(prev => ({
            ...prev,
            [field.id]: nextValue
          }));
        }
      }, field.id))
    }), /*#__PURE__*/_jsx(ActionRow, {
      actions: actions,
      appearance: appearance,
      onAction: actionId => {
        bridge.invoke({
          actionId,
          values
        });
      }
    })]
  });
}
FormCard.displayName = 'FormCard';
export const FormCardDefinition = {
  name: 'FormCard',
  component: FormCard,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'error_prevention',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
    },
    description: {
      type: 'string'
    },
    fields: {
      type: 'array',
      required: true
    },
    submitActionId: {
      type: 'string'
    },
    cancelActionId: {
      type: 'string'
    }
  },
  previewTextBuilder: props => [props.title, props.description].filter(part => typeof part === 'string').join(' — '),
  styleSlots: ['surface', 'fields', 'actions']
};
const styles = StyleSheet.create({
  headerPanel: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  headerDot: {
    width: 10,
    height: 10,
    borderRadius: 999
  },
  headerEyebrow: {
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
  fields: {
    gap: 12,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14
  }
});
//# sourceMappingURL=FormCard.js.map