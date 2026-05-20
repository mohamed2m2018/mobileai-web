import type { AnalyticsElementKind, AnalyticsLabelConfidence, ElementType } from '../../core/types';
export type AnalyticsLabelSource = 'accessibility' | 'deep-text' | 'sibling-text' | 'placeholder' | 'title' | 'test-id' | 'icon' | 'context';
export interface AnalyticsLabelCandidate {
    text?: string | null;
    source: AnalyticsLabelSource;
    isInteractiveContext?: boolean;
}
export interface AnalyticsTargetMetadata {
    label: string | null;
    elementKind: AnalyticsElementKind;
    labelConfidence: AnalyticsLabelConfidence;
    zoneId?: string | null;
    ancestorPath?: string[];
    siblingLabels?: string[];
    componentName?: string | null;
}
export declare function getFallbackAnalyticsLabel(elementKind: AnalyticsElementKind): string | null;
export declare function getAnalyticsElementKind(elementType?: ElementType | string | null): AnalyticsElementKind;
export declare function chooseBestAnalyticsTarget(candidates: AnalyticsLabelCandidate[], elementKind: AnalyticsElementKind): AnalyticsTargetMetadata;
//# sourceMappingURL=analyticsLabeling.d.ts.map