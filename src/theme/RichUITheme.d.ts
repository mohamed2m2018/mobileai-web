export interface RichUIColorScale {
    canvas: string;
    chatCanvas: string;
    blockSurface: string;
    raisedSurface: string;
    mutedSurface: string;
    overlaySurface: string;
    inputSurface: string;
    primaryText: string;
    secondaryText: string;
    mutedText: string;
    inverseText: string;
    successText: string;
    warningText: string;
    dangerText: string;
    linkText: string;
    border: string;
    subtleBorder: string;
    strongBorder: string;
    focusBorder: string;
    selectedBorder: string;
    errorBorder: string;
    successBorder: string;
    primaryAccent: string;
    secondaryAccent: string;
    tertiaryAccent: string;
    highlightAccent: string;
    ctaAccent: string;
    selectionAccent: string;
    success: string;
    warning: string;
    danger: string;
    info: string;
    trust: string;
    price: string;
    discount: string;
    soldOut: string;
    unavailable: string;
    imagePlaceholder: string;
    imageScrim: string;
    mediaBorder: string;
    priceTagBackground: string;
    priceTagBorder: string;
    priceTagText: string;
    strikeThroughPrice: string;
    discountBadge: string;
    chipFilledBackground: string;
    chipFilledText: string;
    chipOutlinedBorder: string;
    chipOutlinedText: string;
    chipSelectedBackground: string;
    chipSelectedText: string;
    chipMutedBackground: string;
    chipMutedText: string;
    destructiveChipBackground: string;
    destructiveChipText: string;
    fieldBackground: string;
    fieldBorder: string;
    cursor: string;
    placeholder: string;
    helperText: string;
    validationError: string;
    validationSuccess: string;
    toggleTrack: string;
    toggleThumb: string;
    assistantBubble: string;
    userBubble: string;
    transcriptDivider: string;
    timestamp: string;
    typingState: string;
    richMessageContainer: string;
    zoneWrapper: string;
    zoneDismissBackground: string;
    zoneDismissText: string;
    floatingControls: string;
}
export interface RichUIShapeScale {
    cardRadius: number;
    controlRadius: number;
    mediaRadius: number;
    chipRadius: number;
    pillRadius: number;
}
export interface RichUISpacingScale {
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
}
export interface RichUITypographyScale {
    titleSize: number;
    subtitleSize: number;
    bodySize: number;
    metaSize: number;
    captionSize: number;
    priceSize: number;
}
export interface RichUITheme {
    colors: RichUIColorScale;
    shape: RichUIShapeScale;
    spacing: RichUISpacingScale;
    typography: RichUITypographyScale;
}
export type RichUIThemeOverride = Partial<{
    colors: Partial<RichUIColorScale>;
    shape: Partial<RichUIShapeScale>;
    spacing: Partial<RichUISpacingScale>;
    typography: Partial<RichUITypographyScale>;
}>;
export declare const DEFAULT_RICH_UI_THEME: RichUITheme;
export declare function resolveRichUITheme(...overrides: Array<RichUIThemeOverride | undefined>): RichUITheme;
//# sourceMappingURL=RichUITheme.d.ts.map