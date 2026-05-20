/**
 * FiberTreeWalker — Traverses React's Fiber tree to discover interactive elements.
 *
 * Walks the React Native fiber tree to extract a text representation of the UI.
 * Instead of traversing HTML nodes, we traverse React Fiber nodes and detect
 * interactive elements by their type and props (onPress, onChangeText, etc.).
 *
 */
import type { InteractiveElement, WireframeSnapshot } from './types';
export interface WalkConfig {
    /** React refs of elements to exclude */
    interactiveBlacklist?: React.RefObject<any>[];
    /** If set, only these elements are interactive */
    interactiveWhitelist?: React.RefObject<any>[];
    /** Optional screen name to scope interactives to the active screen */
    screenName?: string;
    /** Whether to inject intercepted native UI elements */
    interceptNativeAlerts?: boolean;
}
/**
 * Check if a node has ANY event handler prop (on* function).
 * Mirrors RNTL's getEventHandlerFromProps pattern.
 */
export declare function hasAnyEventHandler(props: any): boolean;
export interface WalkResult {
    elementsText: string;
    interactives: InteractiveElement[];
}
/**
 * Walk the React Fiber tree from a root and collect all interactive elements
 * as well as a hierarchical layout representation for the LLM.
 */
export declare function walkFiberTree(rootRef: any, config?: WalkConfig): WalkResult;
export interface ScrollableContainer {
    /** Index for identification when multiple scrollables exist */
    index: number;
    /** Component name (e.g., 'FlatList', 'ScrollView') */
    componentName: string;
    /** Contextual label — nearest custom component name or text header */
    label: string;
    /** The Fiber node */
    fiberNode: any;
    /** The native stateNode (has scrollToOffset, scrollToEnd, etc.) */
    stateNode: any;
    /**
     * True if this container is a PagerView/TabView.
     * These must NOT be scrolled — use tap on tab labels instead.
     * Pattern from Detox: ScrollToIndexAction rejects non-ScrollView types.
     */
    isPagerLike: boolean;
}
/**
 * Walk the Fiber tree to discover scrollable containers.
 * Returns native stateNodes that expose scrollToOffset(), scrollToEnd(), scrollTo().
 *
 * When `screenName` is provided, the search is scoped to the matching screen's
 * subtree — this prevents finding containers from other mounted screens
 * (React Navigation keeps all stack screens in the tree).
 *
 * For FlatList: the Fiber's stateNode is a VirtualizedList instance.
 * Its underlying scroll view can be accessed via getNativeScrollRef() or
 * getScrollRef(), which returns the native ScrollView with scrollTo/scrollToEnd.
 *
 * For ScrollView: the stateNode IS the native scroll view directly.
 */
export declare function findScrollableContainers(rootRef: any, screenName?: string): ScrollableContainer[];
/**
 * Capture a privacy-safe wireframe of the current screen.
 *
 * Performance guarantees:
 * - Capped at WIREFRAME_MAX_ELEMENTS (50) — enough for wireframe context
 * - Measures in batches of WIREFRAME_BATCH_SIZE (10), yielding a frame
 *   between batches so the bridge stays free for user interactions
 * - The caller (AIAgent) defers this via InteractionManager so it
 *   never competes with screen transitions or gestures
 */
export declare function captureWireframe(rootRef: React.RefObject<any>, config?: WalkConfig): Promise<WireframeSnapshot | null>;
//# sourceMappingURL=FiberTreeWalker.d.ts.map