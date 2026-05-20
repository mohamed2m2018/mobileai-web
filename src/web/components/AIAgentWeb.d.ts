import React from 'react';
import { type BlockActionHandler } from '../../core/ActionBridge';
import type { AgentConfig } from '../../core/types';
import type { SupportModeConfig } from '../../support/types';
import type { RichUIThemeOverride } from '../../theme/RichUITheme';
import { type WebRouterAdapter } from '../core/WebPlatformAdapter';
export interface AIAgentWebProps extends Omit<AgentConfig, 'platformAdapter' | 'router' | 'pathname' | 'interceptNativeAlerts'> {
    children: React.ReactNode;
    routerAdapter?: WebRouterAdapter;
    pathname?: string;
    showChat?: boolean;
    defaultOpen?: boolean;
    inputPlaceholder?: string;
    theme?: RichUIThemeOverride;
    surfaceThemes?: Partial<Record<'chat' | 'zone' | 'support', RichUIThemeOverride>>;
    blockActionHandlers?: Record<string, BlockActionHandler>;
    blocks?: AgentConfig['customTools'] extends never ? never : any;
    requireConsent?: boolean;
    captureScreenshot?: () => Promise<string | undefined>;
    persistenceKey?: string;
    debug?: boolean;
    enableVoice?: boolean;
    analyticsKey?: string;
    supportMode?: SupportModeConfig;
    userContext?: {
        userId?: string;
        name?: string;
        email?: string;
        phone?: string;
        plan?: string;
        custom?: Record<string, string | number | boolean>;
    };
    pushToken?: string;
    pushTokenType?: 'fcm' | 'expo' | 'apns';
}
export declare function AIAgentWeb({ children, provider, apiKey, proxyUrl, proxyHeaders, voiceProxyUrl, voiceProxyHeaders, analyticsKey, userContext, pushToken, pushTokenType, supportMode, model, verifier, supportStyle, maxSteps, stepDelay, customTools, instructions, onBeforeStep, onAfterStep, onBeforeTask, onAfterTask, onTokenUsage, knowledgeBase, knowledgeMaxTokens, enableUIControl, enableVoice, allowedActionNames, screenMap, maxTokenBudget, maxCostUSD, interactionMode, mcpServerUrl, debug, showChat, defaultOpen, inputPlaceholder, theme, surfaceThemes, blockActionHandlers, routerAdapter, pathname, requireConsent, captureScreenshot, persistenceKey, }: AIAgentWebProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=AIAgentWeb.d.ts.map
