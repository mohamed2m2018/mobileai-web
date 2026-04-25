import type { BlockDefinition } from '../../core/types';
import { type BlockAppearance } from './primitives';
export interface ComparisonCardItem {
    title: string;
    name?: string;
    subtitle?: string;
    price?: string;
    badges?: string[];
    summary?: string;
    description?: string;
    imageUrl?: string;
    image?: string;
}
export interface ComparisonCardProps {
    title?: string;
    items?: ComparisonCardItem[];
    appearance?: BlockAppearance;
}
export declare function ComparisonCard({ title, items, appearance, }: ComparisonCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ComparisonCard {
    var displayName: string;
}
export declare const ComparisonCardDefinition: BlockDefinition;
//# sourceMappingURL=ComparisonCard.d.ts.map