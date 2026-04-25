/**
 * AIConsentDialog — Apple App Store Guideline 5.1.2(i) compliant consent flow.
 *
 * Displays a modal before the first AI interaction that:
 * 1. Names the specific third-party AI provider (e.g., "Google Gemini")
 * 2. Explains what data is shared (screen content, messages)
 * 3. Collects explicit user consent via affirmative tap
 *
 * Persists consent via AsyncStorage so the dialog is shown once per device.
 * If AsyncStorage is unavailable, consent is session-scoped (per app launch).
 *
 * ## Business rationale
 * Apple rejects apps that silently send personal data to third-party AI services.
 * This component ensures compliance WITHOUT the app developer needing to build
 * their own consent flow — they just set `requireConsent={true}` on <AIAgent>.
 */
import type { AIProviderName } from '../core/types';
export declare const DEFAULT_CONSENT_THEME: {
    backdrop: string;
    cardBackground: string;
    cardBorder: string;
    iconBackground: string;
    iconColor: string;
    title: string;
    body: string;
    muted: string;
    sectionBackground: string;
    sectionBorder: string;
    bullet: string;
    badgeBackground: string;
    badgeText: string;
    secondaryButtonBackground: string;
    secondaryButtonText: string;
    primaryButtonBackground: string;
    primaryButtonText: string;
    link: string;
};
export declare function resolveConsentDialogContent(provider: AIProviderName, config: AIConsentConfig, language?: 'en' | 'ar'): {
    isArabic: boolean;
    providerInfo: {
        name: string;
        company: string;
        url: string;
    };
    theme: {
        backdrop: string;
        cardBackground: string;
        cardBorder: string;
        iconBackground: string;
        iconColor: string;
        title: string;
        body: string;
        muted: string;
        sectionBackground: string;
        sectionBorder: string;
        bullet: string;
        badgeBackground: string;
        badgeText: string;
        secondaryButtonBackground: string;
        secondaryButtonText: string;
        primaryButtonBackground: string;
        primaryButtonText: string;
        link: string;
    };
    providerLabel: string;
    providerUrl: string;
    showProviderBadge: boolean;
    title: string;
    sharedDataItems: string[];
};
export interface AIConsentConfig {
    /**
     * Whether consent is required before AI interactions.
     * When true, the agent will NOT send any data to the AI provider
     * until the user explicitly consents.
     * @default true
     */
    required?: boolean;
    /**
     * Whether to persist the consent decision across app restarts.
     * When false, the user must consent every time they launch the app.
     * When true, the decision is saved locally (e.g. AsyncStorage) and
     * the dialog is shown only once per device.
     * @default false
     */
    persist?: boolean;
    /**
     * Optional custom title for the consent dialog.
     * Default: "AI Assistant"
     */
    title?: string;
    /**
     * Optional custom body text.
     * Default: Auto-generated based on provider name.
     */
    body?: string;
    /**
     * Optional custom title for the consent dialog (Arabic).
     * Default: "مساعد الذكاء الاصطناعي"
     */
    titleAr?: string;
    /**
     * Optional custom body text (Arabic).
     * Default: Auto-generated based on provider name.
     */
    bodyAr?: string;
    /**
     * URL to the app's privacy policy.
     * If provided, a "Privacy Policy" link is shown in the dialog.
     */
    privacyPolicyUrl?: string;
    /**
     * Callback fired when user grants consent.
     */
    onConsent?: () => void;
    /**
     * Callback fired when user declines consent.
     */
    onDecline?: () => void;
    /**
     * Optional developer-controlled provider label.
     * Example: "FoodApp AI" or "Secure AI Service".
     * If omitted, the dialog uses a neutral generic label by default.
     */
    providerLabel?: string;
    /**
     * Optional provider company/owner name shown in the description.
     */
    providerCompany?: string;
    /**
     * Optional URL to provider terms or documentation.
     */
    providerUrl?: string;
    /**
     * Show or hide the small provider badge.
     * Default: false
     */
    showProviderBadge?: boolean;
    /**
     * Optional override for the provider badge text.
     */
    providerBadgeText?: string;
    /**
     * Optional softer explanation shown above the shared-data list.
     */
    summary?: string;
    /**
     * Optional calmer explanation shown above the shared-data list (Arabic).
     */
    summaryAr?: string;
    /**
     * Optional custom list of shared-data lines.
     */
    sharedDataItems?: string[];
    /**
     * Optional custom list of shared-data lines (Arabic).
     */
    sharedDataItemsAr?: string[];
    /**
     * Theme colors for the consent dialog.
     */
    theme?: Partial<typeof DEFAULT_CONSENT_THEME>;
}
interface AIConsentDialogProps {
    visible: boolean;
    provider: AIProviderName;
    config: AIConsentConfig;
    onConsent: () => void;
    onDecline: () => void;
    language?: 'en' | 'ar';
}
export declare function AIConsentDialog({ visible, provider, config, onConsent, onDecline, language, }: AIConsentDialogProps): import("react/jsx-runtime").JSX.Element | null;
/**
 * Manages consent state persistence via AsyncStorage.
 * Falls back to session-scoped state if AsyncStorage is unavailable.
 *
 * @returns [hasConsented, grantConsent, revokeConsent, isLoading]
 */
export declare function useAIConsent(persist?: boolean): [
    hasConsented: boolean,
    grantConsent: () => Promise<void>,
    revokeConsent: () => Promise<void>,
    isLoading: boolean
];
export {};
//# sourceMappingURL=AIConsentDialog.d.ts.map