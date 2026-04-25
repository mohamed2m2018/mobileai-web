import type { BlockDefinition } from '../core/types';
type Variant = 'primary' | 'secondary' | 'chip';
export interface ProductCardProps {
    title?: string;
    name?: string;
    subtitle?: string;
    description?: string;
    imageUrl?: string;
    image?: string;
    price?: string;
    badges?: string[];
    actions?: Array<{
        id: string;
        label: string;
        variant?: Variant;
    }>;
}
export declare function ProductCardWeb({ title, name, subtitle, description, imageUrl, image, price, badges, actions, }: ProductCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ProductCardWeb {
    var displayName: string;
}
export interface FactCardProps {
    title?: string;
    body?: string;
    facts?: Array<{
        label: string;
        value: string;
    }>;
    actions?: Array<{
        id: string;
        label: string;
        variant?: Variant;
    }>;
}
export declare function FactCardWeb({ title, body, facts, actions }: FactCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace FactCardWeb {
    var displayName: string;
}
export interface ActionCardProps {
    title?: string;
    body?: string;
    primaryAction?: {
        id: string;
        label: string;
    };
    secondaryAction?: {
        id: string;
        label: string;
    };
    chips?: Array<{
        id: string;
        label: string;
    }>;
}
export declare function ActionCardWeb({ title, body, primaryAction, secondaryAction, chips, }: ActionCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ActionCardWeb {
    var displayName: string;
}
export interface ComparisonCardProps {
    title?: string;
    items?: Array<{
        title?: string;
        name?: string;
        subtitle?: string;
        description?: string;
        summary?: string;
        imageUrl?: string;
        image?: string;
        price?: string;
        badges?: string[];
    }>;
}
export declare function ComparisonCardWeb({ title, items, }: ComparisonCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ComparisonCardWeb {
    var displayName: string;
}
export interface FormCardField {
    id: string;
    type: 'text' | 'textarea' | 'toggle' | 'select';
    label: string;
    placeholder?: string;
    options?: Array<{
        label: string;
        value: string;
    }>;
    value?: string | boolean;
}
export interface FormCardProps {
    title?: string;
    body?: string;
    fields?: FormCardField[];
    submitAction?: {
        id: string;
        label: string;
    };
    cancelAction?: {
        id: string;
        label: string;
    };
}
export declare function FormCardWeb({ title, body, fields, submitAction, cancelAction, }: FormCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace FormCardWeb {
    var displayName: string;
}
export declare const webBlockDefinitions: BlockDefinition[];
export {};
//# sourceMappingURL=blocks.d.ts.map