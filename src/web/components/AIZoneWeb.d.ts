import React from 'react';
import type { AIZoneConfig } from '../../core/types';
interface AIZoneWebProps extends AIZoneConfig {
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}
export declare const AIZoneWebStateContext: React.Context<{
    simplified: boolean;
}>;
export declare function AIZoneWeb({ id, allowHighlight, allowInjectHint, allowSimplify, allowInjectBlock, allowInjectCard, interventionEligible, proactiveIntervention, blocks, templates, children, style, className, }: AIZoneWebProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AIZoneWeb.d.ts.map