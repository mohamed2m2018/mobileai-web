/**
 * CSAT Survey — Customer Satisfaction component.
 *
 * Shown after a support conversation ends (or after idle timeout).
 * Supports three rating types: emoji, stars, thumbs.
 */
import type { CSATConfig, CSATRating } from './types';
interface CSATSurveyProps {
    config: CSATConfig;
    metadata: CSATRating['metadata'];
    onDismiss: () => void;
    theme?: {
        primaryColor?: string;
        textColor?: string;
        backgroundColor?: string;
    };
}
export declare function CSATSurvey({ config, metadata, onDismiss, theme, }: CSATSurveyProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=CSATSurvey.d.ts.map