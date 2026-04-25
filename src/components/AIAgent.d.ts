/**
 * AIAgent — Root provider component for the AI agent.
 *
 * Wraps the app and provides:
 * - Fiber tree root ref for element auto-detection
 * - Navigation ref for auto-navigation
 * - Floating chat bar for user input
 * - Agent runtime context for useAction hooks
 */
import React from 'react';
import type { AIConsentConfig } from './AIConsentDialog';
import type { ExecutionResult, ToolDefinition, AgentStep, TokenUsage, KnowledgeBaseConfig, ChatBarTheme, AIProviderName, ScreenMap, ProactiveHelpConfig, InteractionMode, CustomerSuccessConfig, OnboardingConfig, VerifierConfig, SupportStyle } from '../core/types';
import type { BlockActionHandler } from '../core/ActionBridge';
import type { RichUIThemeOverride } from '../theme/RichUITheme';
import type { BlockDefinition } from '../core/types';
interface AIAgentProps {
    /**
     * API key (for local prototyping only).
     * Do not ship API keys in your production app bundle.
     */
    apiKey?: string;
    /**
     * Which LLM provider to use for text mode.
     * Default: 'gemini'
     */
    provider?: AIProviderName;
    /**
     * The URL of your secure backend proxy (for production).
     * Routes all Gemini API traffic through your server.
     */
    proxyUrl?: string;
    /**
     * Headers to send to your backend proxy (e.g., auth tokens).
     */
    proxyHeaders?: Record<string, string>;
    /**
     * Optional specific URL for Voice Mode (WebSockets).
     * If voiceProxyUrl isn't provided, it safely falls back to using proxyUrl for everything.
     */
    voiceProxyUrl?: string;
    /**
     * Optional specific headers for voiceProxyUrl.
     */
    voiceProxyHeaders?: Record<string, string>;
    /** LLM model name (provider-specific) */
    model?: string;
    /** Support personality preset. Default: 'warm-concise'. */
    supportStyle?: SupportStyle;
    /** Optional outcome verifier configuration for critical actions. */
    verifier?: VerifierConfig;
    /** Navigation container ref (from useNavigationContainerRef) */
    navRef?: any;
    /** Max agent steps per request */
    maxSteps?: number;
    /** Show/hide the chat bar */
    showChatBar?: boolean;
    /** Children — the actual app */
    children: React.ReactNode;
    /** Callback when agent completes */
    onResult?: (result: ExecutionResult) => void;
    /** Refs of elements the AI must NOT interact with */
    interactiveBlacklist?: React.RefObject<any>[];
    /** If set, AI can ONLY interact with these elements */
    interactiveWhitelist?: React.RefObject<any>[];
    /** Called before each step */
    onBeforeStep?: (stepCount: number) => Promise<void> | void;
    /** Called after each step */
    onAfterStep?: (history: AgentStep[]) => Promise<void> | void;
    /** Called before task starts */
    onBeforeTask?: () => Promise<void> | void;
    /** Called after task completes */
    onAfterTask?: (result: ExecutionResult) => Promise<void> | void;
    /** Transform screen content before LLM sees it (for data masking) */
    transformScreenContent?: (content: string) => Promise<string> | string;
    /** Override or remove built-in tools (null = remove) */
    customTools?: Record<string, ToolDefinition | null>;
    /** Instructions to guide agent behavior */
    instructions?: {
        system?: string;
        getScreenInstructions?: (screenName: string) => string | undefined | null;
    };
    /** Delay between steps in ms */
    stepDelay?: number;
    /** WebSocket URL to companion MCP server bridge (e.g., ws://localhost:3101) */
    mcpServerUrl?: string;
    /** Expo Router instance (from useRouter()) */
    router?: {
        push: (href: string) => void;
        replace: (href: string) => void;
        back: () => void;
    };
    /** Expo Router pathname (from usePathname()) */
    pathname?: string;
    /** Enable voice mode (requires expo-av) */
    enableVoice?: boolean;
    /** Called after each step with token usage data */
    onTokenUsage?: (usage: TokenUsage) => void;
    /** Enable SDK debug logging (disabled by default) */
    debug?: boolean;
    /**
     * Domain knowledge the AI can query via the query_knowledge tool.
     * Pass a static KnowledgeEntry[] or a { retrieve(query, screen) } function.
     * If omitted and analyticsKey is configured, the SDK will query the project
     * knowledge configured in the MobileAI dashboard automatically.
     */
    knowledgeBase?: KnowledgeBaseConfig;
    /** Max token budget for knowledge retrieval (default: 2000) */
    knowledgeMaxTokens?: number;
    /**
     * Enable or disable UI control (tap, type, navigate).
     * When false, the AI operates as a knowledge-only assistant.
     * Default: true
     */
    enableUIControl?: boolean;
    /**
     * Quick accent color for the chat bar.
     * Tints the FAB, send button, and active states.
     * Overridden by theme.primaryColor if both are provided.
     */
    accentColor?: string;
    /**
     * Full theme customization for the chat bar popup.
     * Overrides accentColor for any specified key.
     */
    theme?: ChatBarTheme;
    /** Global rich blocks available to chat and zone rendering. */
    blocks?: Array<BlockDefinition | React.ComponentType<any>>;
    /** Rich UI token overrides for built-in blocks and rich rendering. */
    richUITheme?: RichUIThemeOverride;
    /** Optional per-surface rich UI token overrides. */
    richUISurfaceThemes?: Partial<Record<'chat' | 'zone' | 'support', RichUIThemeOverride>>;
    /** App-defined action handlers for interactive rich blocks. */
    blockActionHandlers?: Record<string, BlockActionHandler>;
    /**
     * Optional screen map metadata describing routes, content, and navigation.
     */
    screenMap?: ScreenMap;
    /**
     * Maximum total tokens (prompt + completion) allowed per task.
     * The agent loop auto-stops when this budget is exceeded.
     */
    maxTokenBudget?: number;
    /**
     * Maximum estimated cost (USD) allowed per task.
     * The agent loop auto-stops when this budget is exceeded.
     */
    maxCostUSD?: number;
    /**
     * Whether to include the screen map in the AI prompt.
     * Set to `false` to disable navigation intelligence without removing the `screenMap` prop.
     * @default true
     */
    useScreenMap?: boolean;
    /** Whether to surface native alert buttons as interactive elements to the AI. */
    interceptNativeAlerts?: boolean;
    /**
     * Publishable analytics key (mobileai_pub_xxx).
     */
    analyticsKey?: string;
    /**
     * Proxy URL for enterprise customers — routes events through your backend.
     */
    analyticsProxyUrl?: string;
    /**
     * Custom headers for analyticsProxyUrl (e.g., auth tokens).
     */
    analyticsProxyHeaders?: Record<string, string>;
    /**
     * Proactive agent configuration (detects user hesitation)
     */
    proactiveHelp?: ProactiveHelpConfig;
    /**
     * Identity of the logged-in user.
     * If provided, this enforces "one ticket per user" and shows the user profile
     * in the Dashboard (name, email, plan, etc.).
     */
    userContext?: {
        userId?: string;
        name?: string;
        email?: string;
        phone?: string;
        plan?: string;
        custom?: Record<string, string | number | boolean>;
    };
    /**
     * Device push token for offline support replies.
     * Use '@react-native-firebase/messaging' or 'expo-notifications' to get this.
     */
    pushToken?: string;
    /**
     * The type of push token provided.
     * "fcm" is recommended for universal bare/Expo support.
     */
    pushTokenType?: 'fcm' | 'expo' | 'apns';
    /**
     * Controls how the agent handles irreversible UI actions.
     * 'copilot' (default): AI may ask once before entering an app-action flow, then works
     * silently through routine steps and pauses again only for irreversible final commits
     * (place order, delete, submit, pay, cancel).
     * 'autopilot': Full autonomy — all actions execute without confirmation.
     *
     * In copilot mode, the AI can collect low-risk workflow details, request one approval
     * to start routine app actions when needed, execute navigation/fill/selection steps
     * silently, and then request a separate confirmation only before an irreversible
     * commit. Elements with aiConfirm={true} also trigger a code-level confirmation gate
     * as a safety net.
     */
    interactionMode?: InteractionMode;
    /**
     * Show a one-time discovery tooltip above the chat FAB.
     * Tells new users the AI can navigate and interact with the app.
     * Default: true (shows once, then remembered via AsyncStorage)
     */
    showDiscoveryTooltip?: boolean;
    /**
     * Custom discovery tooltip copy shown above the chat FAB.
     * Pass a string to override the default onboarding message for this app.
     */
    discoveryTooltipMessage?: string;
    /**
     * Health score configuration. Enable to automatically track screen
     * flow, feature adoption, and success milestones for the MobileAI Dashboard.
     */
    customerSuccess?: CustomerSuccessConfig;
    /**
     * Onboarding journey configuration.
     * Proactively guides users through structured steps when the app launches.
     */
    onboarding?: OnboardingConfig;
    /**
     * AI consent configuration (Apple Guideline 5.1.2(i)).
     * Consent is REQUIRED by default — a consent dialog is shown before
     * the first AI interaction. The agent will NOT send any data to
     * the AI provider until the user explicitly consents.
     * To opt out: `consent={{ required: false }}`.
     */
    consent?: AIConsentConfig;
}
export declare function AIAgent({ apiKey, proxyUrl, proxyHeaders, voiceProxyUrl, voiceProxyHeaders, provider: providerName, model, supportStyle, verifier, navRef, maxSteps, showChatBar, children, onResult, interactiveBlacklist, interactiveWhitelist, onBeforeStep, onAfterStep, onBeforeTask, onAfterTask, transformScreenContent, customTools, instructions, stepDelay, mcpServerUrl, router, pathname, interceptNativeAlerts, enableVoice, onTokenUsage, debug, knowledgeBase, knowledgeMaxTokens, enableUIControl, accentColor, theme, blocks, richUITheme, richUISurfaceThemes, blockActionHandlers, screenMap, useScreenMap, maxTokenBudget, maxCostUSD, analyticsKey, analyticsProxyUrl, analyticsProxyHeaders, proactiveHelp, userContext, pushToken, pushTokenType, interactionMode, showDiscoveryTooltip: showDiscoveryTooltipProp, discoveryTooltipMessage, customerSuccess, onboarding, consent, }: AIAgentProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AIAgent.d.ts.map
