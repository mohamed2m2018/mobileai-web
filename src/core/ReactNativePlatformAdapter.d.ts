import type { WalkConfig } from './FiberTreeWalker';
import type { ActionIntent, NavigationSnapshot, PlatformAdapter, ScreenSnapshot } from './types';
interface ReactNativePlatformAdapterOptions {
    getRootRef: () => any;
    getWalkConfig: () => WalkConfig;
    navRef?: any;
    router?: {
        push: (href: string) => void;
        replace: (href: string) => void;
        back: () => void;
    };
    pathname?: string;
    getCurrentScreenName?: () => string;
}
export declare class ReactNativePlatformAdapter implements PlatformAdapter {
    private options;
    private lastSnapshot;
    constructor(options: ReactNativePlatformAdapterOptions);
    getLastScreenSnapshot(): ScreenSnapshot | null;
    getNavigationSnapshot(): NavigationSnapshot;
    getScreenSnapshot(): ScreenSnapshot;
    captureScreenshot(): Promise<string | undefined>;
    executeAction(intent: ActionIntent): Promise<string>;
    private getCurrentScreenName;
    private getRouteNames;
    private collectRouteNames;
    private findScreenPath;
    private buildNestedParams;
    private getInteractiveElements;
    private findInteractiveElement;
    private tap;
    private longPress;
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
//# sourceMappingURL=ReactNativePlatformAdapter.d.ts.map