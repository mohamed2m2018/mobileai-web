/**
 * FiberAdapter — Defense in depth for React internals.
 *
 * Centralizes all direct access to React Fiber internal properties.
 * If React renames an internal property (e.g., in React 19/20), we only
 * need to update it here instead of auditing the entire codebase.
 *
 * These are intentionally simple getter functions, not a complex class abstraction,
 * to ensure maximum performance during tree walk.
 */
export declare function getChild(node: any): any | null;
export declare function getSibling(node: any): any | null;
export declare function getParent(node: any): any | null;
export declare function getProps(node: any): Record<string, any>;
export declare function getStateNode(node: any): any | null;
export declare function getType(node: any): any | null;
export declare function getDisplayName(node: any): string | null;
/**
 * Common heuristic to find the Fiber node attached to a native view.
 *
 * Old Architecture (Bridge): __reactFiber$<hash> or __reactInternalInstance$<hash>
 * New Architecture (Fabric): __internalInstanceHandle (ReactNativeElement)
 */
export declare function getFiberFromNativeNode(nativeNode: any): any | null;
//# sourceMappingURL=FiberAdapter.d.ts.map