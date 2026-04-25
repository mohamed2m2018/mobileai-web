import type { InteractiveElement, ScreenSnapshot } from '../../core/types';
export { PageControllerWeb } from './PageControllerWeb';
export declare function collectDomInteractives(root: Document | HTMLElement | null | undefined): InteractiveElement[];
export declare function buildDomScreenSnapshot(root: Document | HTMLElement | null | undefined, screenName: string, availableScreens: string[]): ScreenSnapshot;
export declare function findNearestScrollableContainer(element: HTMLElement | null): HTMLElement | null;
//# sourceMappingURL=dom.d.ts.map
