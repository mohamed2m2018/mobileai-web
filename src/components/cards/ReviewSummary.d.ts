interface ReviewSummaryProps {
    rating?: number;
    reviewCount?: number;
    headline?: string;
    sentiment?: 'positive' | 'neutral' | 'negative';
}
/**
 * Built-in card template that shows a product/service review summary.
 * Injected by the AI agent to surface social proof at decision points.
 *
 * IMPORTANT: displayName is set explicitly to survive minification.
 * The injectCardTool resolves templates by `T.displayName`, not `T.name`.
 */
export declare function ReviewSummary({ rating, reviewCount, headline, sentiment, }: ReviewSummaryProps): import("react/jsx-runtime").JSX.Element;
export declare namespace ReviewSummary {
    var displayName: string;
}
export {};
//# sourceMappingURL=ReviewSummary.d.ts.map