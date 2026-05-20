"use strict";

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { BlockRegistryContext, globalBlockRegistry, toBlockDefinition } from "../../core/BlockRegistry.js";
import { DEFAULT_RICH_UI_THEME, resolveRichUITheme } from "../../theme/RichUITheme.js";
import { jsx as _jsx } from "react/jsx-runtime";
const RichUIThemeContext = /*#__PURE__*/createContext({
  theme: DEFAULT_RICH_UI_THEME,
  surfaceThemes: {}
});
export function RichUIProvider({
  children,
  registry,
  blocks,
  theme,
  surfaceThemes
}) {
  const activeRegistry = registry || globalBlockRegistry;
  useEffect(() => {
    if (Array.isArray(blocks)) {
      blocks.forEach(block => {
        activeRegistry.register(typeof block === 'function' ? toBlockDefinition(block) : block);
      });
    }
  }, [activeRegistry, blocks]);
  const resolvedTheme = useMemo(() => resolveRichUITheme(theme), [theme]);
  const resolvedSurfaceThemes = useMemo(() => ({
    chat: surfaceThemes?.chat ? resolveRichUITheme(theme, surfaceThemes.chat) : undefined,
    zone: surfaceThemes?.zone ? resolveRichUITheme(theme, surfaceThemes.zone) : undefined,
    support: surfaceThemes?.support ? resolveRichUITheme(theme, surfaceThemes.support) : undefined
  }), [surfaceThemes, theme]);
  return /*#__PURE__*/_jsx(BlockRegistryContext.Provider, {
    value: activeRegistry,
    children: /*#__PURE__*/_jsx(RichUIThemeContext.Provider, {
      value: {
        theme: resolvedTheme,
        surfaceThemes: resolvedSurfaceThemes
      },
      children: children
    })
  });
}
export function useRichUITheme(surface) {
  const context = useContext(RichUIThemeContext);
  if (!surface) return context.theme;
  return context.surfaceThemes[surface] || context.theme;
}
export function useBlockRegistry() {
  return useContext(BlockRegistryContext);
}
//# sourceMappingURL=RichUIContext.js.map