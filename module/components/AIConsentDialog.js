"use strict";

/**
 * AIConsentDialog — Apple App Store Guideline 5.1.2(i) compliant consent flow.
 *
 * Displays a modal before the first AI interaction that:
 * 1. Names the specific third-party AI provider (e.g., "Google Gemini")
 * 2. Explains what data is shared (screen content, messages)
 * 3. Collects explicit user consent via affirmative tap
 *
 * Persists consent via AsyncStorage so the dialog is shown once per device.
 * If AsyncStorage is unavailable, consent is session-scoped (per app launch).
 *
 * ## Business rationale
 * Apple rejects apps that silently send personal data to third-party AI services.
 * This component ensures compliance WITHOUT the app developer needing to build
 * their own consent flow — they just set `requireConsent={true}` on <AIAgent>.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet, Linking, Animated } from 'react-native';
import { isNativeOverlayActive } from "./FloatingOverlayWrapper.js";

// ─── AsyncStorage Helper ──────────────────────────────────────
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const CONSENT_STORAGE_KEY = '@mobileai_ai_consent_granted';
function getStorage() {
  try {
    const origError = console.error;
    console.error = (...args) => {
      const msg = args[0];
      if (typeof msg === 'string' && msg.includes('AsyncStorage')) return;
      origError.apply(console, args);
    };
    try {
      const mod = require('@react-native-async-storage/async-storage');
      const candidate = mod?.default ?? mod?.AsyncStorage ?? null;
      if (candidate && typeof candidate.getItem === 'function') return candidate;
      return null;
    } finally {
      console.error = origError;
    }
  } catch {
    return null;
  }
}

// ─── Provider Display Names ───────────────────────────────────

const PROVIDER_INFO = {
  gemini: {
    name: 'Google Gemini',
    company: 'Google',
    url: 'https://ai.google.dev/terms'
  },
  openai: {
    name: 'OpenAI GPT',
    company: 'OpenAI',
    url: 'https://openai.com/policies/terms-of-use'
  }
};
export const DEFAULT_CONSENT_THEME = {
  backdrop: 'rgba(9, 12, 16, 0.52)',
  cardBackground: '#ffffff',
  cardBorder: 'rgba(15, 23, 42, 0.08)',
  iconBackground: '#eef4ff',
  iconColor: '#3156d3',
  title: '#111827',
  body: '#4b5563',
  muted: '#6b7280',
  sectionBackground: '#f8fafc',
  sectionBorder: 'rgba(148, 163, 184, 0.22)',
  bullet: '#3156d3',
  badgeBackground: '#eef4ff',
  badgeText: '#3156d3',
  secondaryButtonBackground: '#f3f4f6',
  secondaryButtonText: '#374151',
  primaryButtonBackground: '#111827',
  primaryButtonText: '#ffffff',
  link: '#3156d3'
};
export function resolveConsentDialogContent(provider, config, language = 'en') {
  const isArabic = language === 'ar';
  const providerInfo = PROVIDER_INFO[provider] || PROVIDER_INFO.gemini;
  const theme = {
    ...DEFAULT_CONSENT_THEME,
    ...(config.theme || {})
  };
  const providerLabel = config.providerLabel || (isArabic ? 'خدمة الذكاء الاصطناعي المفعلة في التطبيق' : 'the AI service configured for this app');
  const providerUrl = config.providerUrl || providerInfo.url;
  const showProviderBadge = config.showProviderBadge === true;
  const title = isArabic ? config.titleAr || 'مساعد الذكاء الاصطناعي' : config.title || 'AI Assistant';
  const sharedDataItems = isArabic ? config.sharedDataItemsAr || ['رسالتك', 'يستخدم فقط المعلومات الظاهرة في شاشة التطبيق الحالية لفهم السياق'] : config.sharedDataItems || ['Your message', 'Relevant information from the current app screen'];
  return {
    isArabic,
    providerInfo,
    theme,
    providerLabel,
    providerUrl,
    showProviderBadge,
    title,
    sharedDataItems
  };
}

// ─── Public Types ─────────────────────────────────────────────

// ─── Props ────────────────────────────────────────────────────

// ─── Component ────────────────────────────────────────────────

export function AIConsentDialog({
  visible,
  provider,
  config,
  onConsent,
  onDecline,
  language = 'en'
}) {
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const isArabic = language === 'ar';
  const {
    theme,
    providerLabel,
    providerUrl,
    showProviderBadge,
    title,
    sharedDataItems
  } = resolveConsentDialogContent(provider, config, language);
  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true
      }).start();
    }
  }, [visible, fadeAnim]);
  const handlePrivacyPolicy = useCallback(() => {
    if (config.privacyPolicyUrl) {
      Linking.openURL(config.privacyPolicyUrl);
    }
  }, [config.privacyPolicyUrl]);
  const ContentWrapper = isNativeOverlayActive ? View : Modal;
  const wrapperProps = isNativeOverlayActive ? {
    style: [StyleSheet.absoluteFill, {
      zIndex: 99999,
      elevation: 99999
    }],
    pointerEvents: 'auto'
  } : {
    visible,
    transparent: true,
    animationType: "none",
    statusBarTranslucent: true,
    onRequestClose: onDecline
  };
  if (!visible) return null;
  return /*#__PURE__*/_jsx(ContentWrapper, {
    ...wrapperProps,
    children: /*#__PURE__*/_jsx(View, {
      style: [dialogStyles.backdrop, {
        backgroundColor: theme.backdrop
      }],
      children: /*#__PURE__*/_jsxs(Animated.View, {
        style: [dialogStyles.card, {
          opacity: fadeAnim,
          backgroundColor: theme.cardBackground,
          borderColor: theme.cardBorder
        }],
        children: [/*#__PURE__*/_jsx(View, {
          style: [dialogStyles.iconWrap, {
            backgroundColor: theme.iconBackground
          }],
          children: /*#__PURE__*/_jsx(Text, {
            style: [dialogStyles.iconText, {
              color: theme.iconColor
            }],
            children: "\u25CE"
          })
        }), /*#__PURE__*/_jsx(Text, {
          style: [dialogStyles.title, {
            color: theme.title
          }, isArabic && dialogStyles.textRTL],
          children: title
        }), /*#__PURE__*/_jsxs(View, {
          style: [dialogStyles.dataSection, {
            backgroundColor: theme.sectionBackground,
            borderColor: theme.sectionBorder
          }],
          children: [/*#__PURE__*/_jsx(Text, {
            style: [dialogStyles.dataLabel, {
              color: theme.muted
            }, isArabic && dialogStyles.textRTL],
            children: isArabic ? 'يُشارك مع مساعد الذكاء الاصطناعي:' : 'Shared with the AI agent:'
          }), sharedDataItems.map((item, index) => /*#__PURE__*/_jsxs(View, {
            style: dialogStyles.dataItem,
            children: [/*#__PURE__*/_jsx(Text, {
              style: [dialogStyles.dataBullet, {
                color: theme.bullet
              }],
              children: "\u2022"
            }), /*#__PURE__*/_jsx(Text, {
              style: [dialogStyles.dataText, {
                color: theme.body
              }, isArabic && dialogStyles.textRTL],
              children: item
            })]
          }, `${item}-${index}`))]
        }), showProviderBadge && /*#__PURE__*/_jsx(View, {
          style: [dialogStyles.providerBadge, {
            backgroundColor: theme.badgeBackground
          }],
          children: /*#__PURE__*/_jsx(Text, {
            style: [dialogStyles.providerBadgeText, {
              color: theme.badgeText
            }],
            children: config.providerBadgeText || (isArabic ? `تعمل بواسطة ${providerLabel}` : `Uses ${providerLabel}`)
          })
        }), config.privacyPolicyUrl && /*#__PURE__*/_jsx(Pressable, {
          onPress: handlePrivacyPolicy,
          style: dialogStyles.privacyLink,
          children: /*#__PURE__*/_jsx(Text, {
            style: [dialogStyles.privacyLinkText, {
              color: theme.link
            }],
            children: isArabic ? 'سياسة الخصوصية' : 'Privacy Policy'
          })
        }), !config.privacyPolicyUrl && providerUrl && showProviderBadge && /*#__PURE__*/_jsx(Pressable, {
          onPress: () => Linking.openURL(providerUrl),
          style: dialogStyles.privacyLink,
          children: /*#__PURE__*/_jsx(Text, {
            style: [dialogStyles.privacyLinkText, {
              color: theme.link
            }],
            children: isArabic ? 'معلومات إضافية' : 'Learn more'
          })
        }), /*#__PURE__*/_jsxs(View, {
          style: dialogStyles.buttonRow,
          children: [/*#__PURE__*/_jsx(Pressable, {
            style: [dialogStyles.declineBtn, {
              backgroundColor: theme.secondaryButtonBackground
            }],
            onPress: onDecline,
            accessibilityLabel: isArabic ? 'رفض' : 'Decline',
            children: /*#__PURE__*/_jsx(Text, {
              style: [dialogStyles.declineBtnText, {
                color: theme.secondaryButtonText
              }],
              children: isArabic ? 'ليس الآن' : 'Not now'
            })
          }), /*#__PURE__*/_jsx(Pressable, {
            style: [dialogStyles.consentBtn, {
              backgroundColor: theme.primaryButtonBackground
            }],
            onPress: onConsent,
            accessibilityLabel: isArabic ? 'متابعة' : 'Continue',
            children: /*#__PURE__*/_jsx(Text, {
              style: [dialogStyles.consentBtnText, {
                color: theme.primaryButtonText
              }],
              children: isArabic ? 'متابعة' : 'Continue'
            })
          })]
        })]
      })
    })
  });
}

// ─── Hook: useAIConsent ───────────────────────────────────────

/**
 * Manages consent state persistence via AsyncStorage.
 * Falls back to session-scoped state if AsyncStorage is unavailable.
 *
 * @returns [hasConsented, grantConsent, revokeConsent, isLoading]
 */
export function useAIConsent(persist = false) {
  const [hasConsented, setHasConsented] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load persisted consent on mount (ONLY if persist is true)
  useEffect(() => {
    void (async () => {
      try {
        if (!persist) return;
        const AS = getStorage();
        if (AS) {
          const stored = await AS.getItem(CONSENT_STORAGE_KEY);
          if (stored === 'true') {
            setHasConsented(true);
          }
        }
      } catch {
        // No persisted consent — will prompt
      } finally {
        setIsLoading(false);
      }
    })();
  }, [persist]);
  const grantConsent = useCallback(async () => {
    setHasConsented(true);
    try {
      if (!persist) return;
      const AS = getStorage();
      await AS?.setItem(CONSENT_STORAGE_KEY, 'true');
    } catch {
      // Consent granted session-only
    }
  }, [persist]);
  const revokeConsent = useCallback(async () => {
    setHasConsented(false);
    try {
      if (!persist) return;
      const AS = getStorage();
      await AS?.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Best effort
    }
  }, [persist]);
  return [hasConsented, grantConsent, revokeConsent, isLoading];
}

// ─── Styles ───────────────────────────────────────────────────

const dialogStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  card: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 10
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(123, 104, 238, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  iconText: {
    fontSize: 26,
    fontWeight: '700'
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
    textAlign: 'center'
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 10
  },
  summary: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16
  },
  textRTL: {
    textAlign: 'right',
    writingDirection: 'rtl'
  },
  dataSection: {
    width: '100%',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1
  },
  dataLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  dataItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4
  },
  dataBullet: {
    color: '#7B68EE',
    fontSize: 14,
    marginRight: 8,
    marginTop: 1
  },
  dataText: {
    fontSize: 13,
    flex: 1
  },
  providerBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12
  },
  providerBadgeText: {
    fontSize: 12,
    fontWeight: '600'
  },
  privacyLink: {
    marginBottom: 20
  },
  privacyLinkText: {
    fontSize: 13,
    textDecorationLine: 'underline'
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%'
  },
  declineBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  declineBtnText: {
    fontSize: 15,
    fontWeight: '600'
  },
  consentBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center'
  },
  consentBtnText: {
    fontSize: 15,
    fontWeight: '700'
  }
});
//# sourceMappingURL=AIConsentDialog.js.map