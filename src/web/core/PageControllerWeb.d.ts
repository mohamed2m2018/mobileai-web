import type { InteractiveElement, ScreenSnapshot } from '../../core/types';
export interface PageControllerWebConfig {
    viewportMode?: 'viewport' | 'expanded' | 'full';
    viewportExpansion?: number;
    traverseShadowRoots?: boolean;
    traverseIframes?: boolean;
}
export declare class PageControllerWeb {
    private root;
    private doc;
    private win;
    private base;
    private config;
    private flatTree;
    private interactives;
    private interactiveNodes;
    private summaryLines;
    private analysisComplete;
    private rootNodeId;
    constructor(root: Document | HTMLElement | null | undefined, config?: PageControllerWebConfig);
    static findNearestScrollableContainer(element: HTMLElement | null): HTMLElement | null;
    analyze(): void;
    collectInteractives(): InteractiveElement[];
    getElement(index: number): HTMLElement | null;
    getInteractive(index: number): InteractiveElement | null;
    buildScreenSnapshot(screenName: string, availableScreens: string[]): ScreenSnapshot;
}
