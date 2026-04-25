import type { ActionIntent, NavigationSnapshot, PlatformAdapter, ScreenSnapshot } from '../../core/types';
export interface WebRouterAdapter {
    push?: (href: string) => void;
    replace?: (href: string) => void;
    back?: () => void;
    navigate?: (screen: string, params?: unknown) => void;
    resolveHref?: (screen: string, params?: unknown) => string | null | undefined;
    getCurrentScreenName?: () => string;
    getAvailableScreens?: () => string[];
}
interface GuidePayload {
    targetRect: DOMRect;
    message: string;
    autoRemoveAfterMs?: number;
}
interface WebPlatformAdapterOptions {
    getRoot: () => HTMLElement | Document | null;
    router?: WebRouterAdapter;
    pathname?: string;
    getCurrentScreenName?: () => string;
    getAvailableScreens?: () => string[];
    captureScreenshot?: () => Promise<string | undefined>;
    onGuide?: (payload: GuidePayload | null) => void;
}
export declare class WebPlatformAdapter implements PlatformAdapter {
    private options;
    private lastSnapshot;
    constructor(options: WebPlatformAdapterOptions);
    getLastScreenSnapshot(): ScreenSnapshot | null;
    getNavigationSnapshot(): NavigationSnapshot;
    getScreenSnapshot(): ScreenSnapshot;
    captureScreenshot(): Promise<string | undefined>;
    executeAction(intent: ActionIntent): Promise<string>;
    private getCurrentScreenName;
    private getAvailableScreens;
    private getSnapshotElement;
    private getDomNode;
    private tap;
    private dispatchInputEvents;
    private typeText;
    private scroll;
    private adjustSlider;
    private selectPicker;
    private setDate;
    private dismissKeyboard;
    private guideUser;
    private simplifyZone;
    private renderBlock;
    private injectCard;
    private restoreZone;
    private navigate;
}
export {};
//# sourceMappingURL=WebPlatformAdapter.d.ts.map