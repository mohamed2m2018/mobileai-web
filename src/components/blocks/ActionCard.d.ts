import type { BlockDefinition } from '../../core/types';
import { type BlockAppearance } from './primitives';
export interface ActionCardProps {
    title?: string;
    body?: string;
    actions?: Array<{
        id: string;
        label: string;
        variant?: 'primary' | 'secondary' | 'chip';
    }>;
    appearance?: BlockAppearance;
}
export declare function ActionCard({ title, body, actions, appearance, }: ActionCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ActionCard {
    var displayName: string;
}
export declare const ActionCardDefinition: BlockDefinition;
//# sourceMappingURL=ActionCard.d.ts.map