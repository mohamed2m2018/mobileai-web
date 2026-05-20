interface InfoCardProps {
    title?: string;
    body?: string;
    icon?: string;
}
/**
 * Built-in card template for AI injection.
 *
 * IMPORTANT: displayName must be set explicitly here.
 * In production/minified builds, the function name is mangled (e.g. `a`, `b`),
 * so `injectCardTool` cannot identify templates by inferred name alone.
 * Always look up templates by `T.displayName`, never by `T.name`.
 */
export declare function InfoCard({ title, body }: InfoCardProps): import("react/jsx-runtime").JSX.Element;
export declare namespace InfoCard {
    var displayName: string;
}
export {};
//# sourceMappingURL=InfoCard.d.ts.map