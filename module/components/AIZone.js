"use strict";

import React, { useRef, useEffect, useContext, useState } from 'react';
import { View, StyleSheet, Pressable, Text, Animated } from 'react-native';
import { globalBlockRegistry, toBlockDefinition } from "../core/BlockRegistry.js";
import { ZoneRegistryContext } from "../core/ZoneRegistry.js";
import { useRichUITheme } from "./rich-content/RichUIContext.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// React context to broadcast simplified state down strictly to children
export const AIZoneStateContext = /*#__PURE__*/React.createContext({
  simplified: false
});

/**
 * Declarative boundary that grants the AI permission to modify its subtree.
 * Has zero visual impact by default.
 */
export function AIZone({
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
  style
}) {
  const zoneRef = useRef(null);
  const registry = useContext(ZoneRegistryContext);
  const theme = useRichUITheme('zone');

  // State managed by AI tools
  const [simplified, setSimplified] = useState(false);
  const [injectedBlock, setInjectedBlock] = useState(null);
  const [blockLifecycle, setBlockLifecycle] = useState('dismissible');
  const blockAnim = useRef(new Animated.Value(0)).current;
  const normalizedBlocks = [...(Array.isArray(blocks) ? blocks : []), ...(Array.isArray(templates) ? templates : []).map(template => toBlockDefinition(template, {
    allowedPlacements: ['chat', 'zone'],
    interventionEligible: false
  }))];
  useEffect(() => {
    // Register zone permissions on mount
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

    // Unregister on unmount
    return () => registry.unregister(id);
  }, [id, allowHighlight, allowInjectHint, allowSimplify, allowInjectBlock, allowInjectCard, interventionEligible, proactiveIntervention, normalizedBlocks, templates, registry]);
  useEffect(() => {
    normalizedBlocks.forEach(definition => {
      globalBlockRegistry.register(definition);
    });
  }, [normalizedBlocks]);

  // If the zone exposes an API to manipulate itself locally (outside of AI), 
  // we would attach it to the ref or a secondary context. For now, the tools 
  // will dispatch events or we can expose a global setter.
  // Actually, the easiest way for the AI tools to mutate this state is 
  // an EventEmitter or assigning a controller object to the registry.

  useEffect(() => {
    // Attach controller to the registry so tools can act on this specific mount instance
    const zone = registry.get(id);
    if (zone) {
      zone._controller = {
        simplify: () => setSimplified(true),
        restore: () => {
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
    }
  }, [id, registry]);
  useEffect(() => {
    if (injectedBlock) {
      blockAnim.setValue(0);
      Animated.timing(blockAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  }, [blockAnim, injectedBlock]);
  return /*#__PURE__*/_jsx(View, {
    ref: zoneRef,
    style: style,
    collapsable: false,
    children: /*#__PURE__*/_jsxs(AIZoneStateContext.Provider, {
      value: {
        simplified
      },
      children: [children, injectedBlock && /*#__PURE__*/_jsxs(Animated.View, {
        style: [styles.blockWrapper, {
          backgroundColor: theme.colors.zoneWrapper,
          borderColor: theme.colors.subtleBorder,
          borderRadius: theme.shape.cardRadius,
          opacity: blockAnim,
          transform: [{
            translateY: blockAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0]
            })
          }]
        }],
        children: [injectedBlock, blockLifecycle !== 'persistent' ? /*#__PURE__*/_jsx(Pressable, {
          style: [styles.closeCardBtn, {
            backgroundColor: theme.colors.zoneDismissBackground
          }],
          onPress: () => setInjectedBlock(null),
          accessibilityLabel: "Dismiss AI Block",
          children: /*#__PURE__*/_jsx(Text, {
            style: [styles.closeCardText, {
              color: theme.colors.zoneDismissText
            }],
            children: "\xD7"
          })
        }) : null]
      }), simplified && /*#__PURE__*/_jsx(Pressable, {
        style: [styles.showAllBtn, {
          backgroundColor: theme.colors.floatingControls,
          borderRadius: theme.shape.controlRadius
        }],
        onPress: () => setSimplified(false),
        accessibilityLabel: "Show all options",
        children: /*#__PURE__*/_jsx(Text, {
          style: [styles.showAllText, {
            color: theme.colors.linkText
          }],
          children: "Show all options"
        })
      })]
    })
  });
}
const styles = StyleSheet.create({
  blockWrapper: {
    marginVertical: 12,
    position: 'relative',
    borderWidth: 1,
    shadowColor: '#1b1510',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3
  },
  closeCardBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
  },
  closeCardText: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  showAllBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start'
  },
  showAllText: {
    fontSize: 14,
    fontWeight: '500'
  }
});
//# sourceMappingURL=AIZone.js.map