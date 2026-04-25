/**
 * DiscoveryTooltip — One-time tooltip shown above the FAB on first use.
 *
 * Tells users the AI can navigate the app and do things for them.
 * Shows once, then persists dismissal via AsyncStorage.
 * Bilingual: EN/AR.
 */
interface DiscoveryTooltipProps {
    language: 'en' | 'ar';
    primaryColor?: string;
    onDismiss: () => void;
    side?: 'left' | 'right';
    message?: string;
}
export declare function DiscoveryTooltip({ language, primaryColor, onDismiss, side, message, }: DiscoveryTooltipProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DiscoveryTooltip.d.ts.map