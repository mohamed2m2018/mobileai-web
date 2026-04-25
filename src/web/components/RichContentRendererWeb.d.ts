import React from 'react';
import type { AIRichNode } from '../../core/types';
interface RichContentRendererWebProps {
    content: AIRichNode[] | string;
    surface: 'chat' | 'support' | 'zone';
    isUser?: boolean;
    textStyle?: React.CSSProperties;
}
export declare function RichContentRendererWeb({ content, surface, isUser, textStyle, }: RichContentRendererWebProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=RichContentRendererWeb.d.ts.map