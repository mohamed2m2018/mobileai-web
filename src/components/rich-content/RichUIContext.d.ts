import React from 'react';
import type { BlockDefinition } from '../../core/types';
import { type BlockRegistry } from '../../core/BlockRegistry';
import { type RichUITheme, type RichUIThemeOverride } from '../../theme/RichUITheme';
export declare function RichUIProvider({ children, registry, blocks, theme, surfaceThemes, }: {
    children: React.ReactNode;
    registry?: BlockRegistry;
    blocks?: Array<BlockDefinition | React.ComponentType<any>>;
    theme?: RichUIThemeOverride;
    surfaceThemes?: Partial<Record<'chat' | 'zone' | 'support', RichUIThemeOverride>>;
}): import("react/jsx-runtime").JSX.Element;
export declare function useRichUITheme(surface?: 'chat' | 'zone' | 'support'): RichUITheme;
export declare function useBlockRegistry(): BlockRegistry;
//# sourceMappingURL=RichUIContext.d.ts.map