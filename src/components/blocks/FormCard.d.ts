import type { BlockDefinition } from '../../core/types';
import { type BlockAppearance } from './primitives';
export interface FormField {
    id: string;
    label: string;
    placeholder?: string;
    value?: string;
}
export interface FormCardProps {
    title?: string;
    description?: string;
    fields?: FormField[];
    submitActionId?: string;
    cancelActionId?: string;
    appearance?: BlockAppearance;
}
export declare function FormCard({ title, description, fields, submitActionId, cancelActionId, appearance, }: FormCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace FormCard {
    var displayName: string;
}
export declare const FormCardDefinition: BlockDefinition;
//# sourceMappingURL=FormCard.d.ts.map