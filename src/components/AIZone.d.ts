import React from 'react';
import type { AIZoneConfig } from '../core/types';
interface AIZoneProps extends AIZoneConfig {
    children: React.ReactNode;
    style?: any;
}
export declare const AIZoneStateContext: React.Context<{
    simplified: boolean;
}>;
/**
 * Declarative boundary that grants the AI permission to modify its subtree.
 * Has zero visual impact by default.
 */
export declare function AIZone({ id, allowHighlight, allowInjectHint, allowSimplify, allowInjectBlock, allowInjectCard, interventionEligible, proactiveIntervention, blocks, templates, children, style, }: AIZoneProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AIZone.d.ts.map