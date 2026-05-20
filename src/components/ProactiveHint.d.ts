import React from 'react';
interface ProactiveHintProps {
    stage: 'hidden' | 'pulse' | 'badge';
    badgeText?: string;
    onDismiss: () => void;
    children: React.ReactNode;
}
export declare function ProactiveHint({ stage, badgeText, onDismiss, children }: ProactiveHintProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ProactiveHint.d.ts.map