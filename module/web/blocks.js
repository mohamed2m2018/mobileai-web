"use strict";

import React, { useMemo, useState } from 'react';
import { useActionBridge } from "../core/ActionBridge.js";
import { useRichUITheme } from "../components/rich-content/RichUIContext.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function cardStyle(theme) {
  return {
    background: theme.colors.blockSurface,
    border: `1px solid ${theme.colors.subtleBorder}`,
    borderRadius: theme.shape.cardRadius,
    padding: theme.spacing.lg,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    boxShadow: '0 14px 38px rgba(20, 18, 15, 0.08)',
    color: theme.colors.primaryText
  };
}
function actionButtonStyle(theme, variant = 'primary') {
  if (variant === 'chip') {
    return {
      borderRadius: theme.shape.chipRadius,
      border: `1px solid ${theme.colors.chipOutlinedBorder}`,
      background: theme.colors.blockSurface,
      color: theme.colors.chipOutlinedText,
      padding: '8px 12px',
      fontSize: 12,
      fontWeight: 700,
      cursor: 'pointer'
    };
  }
  if (variant === 'secondary') {
    return {
      borderRadius: theme.shape.controlRadius,
      border: `1px solid ${theme.colors.subtleBorder}`,
      background: theme.colors.mutedSurface,
      color: theme.colors.primaryText,
      padding: '10px 14px',
      fontSize: 13,
      fontWeight: 700,
      cursor: 'pointer'
    };
  }
  return {
    borderRadius: theme.shape.controlRadius,
    border: 'none',
    background: theme.colors.ctaAccent,
    color: theme.colors.inverseText,
    padding: '10px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer'
  };
}
function ActionButtons({
  actions = [],
  sourceBlockId
}) {
  const theme = useRichUITheme();
  const bridge = useActionBridge();
  if (!actions.length) return null;
  return /*#__PURE__*/_jsx("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: theme.spacing.xs
    },
    children: actions.map(action => /*#__PURE__*/_jsx("button", {
      type: "button",
      style: actionButtonStyle(theme, action.variant),
      onClick: () => {
        void bridge.invoke({
          actionId: action.id,
          sourceBlockId
        });
      },
      children: action.label
    }, action.id))
  });
}
export function ProductCardWeb({
  title,
  name,
  subtitle,
  description,
  imageUrl,
  image,
  price,
  badges = [],
  actions = []
}) {
  const theme = useRichUITheme();
  const resolvedTitle = title || name || 'Recommended item';
  const resolvedImage = imageUrl || image;
  return /*#__PURE__*/_jsxs("div", {
    style: cardStyle(theme),
    children: [resolvedImage ? /*#__PURE__*/_jsxs("div", {
      style: {
        position: 'relative'
      },
      children: [/*#__PURE__*/_jsx("img", {
        src: resolvedImage,
        alt: resolvedTitle,
        style: {
          width: '100%',
          aspectRatio: '1.7 / 1',
          objectFit: 'cover',
          display: 'block',
          borderRadius: theme.shape.mediaRadius,
          border: `1px solid ${theme.colors.mediaBorder}`
        }
      }), price ? /*#__PURE__*/_jsx("div", {
        style: {
          position: 'absolute',
          right: theme.spacing.sm,
          bottom: theme.spacing.sm,
          background: 'rgba(20, 18, 16, 0.86)',
          color: theme.colors.inverseText,
          borderRadius: theme.shape.pillRadius,
          padding: '10px 14px',
          fontSize: theme.typography.priceSize,
          fontWeight: 800
        },
        children: price
      }) : null]
    }) : null, /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs
      },
      children: [subtitle ? /*#__PURE__*/_jsx("div", {
        style: {
          fontSize: theme.typography.captionSize,
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.mutedText
        },
        children: subtitle
      }) : null, /*#__PURE__*/_jsx("div", {
        style: {
          fontSize: theme.typography.titleSize,
          fontWeight: 800,
          lineHeight: 1.15
        },
        children: resolvedTitle
      }), !resolvedImage && price ? /*#__PURE__*/_jsx("div", {
        style: {
          width: 'fit-content',
          borderRadius: theme.shape.pillRadius,
          background: theme.colors.priceTagBackground,
          border: `1px solid ${theme.colors.priceTagBorder}`,
          color: theme.colors.priceTagText,
          padding: '8px 12px',
          fontSize: theme.typography.priceSize,
          fontWeight: 800
        },
        children: price
      }) : null, description ? /*#__PURE__*/_jsx("div", {
        style: {
          fontSize: theme.typography.bodySize,
          color: theme.colors.secondaryText,
          lineHeight: 1.5
        },
        children: description
      }) : null, badges.length ? /*#__PURE__*/_jsx("div", {
        style: {
          display: 'flex',
          flexWrap: 'wrap',
          gap: theme.spacing.xs
        },
        children: badges.map(badge => /*#__PURE__*/_jsx("span", {
          style: {
            borderRadius: theme.shape.chipRadius,
            background: theme.colors.chipFilledBackground,
            color: theme.colors.chipFilledText,
            padding: '6px 10px',
            fontSize: theme.typography.captionSize,
            fontWeight: 700
          },
          children: badge
        }, badge))
      }) : null]
    }), /*#__PURE__*/_jsx(ActionButtons, {
      actions: actions,
      sourceBlockId: "ProductCard"
    })]
  });
}
export function FactCardWeb({
  title = 'Details',
  body,
  facts = [],
  actions = []
}) {
  const theme = useRichUITheme();
  return /*#__PURE__*/_jsxs("div", {
    style: cardStyle(theme),
    children: [/*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.xs
      },
      children: [/*#__PURE__*/_jsx("div", {
        style: {
          fontSize: theme.typography.titleSize,
          fontWeight: 800
        },
        children: title
      }), body ? /*#__PURE__*/_jsx("div", {
        style: {
          fontSize: theme.typography.bodySize,
          color: theme.colors.secondaryText,
          lineHeight: 1.55
        },
        children: body
      }) : null]
    }), facts.length ? /*#__PURE__*/_jsx("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: theme.spacing.sm
      },
      children: facts.map(fact => /*#__PURE__*/_jsxs("div", {
        style: {
          background: theme.colors.raisedSurface,
          border: `1px solid ${theme.colors.subtleBorder}`,
          borderRadius: theme.shape.controlRadius,
          padding: theme.spacing.sm
        },
        children: [/*#__PURE__*/_jsx("div", {
          style: {
            fontSize: theme.typography.captionSize,
            color: theme.colors.mutedText,
            fontWeight: 700
          },
          children: fact.label
        }), /*#__PURE__*/_jsx("div", {
          style: {
            marginTop: 4,
            fontSize: theme.typography.bodySize,
            fontWeight: 700
          },
          children: fact.value
        })]
      }, `${fact.label}-${fact.value}`))
    }) : null, /*#__PURE__*/_jsx(ActionButtons, {
      actions: actions,
      sourceBlockId: "FactCard"
    })]
  });
}
export function ActionCardWeb({
  title = 'Next step',
  body,
  primaryAction,
  secondaryAction,
  chips = []
}) {
  const theme = useRichUITheme();
  const actions = useMemo(() => {
    const list = [];
    if (primaryAction) list.push({
      ...primaryAction,
      variant: 'primary'
    });
    if (secondaryAction) list.push({
      ...secondaryAction,
      variant: 'secondary'
    });
    chips.forEach(chip => list.push({
      ...chip,
      variant: 'chip'
    }));
    return list;
  }, [chips, primaryAction, secondaryAction]);
  return /*#__PURE__*/_jsxs("div", {
    style: cardStyle(theme),
    children: [/*#__PURE__*/_jsx("div", {
      style: {
        width: 40,
        height: 4,
        borderRadius: 999,
        background: theme.colors.primaryAccent
      }
    }), /*#__PURE__*/_jsx("div", {
      style: {
        fontSize: theme.typography.titleSize,
        fontWeight: 800
      },
      children: title
    }), body ? /*#__PURE__*/_jsx("div", {
      style: {
        fontSize: theme.typography.bodySize,
        color: theme.colors.secondaryText,
        lineHeight: 1.55
      },
      children: body
    }) : null, /*#__PURE__*/_jsx(ActionButtons, {
      actions: actions,
      sourceBlockId: "ActionCard"
    })]
  });
}
export function ComparisonCardWeb({
  title = 'Compare options',
  items = []
}) {
  const theme = useRichUITheme();
  return /*#__PURE__*/_jsxs("div", {
    style: cardStyle(theme),
    children: [/*#__PURE__*/_jsx("div", {
      style: {
        fontSize: theme.typography.titleSize,
        fontWeight: 800
      },
      children: title
    }), /*#__PURE__*/_jsx("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm
      },
      children: items.map((item, index) => /*#__PURE__*/_jsxs("div", {
        style: {
          borderRadius: theme.shape.controlRadius,
          border: `1px solid ${theme.colors.subtleBorder}`,
          background: theme.colors.raisedSurface,
          padding: theme.spacing.sm,
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.xs
        },
        children: [item.imageUrl || item.image ? /*#__PURE__*/_jsx("img", {
          src: item.imageUrl || item.image,
          alt: item.title || item.name || `Option ${index + 1}`,
          style: {
            width: '100%',
            aspectRatio: '1.8 / 1',
            objectFit: 'cover',
            borderRadius: theme.shape.mediaRadius,
            border: `1px solid ${theme.colors.mediaBorder}`
          }
        }) : null, /*#__PURE__*/_jsxs("div", {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            gap: theme.spacing.sm
          },
          children: [/*#__PURE__*/_jsxs("div", {
            children: [/*#__PURE__*/_jsx("div", {
              style: {
                fontSize: theme.typography.captionSize,
                color: theme.colors.mutedText,
                fontWeight: 700
              },
              children: String(index + 1).padStart(2, '0')
            }), /*#__PURE__*/_jsx("div", {
              style: {
                fontSize: theme.typography.subtitleSize,
                fontWeight: 800
              },
              children: item.title || item.name || `Option ${index + 1}`
            }), item.subtitle ? /*#__PURE__*/_jsx("div", {
              style: {
                fontSize: theme.typography.metaSize,
                color: theme.colors.mutedText
              },
              children: item.subtitle
            }) : null]
          }), item.price ? /*#__PURE__*/_jsx("div", {
            style: {
              borderRadius: theme.shape.pillRadius,
              background: theme.colors.priceTagBackground,
              border: `1px solid ${theme.colors.priceTagBorder}`,
              color: theme.colors.priceTagText,
              padding: '8px 12px',
              fontWeight: 800,
              height: 'fit-content'
            },
            children: item.price
          }) : null]
        }), item.summary || item.description ? /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: theme.typography.bodySize,
            color: theme.colors.secondaryText,
            lineHeight: 1.5
          },
          children: item.summary || item.description
        }) : null]
      }, (item.title || item.name || `item-${index}`) + index))
    })]
  });
}
export function FormCardWeb({
  title = 'Confirm details',
  body,
  fields = [],
  submitAction,
  cancelAction
}) {
  const theme = useRichUITheme();
  const bridge = useActionBridge();
  const [values, setValues] = useState(Object.fromEntries(fields.map(field => [field.id, field.value ?? (field.type === 'toggle' ? false : '')])));
  return /*#__PURE__*/_jsxs("div", {
    style: cardStyle(theme),
    children: [/*#__PURE__*/_jsx("div", {
      style: {
        fontSize: theme.typography.titleSize,
        fontWeight: 800
      },
      children: title
    }), body ? /*#__PURE__*/_jsx("div", {
      style: {
        fontSize: theme.typography.bodySize,
        color: theme.colors.secondaryText,
        lineHeight: 1.55
      },
      children: body
    }) : null, /*#__PURE__*/_jsx("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: theme.spacing.sm
      },
      children: fields.map(field => {
        const commonLabel = /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: theme.typography.metaSize,
            fontWeight: 700,
            color: theme.colors.primaryText
          },
          children: field.label
        });
        const commonStyle = {
          width: '100%',
          borderRadius: theme.shape.controlRadius,
          border: `1px solid ${theme.colors.fieldBorder}`,
          background: theme.colors.fieldBackground,
          color: theme.colors.primaryText,
          padding: '10px 12px',
          fontSize: theme.typography.bodySize,
          boxSizing: 'border-box'
        };
        if (field.type === 'textarea') {
          return /*#__PURE__*/_jsxs("label", {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            },
            children: [commonLabel, /*#__PURE__*/_jsx("textarea", {
              value: String(values[field.id] ?? ''),
              placeholder: field.placeholder,
              style: {
                ...commonStyle,
                minHeight: 90,
                resize: 'vertical'
              },
              onChange: event => {
                setValues(prev => ({
                  ...prev,
                  [field.id]: event.target.value
                }));
              }
            })]
          }, field.id);
        }
        if (field.type === 'toggle') {
          return /*#__PURE__*/_jsxs("label", {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
              borderRadius: theme.shape.controlRadius,
              border: `1px solid ${theme.colors.subtleBorder}`,
              background: theme.colors.raisedSurface,
              padding: theme.spacing.sm
            },
            children: [/*#__PURE__*/_jsx("span", {
              style: {
                fontSize: theme.typography.bodySize,
                fontWeight: 700
              },
              children: field.label
            }), /*#__PURE__*/_jsx("input", {
              type: "checkbox",
              checked: Boolean(values[field.id]),
              onChange: event => {
                setValues(prev => ({
                  ...prev,
                  [field.id]: event.target.checked
                }));
              }
            })]
          }, field.id);
        }
        if (field.type === 'select') {
          return /*#__PURE__*/_jsxs("label", {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            },
            children: [commonLabel, /*#__PURE__*/_jsxs("select", {
              value: String(values[field.id] ?? ''),
              style: commonStyle,
              onChange: event => {
                setValues(prev => ({
                  ...prev,
                  [field.id]: event.target.value
                }));
              },
              children: [/*#__PURE__*/_jsx("option", {
                value: "",
                children: field.placeholder || 'Select an option'
              }), (field.options || []).map(option => /*#__PURE__*/_jsx("option", {
                value: option.value,
                children: option.label
              }, option.value))]
            })]
          }, field.id);
        }
        return /*#__PURE__*/_jsxs("label", {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          },
          children: [commonLabel, /*#__PURE__*/_jsx("input", {
            type: "text",
            value: String(values[field.id] ?? ''),
            placeholder: field.placeholder,
            style: commonStyle,
            onChange: event => {
              setValues(prev => ({
                ...prev,
                [field.id]: event.target.value
              }));
            }
          })]
        }, field.id);
      })
    }), /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        gap: theme.spacing.xs,
        flexWrap: 'wrap'
      },
      children: [submitAction ? /*#__PURE__*/_jsx("button", {
        type: "button",
        style: actionButtonStyle(theme, 'primary'),
        onClick: () => {
          void bridge.invoke({
            actionId: submitAction.id,
            values,
            sourceBlockId: 'FormCard'
          });
        },
        children: submitAction.label
      }) : null, cancelAction ? /*#__PURE__*/_jsx("button", {
        type: "button",
        style: actionButtonStyle(theme, 'secondary'),
        onClick: () => {
          void bridge.invoke({
            actionId: cancelAction.id,
            values,
            sourceBlockId: 'FormCard'
          });
        },
        children: cancelAction.label
      }) : null]
    })]
  });
}
ProductCardWeb.displayName = 'ProductCard';
FactCardWeb.displayName = 'FactCard';
ActionCardWeb.displayName = 'ActionCard';
ComparisonCardWeb.displayName = 'ComparisonCard';
FormCardWeb.displayName = 'FormCard';
export const webBlockDefinitions = [{
  name: 'ProductCard',
  component: ProductCardWeb,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'decision_support',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
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
    badges: {
      type: 'array'
    },
    actions: {
      type: 'array'
    }
  }
}, {
  name: 'FactCard',
  component: FactCardWeb,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'contextual_help',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
    },
    body: {
      type: 'string'
    },
    facts: {
      type: 'array'
    },
    actions: {
      type: 'array'
    }
  }
}, {
  name: 'ActionCard',
  component: ActionCardWeb,
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
    primaryAction: {
      type: 'object'
    },
    secondaryAction: {
      type: 'object'
    },
    chips: {
      type: 'array'
    }
  }
}, {
  name: 'ComparisonCard',
  component: ComparisonCardWeb,
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
  }
}, {
  name: 'FormCard',
  component: FormCardWeb,
  allowedPlacements: ['chat', 'zone'],
  interventionType: 'error_prevention',
  interventionEligible: true,
  propSchema: {
    title: {
      type: 'string'
    },
    body: {
      type: 'string'
    },
    fields: {
      type: 'array'
    },
    submitAction: {
      type: 'object'
    },
    cancelAction: {
      type: 'object'
    }
  }
}];
//# sourceMappingURL=blocks.js.map