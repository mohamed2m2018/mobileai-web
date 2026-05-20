import type { BlockDefinition } from '../../core/types';
import { type BlockAppearance } from './primitives';
export interface FactCardProps {
    title?: string;
    subtitle?: string;
    body?: string;
    facts?: Array<{
        label: string;
        value: string;
    }>;
    badges?: string[];
    appearance?: BlockAppearance;
}
export declare function FactCard({ title, subtitle, body, facts, badges, appearance, }: FactCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace FactCard {
    var displayName: string;
}
export declare const FactCardDefinition: BlockDefinition;
//# sourceMappingURL=FactCard.d.ts.map