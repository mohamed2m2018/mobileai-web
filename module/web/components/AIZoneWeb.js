"use strict";

import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { globalBlockRegistry, toBlockDefinition } from "../../core/BlockRegistry.js";
import { ZoneRegistryContext } from "../../core/ZoneRegistry.js";
import { useRichUITheme } from "../../components/rich-content/RichUIContext.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const AIZoneWebStateContext = /*#__PURE__*/React.createContext({
  simplified: false
});
function hideLowPriorityChildren(zoneElement) {
  const hidden = Array.from(zoneElement.querySelectorAll('[data-ai-priority="low"]'));
  hidden.forEach(node => {
    if (!node.dataset.mobileaiOriginalDisplay) {
      node.dataset.mobileaiOriginalDisplay = node.style.display || '';
    }
    node.style.display = 'none';
  });
}
function restoreLowPriorityChildren(zoneElement) {
  const hidden = Array.from(zoneElement.querySelectorAll('[data-mobileai-original-display]'));
  hidden.forEach(node => {
    node.style.display = node.dataset.mobileaiOriginalDisplay || '';
    delete node.dataset.mobileaiOriginalDisplay;
  });
}
export function AIZoneWeb({
  id,
  allowHighlight,
  allowInjectHint,
  allowSimplify,
  allowInjectBlock,
  allowInjectCard,
  interventionEligible,
  proactiveIntervention,
  blocks,
  templates,
  children,
  style,
  className
}) {
  const zoneRef = useRef(null);
  const registry = useContext(ZoneRegistryContext);
  const theme = useRichUITheme('zone');
  const [simplified, setSimplified] = useState(false);
  const [injectedBlock, setInjectedBlock] = useState(null);
  const [blockLifecycle, setBlockLifecycle] = useState('dismissible');
  const normalizedBlocks = useMemo(() => [...(Array.isArray(blocks) ? blocks : []), ...(Array.isArray(templates) ? templates : []).map(template => toBlockDefinition(template, {
    allowedPlacements: ['chat', 'zone'],
    interventionEligible: false
  }))], [blocks, templates]);
  useEffect(() => {
    registry.register({
      id,
      allowHighlight,
      allowInjectHint,
      allowSimplify,
      allowInjectBlock,
      allowInjectCard,
      interventionEligible,
      proactiveIntervention,
      blocks: normalizedBlocks,
      templates
    }, zoneRef);
    return () => registry.unregister(id);
  }, [allowHighlight, allowInjectBlock, allowInjectCard, allowInjectHint, allowSimplify, id, interventionEligible, normalizedBlocks, proactiveIntervention, registry, templates]);
  useEffect(() => {
    normalizedBlocks.forEach(definition => {
      globalBlockRegistry.register(definition);
    });
  }, [normalizedBlocks]);
  useEffect(() => {
    const zone = registry.get(id);
    if (!zone) return;
    zone._controller = {
      simplify: () => {
        if (zoneRef.current) {
          hideLowPriorityChildren(zoneRef.current);
        }
        setSimplified(true);
      },
      restore: () => {
        if (zoneRef.current) {
          restoreLowPriorityChildren(zoneRef.current);
        }
        setSimplified(false);
        setInjectedBlock(null);
      },
      injectCard: card => {
        setBlockLifecycle('dismissible');
        setInjectedBlock(card);
      },
      renderBlock: (block, lifecycle = 'dismissible') => {
        setBlockLifecycle(lifecycle);
        setInjectedBlock(block);
      }
    };
  }, [id, registry]);
  return /*#__PURE__*/_jsx("div", {
    ref: zoneRef,
    className: className,
    "data-mobileai-zone-id": id,
    style: style,
    children: /*#__PURE__*/_jsxs(AIZoneWebStateContext.Provider, {
      value: {
        simplified
      },
      children: [children, injectedBlock ? /*#__PURE__*/_jsxs("div", {
        style: {
          position: 'relative',
          marginTop: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.shape.cardRadius,
          border: `1px solid ${theme.colors.subtleBorder}`,
          background: theme.colors.zoneWrapper,
          boxShadow: '0 12px 28px rgba(20, 18, 15, 0.09)'
        },
        children: [injectedBlock, blockLifecycle !== 'persistent' ? /*#__PURE__*/_jsx("button", {
          type: "button",
          onClick: () => setInjectedBlock(null),
          style: {
            position: 'absolute',
            top: 10,
            right: 10,
            width: 30,
            height: 30,
            borderRadius: 999,
            border: 'none',
            cursor: 'pointer',
            background: theme.colors.zoneDismissBackground,
            color: theme.colors.zoneDismissText,
            fontSize: 18,
            lineHeight: '30px'
          },
          "aria-label": "Dismiss AI block",
          children: "\xD7"
        }) : null]
      }) : null, simplified ? /*#__PURE__*/_jsx("button", {
        type: "button",
        onClick: () => {
          if (zoneRef.current) {
            restoreLowPriorityChildren(zoneRef.current);
          }
          setSimplified(false);
        },
        style: {
          marginTop: theme.spacing.xs,
          borderRadius: theme.shape.controlRadius,
          border: 'none',
          background: theme.colors.floatingControls,
          color: theme.colors.linkText,
          padding: '10px 14px',
          fontWeight: 600,
          cursor: 'pointer'
        },
        children: "Show all options"
      }) : null]
    })
  });
}
//# sourceMappingURL=AIZoneWeb.js.map