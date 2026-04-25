import React from 'react';
export interface BlockAppearance {
    surfaceColor?: string;
    raisedSurfaceColor?: string;
    borderColor?: string;
    textColor?: string;
    mutedTextColor?: string;
    accentColor?: string;
    priceBackgroundColor?: string;
    priceTextColor?: string;
}
export declare function CardSurface({ children, appearance, }: {
    children: React.ReactNode;
    appearance?: BlockAppearance;
}): import("react/jsx-runtime").JSX.Element;
export declare function MediaFrame({ uri, }: {
    uri?: string;
    appearance?: BlockAppearance;
}): import("react/jsx-runtime").JSX.Element;
export declare function PriceTag({ label, strikeThrough, appearance, }: {
    label?: string;
    strikeThrough?: string;
    appearance?: BlockAppearance;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function BadgeRow({ badges, appearance, }: {
    badges?: string[];
    appearance?: BlockAppearance;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function MetaRow({ items, appearance, }: {
    items?: Array<{
        label: string;
        value: string;
    }>;
    appearance?: BlockAppearance;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function ActionRow({ actions, appearance, onAction, }: {
    actions?: Array<{
        id: string;
        label: string;
        variant?: 'primary' | 'secondary' | 'chip';
    }>;
    appearance?: BlockAppearance;
    onAction?: (actionId: string) => void;
}): import("react/jsx-runtime").JSX.Element | null;
export declare function FieldRow({ label, value, placeholder, appearance, onChangeText, }: {
    label: string;
    value?: string;
    placeholder?: string;
    appearance?: BlockAppearance;
    onChangeText?: (value: string) => void;
}): import("react/jsx-runtime").JSX.Element;
export declare function SectionTitle({ title, subtitle, appearance, }: {
    title: string;
    subtitle?: string;
    appearance?: BlockAppearance;
}): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=index.d.ts.map