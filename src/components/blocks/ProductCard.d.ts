import type { BlockDefinition } from '../../core/types';
import { type BlockAppearance } from './primitives';
export interface ProductCardProps {
    title: string;
    name?: string;
    subtitle?: string;
    description?: string;
    imageUrl?: string;
    image?: string;
    price?: string;
    compareAtPrice?: string;
    badges?: string[];
    actions?: Array<{
        id: string;
        label: string;
        variant?: 'primary' | 'secondary' | 'chip';
    }>;
    appearance?: BlockAppearance;
}
export declare function ProductCard({ title, name, subtitle, description, imageUrl, image, price, compareAtPrice, badges, actions, appearance, }: ProductCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ProductCard {
    var displayName: string;
}
export declare const ProductCardDefinition: BlockDefinition;
//# sourceMappingURL=ProductCard.d.ts.map