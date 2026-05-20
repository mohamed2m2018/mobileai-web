import type { AIRichNode } from '../../core/types';
interface RichContentRendererProps {
    content: AIRichNode[] | string;
    surface: 'chat' | 'support' | 'zone';
    isUser?: boolean;
    textStyle?: any;
}
export declare function RichContentRenderer({ content, surface, isUser, textStyle, }: RichContentRendererProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=RichContentRenderer.d.ts.map