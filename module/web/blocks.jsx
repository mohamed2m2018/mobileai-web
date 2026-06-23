'use strict';

import React, { useMemo, useState } from 'react';
import { useActionBridge } from '../core/ActionBridge.js';
import { useRichUITheme } from '../components/rich-content/RichUIContext.js';
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
    color: theme.colors.primaryText,
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
      cursor: 'pointer',
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
      cursor: 'pointer',
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
    cursor: 'pointer',
  };
}
function ActionButtons({ actions = [], sourceBlockId }) {
  const theme = useRichUITheme();
  const bridge = useActionBridge();
  if (!actions.length) return null;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.xs,
      }}
    >
      {actions.map((action) => (
        <button
          type="button"
          style={actionButtonStyle(theme, action.variant)}
          onClick={() => {
            void bridge.invoke({
              actionId: action.id,
              sourceBlockId,
            });
          }}
          key={action.id}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
export function ProductCardWeb({
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
}) {
  // U6(c) — hero-image layout matching RN ProductCard: full-bleed image + scrim
  // + overlaid subtitle/title + floating price tag, then a content block with an
  // "AI pick" kicker, description, and badges. Falls back to the clean no-image
  // layout (price moves into the body) when there's no usable image.
  const theme = useRichUITheme();
  // If the supplied image URL fails to load (e.g. a hallucinated/relative URL),
  // drop it so the card degrades to the clean no-image layout.
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedTitle = title || name || 'Recommended item';
  const resolvedImage = imgFailed ? null : imageUrl || image;
  const accent = theme.colors.primaryAccent;
  return (
    <div style={{ ...cardStyle(theme), padding: 0, overflow: 'hidden', gap: 0 }}>
      {resolvedImage ? (
        <div
          style={{
            position: 'relative',
          }}
        >
          <img
            src={resolvedImage}
            alt={resolvedTitle}
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              aspectRatio: '1.6 / 1',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          {/* Scrim so the overlaid title stays legible on any image. */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(180deg, rgba(12,10,8,0.06) 30%, rgba(12,10,8,0.62) 100%)',
            }}
          />
          {price ? (
            <div
              style={{
                position: 'absolute',
                right: 14,
                bottom: 14,
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                background: 'rgba(23, 20, 17, 0.86)',
                color: theme.colors.inverseText,
                borderRadius: theme.shape.pillRadius,
                padding: '9px 13px',
                fontSize: theme.typography.priceSize,
                fontWeight: 800,
              }}
            >
              <span>{price}</span>
              {compareAtPrice ? (
                <span
                  style={{
                    fontSize: theme.typography.captionSize,
                    fontWeight: 600,
                    opacity: 0.7,
                    textDecoration: 'line-through',
                  }}
                >
                  {compareAtPrice}
                </span>
              ) : null}
            </div>
          ) : null}
          {/* Overlaid eyebrow + title. */}
          <div
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              pointerEvents: 'none',
            }}
          >
            {subtitle ? (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.1,
                  textTransform: 'uppercase',
                  color: theme.colors.inverseText,
                  opacity: 0.88,
                }}
              >
                {subtitle}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 26,
                lineHeight: 1.1,
                fontWeight: 800,
                letterSpacing: -0.6,
                color: theme.colors.inverseText,
                maxWidth: '78%',
              }}
            >
              {resolvedTitle}
            </div>
          </div>
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        }}
      >
        {/* "AI pick" kicker. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 28,
              height: 4,
              borderRadius: 999,
              background: accent,
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.9,
              textTransform: 'uppercase',
              color: theme.colors.mutedText,
            }}
          >
            {'AI pick'}
          </div>
        </div>
        {/* When there's no hero image, the title/price live in the body. */}
        {!resolvedImage ? (
          <div
            style={{
              fontSize: theme.typography.titleSize,
              fontWeight: 800,
              lineHeight: 1.15,
            }}
          >
            {resolvedTitle}
          </div>
        ) : null}
        {!resolvedImage && price ? (
          <div
            style={{
              width: 'fit-content',
              borderRadius: theme.shape.pillRadius,
              background: theme.colors.priceTagBackground,
              border: `1px solid ${theme.colors.priceTagBorder}`,
              color: theme.colors.priceTagText,
              padding: '8px 12px',
              fontSize: theme.typography.priceSize,
              fontWeight: 800,
            }}
          >
            {price}
          </div>
        ) : null}
        {description ? (
          <div
            style={{
              fontSize: theme.typography.bodySize,
              color: theme.colors.secondaryText,
              lineHeight: 1.5,
            }}
          >
            {description}
          </div>
        ) : null}
        {badges.length ? (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: theme.spacing.xs,
            }}
          >
            {badges.map((badge) => (
              <span
                style={{
                  borderRadius: theme.shape.chipRadius,
                  background: theme.colors.chipFilledBackground,
                  color: theme.colors.chipFilledText,
                  padding: '6px 10px',
                  fontSize: theme.typography.captionSize,
                  fontWeight: 700,
                }}
                key={badge}
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        <ActionButtons actions={actions} sourceBlockId="ProductCard" />
      </div>
    </div>
  );
}
export function FactCardWeb({ title = 'Details', body, facts = [], actions = [] }) {
  const theme = useRichUITheme();
  return (
    <div style={cardStyle(theme)}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.xs,
        }}
      >
        <div
          style={{
            fontSize: theme.typography.titleSize,
            fontWeight: 800,
          }}
        >
          {title}
        </div>
        {body ? (
          <div
            style={{
              fontSize: theme.typography.bodySize,
              color: theme.colors.secondaryText,
              lineHeight: 1.55,
            }}
          >
            {body}
          </div>
        ) : null}
      </div>
      {facts.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: theme.spacing.sm,
          }}
        >
          {facts.map((fact) => (
            <div
              style={{
                background: theme.colors.raisedSurface,
                border: `1px solid ${theme.colors.subtleBorder}`,
                borderRadius: theme.shape.controlRadius,
                padding: theme.spacing.sm,
              }}
              key={`${fact.label}-${fact.value}`}
            >
              <div
                style={{
                  fontSize: theme.typography.captionSize,
                  color: theme.colors.mutedText,
                  fontWeight: 700,
                }}
              >
                {fact.label}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: theme.typography.bodySize,
                  fontWeight: 700,
                }}
              >
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <ActionButtons actions={actions} sourceBlockId="FactCard" />
    </div>
  );
}
export function ActionCardWeb({ title = 'Next step', body, primaryAction, secondaryAction, chips = [] }) {
  const theme = useRichUITheme();
  const actions = useMemo(() => {
    const list = [];
    if (primaryAction)
      list.push({
        ...primaryAction,
        variant: 'primary',
      });
    if (secondaryAction)
      list.push({
        ...secondaryAction,
        variant: 'secondary',
      });
    chips.forEach((chip) =>
      list.push({
        ...chip,
        variant: 'chip',
      }),
    );
    return list;
  }, [chips, primaryAction, secondaryAction]);
  return (
    <div style={cardStyle(theme)}>
      <div
        style={{
          width: 40,
          height: 4,
          borderRadius: 999,
          background: theme.colors.primaryAccent,
        }}
      />
      <div
        style={{
          fontSize: theme.typography.titleSize,
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      {body ? (
        <div
          style={{
            fontSize: theme.typography.bodySize,
            color: theme.colors.secondaryText,
            lineHeight: 1.55,
          }}
        >
          {body}
        </div>
      ) : null}
      <ActionButtons actions={actions} sourceBlockId="ActionCard" />
    </div>
  );
}
export function ComparisonCardWeb({ title = 'Compare options', items = [] }) {
  const theme = useRichUITheme();
  return (
    <div style={cardStyle(theme)}>
      <div
        style={{
          fontSize: theme.typography.titleSize,
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
        }}
      >
        {items.map((item, index) => (
          <div
            style={{
              borderRadius: theme.shape.controlRadius,
              border: `1px solid ${theme.colors.subtleBorder}`,
              background: theme.colors.raisedSurface,
              padding: theme.spacing.sm,
              display: 'flex',
              flexDirection: 'column',
              gap: theme.spacing.xs,
            }}
            key={(item.title || item.name || `item-${index}`) + index}
          >
            {item.imageUrl || item.image ? (
              <img
                src={item.imageUrl || item.image}
                alt={item.title || item.name || `Option ${index + 1}`}
                style={{
                  width: '100%',
                  aspectRatio: '1.8 / 1',
                  objectFit: 'cover',
                  borderRadius: theme.shape.mediaRadius,
                  border: `1px solid ${theme.colors.mediaBorder}`,
                }}
              />
            ) : null}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: theme.spacing.sm,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: theme.typography.captionSize,
                    color: theme.colors.mutedText,
                    fontWeight: 700,
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </div>
                <div
                  style={{
                    fontSize: theme.typography.subtitleSize,
                    fontWeight: 800,
                  }}
                >
                  {item.title || item.name || `Option ${index + 1}`}
                </div>
                {item.subtitle ? (
                  <div
                    style={{
                      fontSize: theme.typography.metaSize,
                      color: theme.colors.mutedText,
                    }}
                  >
                    {item.subtitle}
                  </div>
                ) : null}
              </div>
              {item.price ? (
                <div
                  style={{
                    borderRadius: theme.shape.pillRadius,
                    background: theme.colors.priceTagBackground,
                    border: `1px solid ${theme.colors.priceTagBorder}`,
                    color: theme.colors.priceTagText,
                    padding: '8px 12px',
                    fontWeight: 800,
                    height: 'fit-content',
                  }}
                >
                  {item.price}
                </div>
              ) : null}
            </div>
            {item.body || item.summary || item.description ? (
              <div
                style={{
                  fontSize: theme.typography.bodySize,
                  color: theme.colors.secondaryText,
                  lineHeight: 1.5,
                }}
              >
                {item.body || item.summary || item.description}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
export function FormCardWeb({ title = 'Confirm details', body, fields = [], submitAction, cancelAction }) {
  const theme = useRichUITheme();
  const bridge = useActionBridge();
  const [values, setValues] = useState(
    Object.fromEntries(fields.map((field) => [field.id, field.value ?? (field.type === 'toggle' ? false : '')])),
  );
  return (
    <div style={cardStyle(theme)}>
      <div
        style={{
          fontSize: theme.typography.titleSize,
          fontWeight: 800,
        }}
      >
        {title}
      </div>
      {body ? (
        <div
          style={{
            fontSize: theme.typography.bodySize,
            color: theme.colors.secondaryText,
            lineHeight: 1.55,
          }}
        >
          {body}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: theme.spacing.sm,
        }}
      >
        {fields.map((field) => {
          const commonLabel = (
            <div
              style={{
                fontSize: theme.typography.metaSize,
                fontWeight: 700,
                color: theme.colors.primaryText,
              }}
            >
              {field.label}
            </div>
          );
          const commonStyle = {
            width: '100%',
            borderRadius: theme.shape.controlRadius,
            border: `1px solid ${theme.colors.fieldBorder}`,
            background: theme.colors.fieldBackground,
            color: theme.colors.primaryText,
            padding: '10px 12px',
            fontSize: theme.typography.bodySize,
            boxSizing: 'border-box',
          };
          if (field.type === 'textarea') {
            return (
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
                key={field.id}
              >
                {commonLabel}
                <textarea
                  value={String(values[field.id] ?? '')}
                  placeholder={field.placeholder}
                  style={{
                    ...commonStyle,
                    minHeight: 90,
                    resize: 'vertical',
                  }}
                  onChange={(event) => {
                    setValues((prev) => ({
                      ...prev,
                      [field.id]: event.target.value,
                    }));
                  }}
                />
              </label>
            );
          }
          if (field.type === 'toggle') {
            return (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                  borderRadius: theme.shape.controlRadius,
                  border: `1px solid ${theme.colors.subtleBorder}`,
                  background: theme.colors.raisedSurface,
                  padding: theme.spacing.sm,
                }}
                key={field.id}
              >
                <span
                  style={{
                    fontSize: theme.typography.bodySize,
                    fontWeight: 700,
                  }}
                >
                  {field.label}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(values[field.id])}
                  onChange={(event) => {
                    setValues((prev) => ({
                      ...prev,
                      [field.id]: event.target.checked,
                    }));
                  }}
                />
              </label>
            );
          }
          if (field.type === 'select') {
            return (
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
                key={field.id}
              >
                {commonLabel}
                <select
                  value={String(values[field.id] ?? '')}
                  style={commonStyle}
                  onChange={(event) => {
                    setValues((prev) => ({
                      ...prev,
                      [field.id]: event.target.value,
                    }));
                  }}
                >
                  <option value="">{field.placeholder || 'Select an option'}</option>
                  {(field.options || []).map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return (
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
              key={field.id}
            >
              {commonLabel}
              <input
                type="text"
                value={String(values[field.id] ?? '')}
                placeholder={field.placeholder}
                style={commonStyle}
                onChange={(event) => {
                  setValues((prev) => ({
                    ...prev,
                    [field.id]: event.target.value,
                  }));
                }}
              />
            </label>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          gap: theme.spacing.xs,
          flexWrap: 'wrap',
        }}
      >
        {submitAction ? (
          <button
            type="button"
            style={actionButtonStyle(theme, 'primary')}
            onClick={() => {
              void bridge.invoke({
                actionId: submitAction.id,
                values,
                sourceBlockId: 'FormCard',
              });
            }}
          >
            {submitAction.label}
          </button>
        ) : null}
        {cancelAction ? (
          <button
            type="button"
            style={actionButtonStyle(theme, 'secondary')}
            onClick={() => {
              void bridge.invoke({
                actionId: cancelAction.id,
                values,
                sourceBlockId: 'FormCard',
              });
            }}
          >
            {cancelAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
ProductCardWeb.displayName = 'ProductCard';
FactCardWeb.displayName = 'FactCard';
ActionCardWeb.displayName = 'ActionCard';
ComparisonCardWeb.displayName = 'ComparisonCard';
FormCardWeb.displayName = 'FormCard';
export const webBlockDefinitions = [
  {
    name: 'ProductCard',
    component: ProductCardWeb,
    allowedPlacements: ['chat', 'zone'],
    interventionType: 'decision_support',
    interventionEligible: true,
    propSchema: {
      title: {
        type: 'string',
        description:
          'The EXACT product name as shown on the page (e.g. "Nimbus Smart Watch"). Required for a recommendation — never use a generic placeholder like "Recommended item".',
      },
      name: {
        type: 'string',
        description: 'Alias for title — the exact product name.',
      },
      subtitle: {
        type: 'string',
        description: 'Optional short brand or category line.',
      },
      description: {
        type: 'string',
        description: 'A concise, factual description of the product (avoid invented claims).',
      },
      imageUrl: {
        type: 'string',
        description:
          'Only a real image URL that actually appears on the current page. If you do not have a real URL, OMIT this prop — never invent, guess, or use an example URL.',
      },
      image: {
        type: 'string',
        description: 'Alias for imageUrl — only a real URL, omit if unknown.',
      },
      price: {
        type: 'string',
        description: 'The product price exactly as displayed, e.g. "$199.00".',
      },
      compareAtPrice: {
        type: 'string',
        description: 'Optional original/strike-through price exactly as displayed, e.g. "$249.00".',
      },
      badges: {
        type: 'array',
      },
      actions: {
        type: 'array',
      },
    },
  },
  {
    name: 'FactCard',
    component: FactCardWeb,
    allowedPlacements: ['chat', 'zone'],
    interventionType: 'contextual_help',
    interventionEligible: true,
    propSchema: {
      title: {
        type: 'string',
      },
      body: {
        type: 'string',
      },
      facts: {
        type: 'array',
      },
      actions: {
        type: 'array',
      },
    },
  },
  {
    name: 'ActionCard',
    component: ActionCardWeb,
    allowedPlacements: ['chat', 'zone'],
    interventionType: 'recovery',
    interventionEligible: true,
    propSchema: {
      title: {
        type: 'string',
      },
      body: {
        type: 'string',
      },
      primaryAction: {
        type: 'object',
      },
      secondaryAction: {
        type: 'object',
      },
      chips: {
        type: 'array',
      },
    },
  },
  {
    name: 'ComparisonCard',
    component: ComparisonCardWeb,
    allowedPlacements: ['chat', 'zone'],
    interventionType: 'decision_support',
    interventionEligible: true,
    propSchema: {
      title: {
        type: 'string',
      },
      items: {
        type: 'array',
        required: true,
      },
    },
  },
  {
    name: 'FormCard',
    component: FormCardWeb,
    allowedPlacements: ['chat', 'zone'],
    interventionType: 'error_prevention',
    interventionEligible: true,
    propSchema: {
      title: {
        type: 'string',
      },
      body: {
        type: 'string',
      },
      fields: {
        type: 'array',
      },
      submitAction: {
        type: 'object',
      },
      cancelAction: {
        type: 'object',
      },
    },
  },
];
//# sourceMappingURL=blocks.js.map
