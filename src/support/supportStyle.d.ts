export type SupportStyle = 'warm-concise' | 'wow-service' | 'neutral-professional';
interface SupportStylePreset {
    tone: string;
    prompt: string;
}
export declare function resolveSupportStyle(style?: SupportStyle): SupportStylePreset;
export declare function buildSupportStylePrompt(style?: SupportStyle): string;
export {};
//# sourceMappingURL=supportStyle.d.ts.map