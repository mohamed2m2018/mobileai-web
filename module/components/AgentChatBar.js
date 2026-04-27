"use strict";

/**
 * AgentChatBar — Floating, draggable, compressible chat widget.
 * Supports two modes: Text and Voice.
 * Does not block underlying UI natively.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, Animated, PanResponder, ScrollView, Keyboard, Platform, useWindowDimensions, Linking } from 'react-native';
import { MicIcon, SpeakerIcon, SendArrowIcon, StopIcon, LoadingDots, AIBadge, HistoryIcon, NewChatIcon, CloseIcon } from "./Icons.js";
import { logger } from "../utils/logger.js";
import { DiscoveryTooltip } from "./DiscoveryTooltip.js";
import { resolveConsentDialogContent } from "./AIConsentDialog.js";
import { RichContentRenderer } from "./rich-content/RichContentRenderer.js";
import { markdownToPlainText } from "../core/richContent.js";

// ─── Props ─────────────────────────────────────────────────────
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// ─── Mode Selector ─────────────────────────────────────────────

function ModeSelector({
  modes,
  activeMode,
  onSelect,
  isArabic = false,
  totalUnread = 0
}) {
  if (modes.length <= 1) return null;
  const labels = {
    text: {
      label: isArabic ? 'نص' : 'Text'
    },
    voice: {
      label: isArabic ? 'صوت' : 'Voice'
    },
    human: {
      label: isArabic ? 'دعم' : 'Human'
    }
  };
  const dotColor = {
    text: '#7B68EE',
    voice: '#34C759',
    human: '#FF9500'
  };
  return /*#__PURE__*/_jsx(View, {
    style: modeStyles.container,
    children: modes.map(mode => /*#__PURE__*/_jsxs(Pressable, {
      style: [modeStyles.tab, activeMode === mode && modeStyles.tabActive],
      onPress: () => onSelect(mode),
      accessibilityLabel: `Switch to ${labels[mode].label} mode`,
      children: [activeMode === mode && /*#__PURE__*/_jsx(View, {
        style: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: dotColor[mode]
        }
      }), /*#__PURE__*/_jsx(Text, {
        style: [modeStyles.tabLabel, activeMode === mode && modeStyles.tabLabelActive],
        children: labels[mode].label
      }), mode === 'human' && totalUnread > 0 && /*#__PURE__*/_jsx(View, {
        style: styles.humanTabBadge,
        children: /*#__PURE__*/_jsx(Text, {
          style: styles.humanTabBadgeText,
          children: totalUnread > 99 ? '99+' : totalUnread
        })
      })]
    }, mode))
  });
}

// ─── Audio Control Button ──────────────────────────────────────

function AudioControlButton({
  children,
  isActive,
  onPress,
  label,
  size = 36
}) {
  return /*#__PURE__*/_jsx(Pressable, {
    style: [audioStyles.controlBtn, {
      width: size,
      height: size,
      borderRadius: size / 2
    }, isActive && audioStyles.controlBtnActive],
    onPress: onPress,
    accessibilityLabel: label,
    hitSlop: 8,
    children: children
  });
}

// ─── Dictation Button (optional expo-speech-recognition) ──────

/**
 * Try to load expo-speech-recognition as an optional peer dependency.
 * If not installed, returns null and the mic button won't render.
 * Same pattern as react-native-view-shot for screenshots.
 */
let SpeechModule = null;
try {
  // Static require — Metro needs a literal string for bundling.
  SpeechModule = require('expo-speech-recognition');
} catch {
  // Not installed — dictation button won't appear
}
function DictationButton({
  language,
  onTranscript,
  disabled
}) {
  const [isListening, setIsListening] = useState(false);

  // Don't render if expo-speech-recognition isn't installed
  if (!SpeechModule) return null;
  const {
    ExpoSpeechRecognitionModule
  } = SpeechModule;
  if (!ExpoSpeechRecognitionModule) return null;
  const toggle = async () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) return;

      // Register one-shot listeners for this recording session
      const resultListener = ExpoSpeechRecognitionModule.addListener('result', event => {
        const transcript = event.results?.[0]?.transcript;
        if (transcript && event.isFinal) {
          onTranscript(transcript);
        }
      });
      const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
        setIsListening(false);
        resultListener.remove();
        endListener.remove();
      });
      ExpoSpeechRecognitionModule.start({
        lang: language === 'ar' ? 'ar-SA' : 'en-US',
        interimResults: false,
        continuous: false,
        addsPunctuation: true
      });
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };
  return /*#__PURE__*/_jsx(Pressable, {
    style: [styles.dictationButton, isListening && styles.dictationButtonActive, disabled && styles.sendButtonDisabled],
    onPress: toggle,
    disabled: disabled,
    accessibilityLabel: isListening ? 'Stop dictation' : 'Start dictation',
    hitSlop: 8,
    children: isListening ? /*#__PURE__*/_jsx(StopIcon, {
      size: 18,
      color: "#FF3B30"
    }) : /*#__PURE__*/_jsx(MicIcon, {
      size: 18,
      color: "#fff"
    })
  });
}

// ─── Text Input Row ────────────────────────────────────────────

function TextInputRow({
  text,
  setText,
  onSend,
  onCancel,
  isThinking,
  isArabic,
  theme
}) {
  const inputRef = useRef(null);
  const handleSendWithClear = () => {
    onSend();
    // Imperatively clear the native TextInput — controlled `value=''` can be
    // ignored by the iOS native layer when editable flips to false in the same
    // render batch.
    inputRef.current?.clear();
  };
  const handlePrimaryAction = () => {
    if (!text.trim()) return;
    handleSendWithClear();
  };
  return /*#__PURE__*/_jsxs(View, {
    style: styles.inputRow,
    children: [/*#__PURE__*/_jsx(TextInput, {
      ref: inputRef,
      style: [styles.input, isArabic && styles.inputRTL, theme?.inputBackgroundColor ? {
        backgroundColor: theme.inputBackgroundColor
      } : undefined, theme?.textColor ? {
        color: theme.textColor
      } : undefined],
      placeholder: isArabic ? 'اكتب طلبك...' : 'Ask AI...',
      placeholderTextColor: theme?.textColor ? `${theme.textColor}66` : '#999',
      value: text,
      onChangeText: setText,
      onSubmitEditing: handleSendWithClear,
      returnKeyType: "default",
      blurOnSubmit: false,
      editable: !isThinking,
      multiline: true
    }), isThinking ? /*#__PURE__*/_jsx(Pressable, {
      style: [styles.stopButton, theme?.primaryColor ? {
        borderColor: theme.primaryColor
      } : undefined],
      onPress: onCancel,
      accessibilityLabel: "Stop AI Agent request",
      children: /*#__PURE__*/_jsx(StopIcon, {
        size: 18,
        color: theme?.textColor || '#fff'
      })
    }) : null, /*#__PURE__*/_jsx(DictationButton, {
      language: isArabic ? 'ar' : 'en',
      onTranscript: t => setText(t),
      disabled: isThinking
    }), /*#__PURE__*/_jsx(Pressable, {
      style: [styles.sendButton, (!text.trim() || isThinking) && styles.sendButtonDisabled, theme?.primaryColor ? {
        backgroundColor: theme.primaryColor
      } : undefined],
      onPress: handlePrimaryAction,
      disabled: isThinking || !text.trim(),
      accessibilityLabel: "Send request to AI Agent",
      children: /*#__PURE__*/_jsx(SendArrowIcon, {
        size: 18,
        color: theme?.textColor || '#fff'
      })
    })]
  });
}

// ─── Voice Controls Row ────────────────────────────────────────

function VoiceControlsRow({
  isMicActive,
  isSpeakerMuted,
  onMicToggle,
  onSpeakerToggle,
  isAISpeaking,
  isVoiceConnected = false,
  isArabic,
  onStopSession
}) {
  const isConnecting = !isVoiceConnected;
  return /*#__PURE__*/_jsxs(View, {
    style: styles.inputRow,
    children: [/*#__PURE__*/_jsx(AudioControlButton, {
      isActive: isSpeakerMuted,
      onPress: () => onSpeakerToggle(!isSpeakerMuted),
      label: isSpeakerMuted ? 'Unmute speaker' : 'Mute speaker',
      children: /*#__PURE__*/_jsx(SpeakerIcon, {
        size: 18,
        color: "#fff",
        muted: isSpeakerMuted
      })
    }), /*#__PURE__*/_jsxs(Pressable, {
      style: [audioStyles.micButton, isConnecting && audioStyles.micButtonConnecting, isMicActive && audioStyles.micButtonActive, isAISpeaking && audioStyles.micButtonSpeaking],
      onPress: () => {
        if (isMicActive) {
          // Stop button: full session cleanup
          onStopSession?.();
        } else if (!isConnecting) {
          // Talk button: start mic
          onMicToggle(true);
        }
      },
      disabled: isConnecting,
      accessibilityLabel: isConnecting ? 'Connecting...' : isMicActive ? 'Stop recording' : 'Start recording',
      children: [/*#__PURE__*/_jsx(View, {
        style: audioStyles.micIconWrap,
        children: isConnecting ? /*#__PURE__*/_jsx(LoadingDots, {
          size: 20,
          color: "#fff"
        }) : isAISpeaking ? /*#__PURE__*/_jsx(SpeakerIcon, {
          size: 20,
          color: "#fff"
        }) : isMicActive ? /*#__PURE__*/_jsx(StopIcon, {
          size: 20,
          color: "#fff"
        }) : /*#__PURE__*/_jsx(MicIcon, {
          size: 20,
          color: "#fff"
        })
      }), /*#__PURE__*/_jsx(Text, {
        style: audioStyles.micLabel,
        children: isConnecting ? isArabic ? 'جاري الاتصال...' : 'Connecting...' : isAISpeaking ? isArabic ? 'يتحدث...' : 'Speaking...' : isMicActive ? isArabic ? 'إيقاف' : 'Stop' : isArabic ? 'تحدث' : 'Talk'
      })]
    }), /*#__PURE__*/_jsx(View, {
      style: [audioStyles.statusDot, isVoiceConnected ? audioStyles.statusDotConnected : audioStyles.statusDotConnecting]
    })]
  });
}

// ─── Main Component ────────────────────────────────────────────

export function AgentChatBar({
  onSend,
  onCancel,
  isThinking,
  isActing = false,
  statusText,
  lastResult,
  language,
  availableModes = ['text'],
  mode = 'text',
  onModeChange,
  onMicToggle,
  onSpeakerToggle,
  isMicActive = false,
  isSpeakerMuted = false,
  isAISpeaking,
  isVoiceConnected,
  onStopSession,
  theme,
  tickets = [],
  selectedTicketId,
  onTicketSelect,
  autoExpandTrigger = 0,
  unreadCounts = {},
  totalUnread = 0,
  showDiscoveryTooltip = false,
  discoveryTooltipMessage,
  onTooltipDismiss,
  chatMessages = [],
  conversations = [],
  isLoadingHistory = false,
  onConversationSelect,
  onNewConversation,
  pendingApprovalQuestion,
  onPendingApprovalAction,
  renderMode = 'default',
  onWindowMetricsChange,
  windowMetrics,
  consentVisible = false,
  consentProvider = 'gemini',
  consentConfig,
  onConsentApprove,
  onConsentDecline
}) {
  const [text, setText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [localUnread, setLocalUnread] = useState(0);
  const [fabX, setFabX] = useState(10);
  const [showHistory, setShowHistory] = useState(false);
  const prevMsgCount = useRef(chatMessages.length);
  const scrollRef = useRef(null);
  const {
    height,
    width
  } = useWindowDimensions();
  const isArabic = language === 'ar';
  const consentContent = useMemo(() => resolveConsentDialogContent(consentProvider, consentConfig ?? {}, language), [consentConfig, consentProvider, language]);
  const [panelHeight, setPanelHeight] = useState(0);
  const preKeyboardYRef = useRef(null);
  const previousActingRef = useRef(false);
  const autoCollapsedForThinkingRef = useRef(false);
  const dragOriginRef = useRef({
    x: 0,
    y: 0
  });
  const panPositionRef = useRef({
    x: 10,
    y: height - 200
  });
  const panelHeightRef = useRef(0);
  const isExpandedRef = useRef(false);
  const isAndroidNativeWindow = renderMode === 'android-native-window';
  const metricsFrameRef = useRef(null);
  const pendingMetricsRef = useRef(null);
  const getExpandedWindowHeight = useCallback(measuredPanelHeight => {
    const minExpandedHeight = mode === 'voice' ? 150 : showHistory ? 280 : mode === 'human' ? 240 : consentVisible ? 320 : pendingApprovalQuestion ? 220 : 164;
    const maxExpandedHeight = Math.min(height * 0.65, 520);
    const naturalHeight = measuredPanelHeight > 0 ? measuredPanelHeight : minExpandedHeight;
    return Math.max(minExpandedHeight, Math.min(naturalHeight, maxExpandedHeight));
  }, [consentVisible, height, mode, pendingApprovalQuestion, showHistory]);
  const getWindowSize = useCallback((expanded = isExpandedRef.current, measuredPanelHeight = panelHeightRef.current) => {
    return {
      width: expanded ? 340 : 60,
      height: expanded ? getExpandedWindowHeight(measuredPanelHeight) : 60
    };
  }, [getExpandedWindowHeight]);
  const clampWindowPosition = useCallback((x, y, expanded = isExpandedRef.current, measuredPanelHeight = panelHeightRef.current) => {
    const screenInset = 10;
    const bottomInset = 24;
    const {
      width: windowWidth,
      height: windowHeight
    } = getWindowSize(expanded, measuredPanelHeight);
    const maxX = Math.max(screenInset, width - windowWidth - screenInset);
    const maxY = Math.max(screenInset, height - windowHeight - bottomInset);
    return {
      x: Math.min(Math.max(x, screenInset), maxX),
      y: Math.min(Math.max(y, screenInset), maxY)
    };
  }, [getWindowSize, height, width]);
  const publishWindowMetrics = useCallback((x = panPositionRef.current.x, y = panPositionRef.current.y, expanded = isExpandedRef.current, measuredPanelHeight = panelHeightRef.current) => {
    if (!onWindowMetricsChange) return;
    const {
      x: clampedX,
      y: clampedY
    } = clampWindowPosition(x, y, expanded, measuredPanelHeight);
    const {
      width: resolvedWidth,
      height: resolvedHeight
    } = getWindowSize(expanded, measuredPanelHeight);
    const nextMetrics = {
      x: Math.round(clampedX),
      y: Math.round(clampedY),
      width: resolvedWidth,
      height: Math.round(resolvedHeight)
    };
    onWindowMetricsChange(nextMetrics);
  }, [clampWindowPosition, getWindowSize, onWindowMetricsChange]);
  const publishNativeWindowPosition = useCallback((x, y, expanded = isExpandedRef.current, measuredPanelHeight = panelHeightRef.current) => {
    const clampedPosition = clampWindowPosition(x, y, expanded, measuredPanelHeight);
    panPositionRef.current = clampedPosition;
    publishWindowMetrics(clampedPosition.x, clampedPosition.y, expanded, measuredPanelHeight);
  }, [clampWindowPosition, publishWindowMetrics]);
  const scheduleWindowMetricsPublish = useCallback((x = panPositionRef.current.x, y = panPositionRef.current.y, expanded = isExpandedRef.current, measuredPanelHeight = panelHeightRef.current) => {
    if (!onWindowMetricsChange) return;
    pendingMetricsRef.current = {
      x,
      y,
      expanded,
      measuredPanelHeight
    };
    if (metricsFrameRef.current != null) return;
    metricsFrameRef.current = requestAnimationFrame(() => {
      metricsFrameRef.current = null;
      const pending = pendingMetricsRef.current;
      pendingMetricsRef.current = null;
      if (!pending) return;
      publishWindowMetrics(pending.x, pending.y, pending.expanded, pending.measuredPanelHeight);
    });
  }, [onWindowMetricsChange, publishWindowMetrics]);

  // Track incoming AI messages while collapsed
  useEffect(() => {
    if (chatMessages.length > prevMsgCount.current && !isExpanded) {
      setLocalUnread(prev => prev + (chatMessages.length - prevMsgCount.current));
    }
    prevMsgCount.current = chatMessages.length;
  }, [chatMessages.length, isExpanded]);
  const displayUnread = totalUnread + localUnread;

  // Auto-expand when triggered (e.g. on escalation)
  useEffect(() => {
    if (autoExpandTrigger > 0) setIsExpanded(true);
  }, [autoExpandTrigger]);
  useEffect(() => {
    if (!consentVisible) return;
    autoCollapsedForThinkingRef.current = false;
    setShowHistory(false);
    setIsExpanded(true);
  }, [consentVisible]);
  useEffect(() => {
    return () => {
      if (metricsFrameRef.current != null) {
        cancelAnimationFrame(metricsFrameRef.current);
      }
    };
  }, []);
  useEffect(() => {
    const wasActing = previousActingRef.current;
    if (!wasActing && isActing && isExpanded && !pendingApprovalQuestion && !consentVisible) {
      autoCollapsedForThinkingRef.current = true;
      setShowHistory(false);
      setIsExpanded(false);
    }
    if (pendingApprovalQuestion) {
      setIsExpanded(true);
      autoCollapsedForThinkingRef.current = false;
    }
    if (wasActing && !isActing) {
      autoCollapsedForThinkingRef.current = false;
    }
    previousActingRef.current = isActing;
  }, [consentVisible, isActing, isExpanded, pendingApprovalQuestion]);
  const pan = useRef(new Animated.ValueXY({
    x: 10,
    y: height - 200
  })).current;
  useEffect(() => {
    if (!isAndroidNativeWindow || !windowMetrics) return;
    const nextPosition = {
      x: windowMetrics.x,
      y: windowMetrics.y
    };
    if (panPositionRef.current.x === nextPosition.x && panPositionRef.current.y === nextPosition.y) {
      return;
    }
    panPositionRef.current = nextPosition;
    pan.setValue(nextPosition);
  }, [isAndroidNativeWindow, pan, windowMetrics]);
  const tooltipSide = fabX < width / 2 ? 'right' : 'left';
  const expandedContentMinHeight = getExpandedWindowHeight(0);
  useEffect(() => {
    isExpandedRef.current = isExpanded;
    const clampedPosition = clampWindowPosition(panPositionRef.current.x, panPositionRef.current.y, isExpanded);
    if (clampedPosition.x !== panPositionRef.current.x || clampedPosition.y !== panPositionRef.current.y) {
      panPositionRef.current = clampedPosition;
      pan.setValue(clampedPosition);
      if (!isAndroidNativeWindow) {
        setFabX(clampedPosition.x);
      }
    }
    scheduleWindowMetricsPublish(clampedPosition.x, clampedPosition.y, isExpanded);
  }, [clampWindowPosition, isAndroidNativeWindow, isExpanded, pan, scheduleWindowMetricsPublish]);
  useEffect(() => {
    if (isAndroidNativeWindow) return;
    const xListenerId = pan.x.addListener(({
      value
    }) => {
      panPositionRef.current.x = value;
      if (!isAndroidNativeWindow) {
        setFabX(value);
      }
      scheduleWindowMetricsPublish(value, panPositionRef.current.y);
    });
    const yListenerId = pan.y.addListener(({
      value
    }) => {
      panPositionRef.current.y = value;
      scheduleWindowMetricsPublish(panPositionRef.current.x, value);
    });
    return () => {
      pan.x.removeListener(xListenerId);
      pan.y.removeListener(yListenerId);
    };
  }, [isAndroidNativeWindow, pan.x, pan.y, scheduleWindowMetricsPublish]);

  // ─── Keyboard Handling ──────────────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const keyboardMargin = 12;
    const showSub = Keyboard.addListener(showEvent, e => {
      if (!isExpanded || mode !== 'text' || panelHeight <= 0) return;
      if (isAndroidNativeWindow) {
        const currentY = panPositionRef.current.y;
        const targetY = Math.max(keyboardMargin, height - e.endCoordinates.height - panelHeight - keyboardMargin);
        preKeyboardYRef.current = currentY;
        if (currentY <= targetY) return;
        publishNativeWindowPosition(panPositionRef.current.x, targetY);
        return;
      }
      pan.y.stopAnimation(currentY => {
        const targetY = Math.max(keyboardMargin, height - e.endCoordinates.height - panelHeight - keyboardMargin);

        // Preserve the pre-keyboard position so we can restore it on hide.
        preKeyboardYRef.current = currentY;

        // Only lift the widget if the keyboard would overlap it.
        if (currentY <= targetY) return;
        Animated.timing(pan.y, {
          toValue: targetY,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 200,
          useNativeDriver: false
        }).start();
      });
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      const restoreY = preKeyboardYRef.current;
      if (restoreY == null) return;
      preKeyboardYRef.current = null;
      if (isAndroidNativeWindow) {
        publishNativeWindowPosition(panPositionRef.current.x, restoreY);
        return;
      }
      Animated.timing(pan.y, {
        toValue: restoreY,
        duration: 200,
        useNativeDriver: false
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [height, isAndroidNativeWindow, isExpanded, mode, pan.y, panelHeight, publishNativeWindowPosition]);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
    },
    onPanResponderGrant: () => {
      if (isAndroidNativeWindow) {
        dragOriginRef.current = {
          ...panPositionRef.current
        };
        return;
      }
      pan.extractOffset();
      pan.setValue({
        x: 0,
        y: 0
      });
    },
    onPanResponderMove: (event, gestureState) => {
      if (isAndroidNativeWindow) {
        publishNativeWindowPosition(dragOriginRef.current.x + gestureState.dx, dragOriginRef.current.y + gestureState.dy);
        return;
      }
      Animated.event([null, {
        dx: pan.x,
        dy: pan.y
      }], {
        useNativeDriver: false
      })(event, gestureState);
    },
    onPanResponderRelease: () => {
      if (isAndroidNativeWindow) {
        publishNativeWindowPosition(panPositionRef.current.x, panPositionRef.current.y);
        return;
      }
      pan.flattenOffset();
      const clampedPosition = clampWindowPosition(panPositionRef.current.x, panPositionRef.current.y);
      Animated.spring(pan, {
        toValue: clampedPosition,
        useNativeDriver: false,
        tension: 120,
        friction: 14
      }).start(() => {
        panPositionRef.current = clampedPosition;
        if (!isAndroidNativeWindow) {
          setFabX(clampedPosition.x);
        }
        scheduleWindowMetricsPublish(clampedPosition.x, clampedPosition.y);
      });
    }
  }), [clampWindowPosition, isAndroidNativeWindow, pan, publishNativeWindowPosition, scheduleWindowMetricsPublish]);
  const jsDragHandlers = isAndroidNativeWindow ? undefined : panResponder.panHandlers;
  const handleSend = () => {
    if (text.trim() && !isThinking) {
      onSend(text.trim());
      setText('');
    }
  };

  // ─── HEAVY DEBUG LOGGING ──────────────────────────────────────
  logger.info('ChatBar', '★★★ RENDER — mode:', mode, '| selectedTicketId:', selectedTicketId, '| tickets:', tickets.length, '| availableModes:', availableModes, '| lastResult:', lastResult ? lastResult.message.substring(0, 60) : 'null', '| isExpanded:', isExpanded);

  // ─── FAB (Compressed) ──────────────────────────────────────

  if (!isExpanded) {
    return /*#__PURE__*/_jsxs(Animated.View, {
      style: [styles.fabContainer, isAndroidNativeWindow ? styles.fabContainerNativeWindow : pan.getLayout()],
      ...(jsDragHandlers ?? {}),
      children: [/*#__PURE__*/_jsx(Pressable, {
        style: [styles.fab, theme?.primaryColor ? {
          backgroundColor: theme.primaryColor
        } : undefined],
        onPress: () => {
          onTooltipDismiss?.();
          setLocalUnread(0);
          autoCollapsedForThinkingRef.current = false;
          setIsExpanded(true);
        },
        accessibilityLabel: displayUnread > 0 ? `Open AI Agent Chat - ${displayUnread} unread messages` : 'Open AI Agent Chat',
        children: isThinking ? /*#__PURE__*/_jsx(LoadingDots, {
          size: 28,
          color: theme?.textColor || '#fff'
        }) : /*#__PURE__*/_jsx(AIBadge, {
          size: 28
        })
      }), showDiscoveryTooltip && !isAndroidNativeWindow && /*#__PURE__*/_jsx(DiscoveryTooltip, {
        language: language,
        primaryColor: theme?.primaryColor,
        message: discoveryTooltipMessage,
        side: tooltipSide,
        onDismiss: () => onTooltipDismiss?.()
      }), localUnread > 0 && chatMessages.length > 0 && !isAndroidNativeWindow && /*#__PURE__*/_jsxs(Pressable, {
        style: [styles.unreadPopup, isArabic ? styles.unreadPopupRTL : styles.unreadPopupLTR],
        onPress: () => {
          onTooltipDismiss?.();
          setLocalUnread(0);
          setIsExpanded(true);
        },
        children: [/*#__PURE__*/_jsx(Text, {
          style: [styles.unreadPopupText, {
            textAlign: isArabic ? 'right' : 'left'
          }],
          numberOfLines: 2,
          children: (() => {
            const lastMsg = [...chatMessages].reverse().find(m => m.role === 'assistant');
            if (!lastMsg) return isArabic ? 'رسالة جديدة' : 'New message';
            const content = Array.isArray(lastMsg.content) ? lastMsg.content.map(c => c.type === 'text' ? c.content : '').join('') : '';
            return content || (isArabic ? 'رسالة جديدة' : 'New message');
          })()
        }), displayUnread > 1 && /*#__PURE__*/_jsx(View, {
          style: [styles.fabUnreadBadge, styles.popupBadgeOverride],
          pointerEvents: "none",
          children: /*#__PURE__*/_jsx(Text, {
            style: styles.fabUnreadBadgeText,
            children: displayUnread > 99 ? '99+' : displayUnread
          })
        })]
      }), isThinking && !pendingApprovalQuestion && !isAndroidNativeWindow && /*#__PURE__*/_jsxs(Pressable, {
        style: [styles.statusPopup, isArabic ? styles.unreadPopupRTL : styles.unreadPopupLTR],
        onPress: () => {
          autoCollapsedForThinkingRef.current = false;
          setIsExpanded(true);
        },
        children: [/*#__PURE__*/_jsx(LoadingDots, {
          size: 14,
          color: "#111827"
        }), /*#__PURE__*/_jsx(Text, {
          style: [styles.statusPopupText, {
            textAlign: isArabic ? 'right' : 'left'
          }],
          numberOfLines: 2,
          children: statusText || (isArabic ? 'جاري التنفيذ...' : 'Working...')
        })]
      }), displayUnread > 0 && localUnread === 0 && /*#__PURE__*/_jsx(View, {
        style: styles.fabUnreadBadge,
        pointerEvents: "none",
        children: /*#__PURE__*/_jsx(Text, {
          style: styles.fabUnreadBadgeText,
          children: displayUnread > 99 ? '99+' : displayUnread
        })
      })]
    });
  }

  // ─── Expanded Widget ───────────────────────────────────────

  return /*#__PURE__*/_jsxs(Animated.View, {
    style: [styles.expandedContainer, isAndroidNativeWindow ? styles.expandedContainerNativeWindow : pan.getLayout(), isAndroidNativeWindow ? {
      minHeight: expandedContentMinHeight
    } : null, {
      maxHeight: height * 0.65
    }, theme?.backgroundColor ? {
      backgroundColor: theme.backgroundColor
    } : undefined],
    onLayout: event => {
      const nextHeight = event.nativeEvent.layout.height;
      if (Math.abs(nextHeight - panelHeight) > 1) {
        panelHeightRef.current = nextHeight;
        setPanelHeight(nextHeight);
        scheduleWindowMetricsPublish(panPositionRef.current.x, panPositionRef.current.y, true, nextHeight);
      }
    },
    children: [/*#__PURE__*/_jsx(View, {
      ...(jsDragHandlers ?? {}),
      style: styles.dragHandleArea,
      accessibilityLabel: "Drag AI Agent",
      children: /*#__PURE__*/_jsx(View, {
        style: styles.dragGrip
      })
    }), /*#__PURE__*/_jsx(Pressable, {
      onPress: () => {
        setIsExpanded(false);
        setShowHistory(false);
      },
      style: styles.minimizeBtn,
      accessibilityLabel: "Minimize AI Agent",
      children: /*#__PURE__*/_jsx(Text, {
        style: styles.minimizeText,
        children: "\u2014"
      })
    }), onConversationSelect && !showHistory && /*#__PURE__*/_jsxs(View, {
      style: historyStyles.headerActions,
      children: [/*#__PURE__*/_jsxs(Pressable, {
        style: historyStyles.historyBtn,
        onPress: () => setShowHistory(true),
        accessibilityLabel: "View conversation history",
        hitSlop: 8,
        children: [/*#__PURE__*/_jsx(HistoryIcon, {
          size: 18,
          color: "rgba(255,255,255,0.55)"
        }), conversations.length > 0 && /*#__PURE__*/_jsx(View, {
          style: historyStyles.historyCountBadge,
          children: /*#__PURE__*/_jsx(Text, {
            style: historyStyles.historyCountBadgeText,
            children: conversations.length > 9 ? '9+' : conversations.length
          })
        })]
      }), onNewConversation && /*#__PURE__*/_jsx(Pressable, {
        style: historyStyles.quickNewBtn,
        onPress: onNewConversation,
        accessibilityLabel: "Start new conversation",
        hitSlop: 8,
        children: /*#__PURE__*/_jsx(Text, {
          style: historyStyles.quickNewBtnText,
          children: "+"
        })
      })]
    }), !isAndroidNativeWindow && /*#__PURE__*/_jsxs(_Fragment, {
      children: [/*#__PURE__*/_jsx(View, {
        ...panResponder.panHandlers,
        style: [styles.cornerHandle, styles.cornerTL],
        pointerEvents: "box-only",
        children: /*#__PURE__*/_jsx(View, {
          style: [styles.cornerIndicator, styles.cornerIndicatorTL]
        })
      }), /*#__PURE__*/_jsx(View, {
        ...panResponder.panHandlers,
        style: [styles.cornerHandle, styles.cornerTR],
        pointerEvents: "box-only",
        children: /*#__PURE__*/_jsx(View, {
          style: [styles.cornerIndicator, styles.cornerIndicatorTR]
        })
      }), /*#__PURE__*/_jsx(View, {
        ...panResponder.panHandlers,
        style: [styles.cornerHandle, styles.cornerBL],
        pointerEvents: "box-only",
        children: /*#__PURE__*/_jsx(View, {
          style: [styles.cornerIndicator, styles.cornerIndicatorBL]
        })
      }), /*#__PURE__*/_jsx(View, {
        ...panResponder.panHandlers,
        style: [styles.cornerHandle, styles.cornerBR],
        pointerEvents: "box-only",
        children: /*#__PURE__*/_jsx(View, {
          style: [styles.cornerIndicator, styles.cornerIndicatorBR]
        })
      })]
    }), !showHistory && /*#__PURE__*/_jsx(ModeSelector, {
      modes: availableModes,
      activeMode: mode,
      onSelect: m => onModeChange?.(m),
      isArabic: isArabic,
      totalUnread: totalUnread
    }), showHistory && /*#__PURE__*/_jsxs(View, {
      style: historyStyles.panel,
      children: [/*#__PURE__*/_jsxs(View, {
        style: historyStyles.headerRow,
        children: [/*#__PURE__*/_jsx(Pressable, {
          style: historyStyles.backBtn,
          onPress: () => setShowHistory(false),
          accessibilityLabel: "Back to chat",
          hitSlop: 8,
          children: /*#__PURE__*/_jsxs(View, {
            style: {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4
            },
            children: [/*#__PURE__*/_jsx(CloseIcon, {
              size: 13,
              color: "#7B68EE"
            }), /*#__PURE__*/_jsx(Text, {
              style: historyStyles.backBtnText,
              children: "Back"
            })]
          })
        }), /*#__PURE__*/_jsxs(View, {
          style: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6
          },
          children: [/*#__PURE__*/_jsx(HistoryIcon, {
            size: 15,
            color: "rgba(255,255,255,0.7)"
          }), /*#__PURE__*/_jsx(Text, {
            style: historyStyles.headerTitle,
            children: "History"
          })]
        }), /*#__PURE__*/_jsx(Pressable, {
          style: historyStyles.newBtn,
          onPress: () => {
            onNewConversation?.();
            setShowHistory(false);
          },
          accessibilityLabel: "Start new conversation",
          hitSlop: 8,
          children: /*#__PURE__*/_jsxs(View, {
            style: {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5
            },
            children: [/*#__PURE__*/_jsx(NewChatIcon, {
              size: 14,
              color: "#7B68EE"
            }), /*#__PURE__*/_jsx(Text, {
              style: historyStyles.newBtnText,
              children: "New"
            })]
          })
        })]
      }), isLoadingHistory && conversations.length === 0 && /*#__PURE__*/_jsx(View, {
        style: historyStyles.shimmerWrap,
        children: [1, 2, 3].map(i => /*#__PURE__*/_jsxs(View, {
          style: historyStyles.shimmerCard,
          children: [/*#__PURE__*/_jsx(View, {
            style: [historyStyles.shimmerLine, {
              width: '70%'
            }]
          }), /*#__PURE__*/_jsx(View, {
            style: [historyStyles.shimmerLine, {
              width: '45%',
              marginTop: 6,
              opacity: 0.5
            }]
          })]
        }, i))
      }), !isLoadingHistory && conversations.length === 0 && /*#__PURE__*/_jsxs(View, {
        style: historyStyles.emptyWrap,
        children: [/*#__PURE__*/_jsx(HistoryIcon, {
          size: 36,
          color: "rgba(255,255,255,0.25)"
        }), /*#__PURE__*/_jsx(Text, {
          style: historyStyles.emptyTitle,
          children: "No previous conversations"
        }), /*#__PURE__*/_jsx(Text, {
          style: historyStyles.emptySubtitle,
          children: "Your AI conversations will appear here"
        })]
      }), conversations.length > 0 && /*#__PURE__*/_jsx(ScrollView, {
        style: {
          maxHeight: height * 0.65 - 130
        },
        nestedScrollEnabled: true,
        showsVerticalScrollIndicator: false,
        children: conversations.map(conv => {
          const relativeDate = getRelativeDate(conv.updatedAt);
          return /*#__PURE__*/_jsxs(Pressable, {
            style: ({
              pressed
            }) => [historyStyles.convCard, pressed && historyStyles.convCardPressed],
            onPress: () => {
              onConversationSelect?.(conv.id);
              setShowHistory(false);
            },
            accessibilityLabel: `Load conversation: ${conv.title}`,
            children: [/*#__PURE__*/_jsxs(View, {
              style: historyStyles.convCardTop,
              children: [/*#__PURE__*/_jsx(Text, {
                style: historyStyles.convTitle,
                numberOfLines: 1,
                children: conv.title
              }), /*#__PURE__*/_jsx(View, {
                style: historyStyles.convMsgBadge,
                children: /*#__PURE__*/_jsx(Text, {
                  style: historyStyles.convMsgBadgeText,
                  children: conv.messageCount
                })
              })]
            }), /*#__PURE__*/_jsx(Text, {
              style: historyStyles.convPreview,
              numberOfLines: 1,
              children: conv.preview || 'No messages'
            }), /*#__PURE__*/_jsx(Text, {
              style: historyStyles.convDate,
              children: relativeDate
            })]
          }, conv.id);
        })
      })]
    }), !showHistory && /*#__PURE__*/_jsxs(_Fragment, {
      children: [mode !== 'human' && chatMessages.length > 0 && /*#__PURE__*/_jsxs(ScrollView, {
        style: [styles.messageList, {
          maxHeight: height * 0.65 - 178
        }],
        nestedScrollEnabled: true,
        ref: scrollRef,
        onContentSizeChange: () => scrollRef.current?.scrollToEnd({
          animated: true
        }),
        children: [chatMessages.filter(msg => msg.role === 'user' || msg.role === 'assistant').map(msg => {
          const isUser = msg.role === 'user';
          return /*#__PURE__*/_jsx(View, {
            style: [styles.messageBubble, isUser ? styles.messageBubbleUser : styles.messageBubbleAI, isUser && theme?.primaryColor ? {
              backgroundColor: theme.primaryColor
            } : undefined],
            children: /*#__PURE__*/_jsx(RichContentRenderer, {
              content: msg.content,
              surface: "chat",
              isUser: isUser,
              textStyle: [styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAI, {
                textAlign: isArabic ? 'right' : 'left'
              }]
            })
          }, msg.id || `${msg.role}-${Math.random()}`);
        }), isThinking && /*#__PURE__*/_jsx(View, {
          style: [styles.messageBubble, styles.messageBubbleAI],
          children: /*#__PURE__*/_jsx(LoadingDots, {
            size: 18,
            color: "#fff"
          })
        })]
      }), mode === 'text' && /*#__PURE__*/_jsxs(_Fragment, {
        children: [consentVisible ? /*#__PURE__*/_jsxs(View, {
          style: styles.approvalPanel,
          children: [/*#__PURE__*/_jsxs(View, {
            style: styles.inlineConsentSummary,
            children: [/*#__PURE__*/_jsx(Text, {
              style: [styles.inlineConsentSummaryLabel, isArabic ? styles.inlineConsentTextRTL : null],
              children: isArabic ? 'ما سنشاركه مع المساعد:' : "What we'll share with the assistant:"
            }), consentContent.sharedDataItems.map((item, index) => /*#__PURE__*/_jsxs(View, {
              style: styles.inlineConsentSummaryRow,
              children: [/*#__PURE__*/_jsx(Text, {
                style: styles.inlineConsentBullet,
                children: "\u2022"
              }), /*#__PURE__*/_jsx(Text, {
                style: [styles.inlineConsentSummaryText, isArabic ? styles.inlineConsentTextRTL : null],
                children: item
              })]
            }, `${item}-${index}`))]
          }), (consentConfig?.privacyPolicyUrl || !consentConfig?.privacyPolicyUrl && consentContent.showProviderBadge && consentContent.providerUrl) && /*#__PURE__*/_jsx(Pressable, {
            onPress: () => Linking.openURL(consentConfig?.privacyPolicyUrl || consentContent.providerUrl),
            style: styles.inlineConsentLinkWrap,
            children: /*#__PURE__*/_jsx(Text, {
              style: styles.inlineConsentLink,
              children: consentConfig?.privacyPolicyUrl ? isArabic ? 'سياسة الخصوصية' : 'Privacy Policy' : isArabic ? 'معلومات إضافية' : 'Learn more'
            })
          }), /*#__PURE__*/_jsxs(View, {
            style: styles.approvalActions,
            children: [/*#__PURE__*/_jsx(Pressable, {
              style: [styles.approvalActionBtn, styles.approvalActionSecondary],
              onPress: onConsentDecline,
              children: /*#__PURE__*/_jsx(Text, {
                style: [styles.approvalActionText, styles.approvalActionSecondaryText],
                children: isArabic ? 'عدم السماح' : 'Don’t Allow'
              })
            }), /*#__PURE__*/_jsx(Pressable, {
              style: [styles.approvalActionBtn, styles.approvalActionPrimary],
              onPress: onConsentApprove,
              children: /*#__PURE__*/_jsx(Text, {
                style: [styles.approvalActionText, styles.approvalActionPrimaryText],
                children: isArabic ? 'السماح' : 'Allow'
              })
            })]
          })]
        }) : pendingApprovalQuestion && onPendingApprovalAction ? /*#__PURE__*/_jsxs(View, {
          style: styles.approvalPanel,
          children: [/*#__PURE__*/_jsx(Text, {
            style: styles.approvalHint,
            children: "The AI agent is requesting permission to perform this action. Tap \"Allow\" to approve, or \"Don\u2019t Allow\" to cancel."
          }), /*#__PURE__*/_jsxs(View, {
            style: styles.approvalActions,
            children: [/*#__PURE__*/_jsx(Pressable, {
              style: [styles.approvalActionBtn, styles.approvalActionSecondary],
              onPress: () => onPendingApprovalAction('reject'),
              children: /*#__PURE__*/_jsx(Text, {
                style: [styles.approvalActionText, styles.approvalActionSecondaryText],
                children: "Don\u2019t Allow"
              })
            }), /*#__PURE__*/_jsx(Pressable, {
              style: [styles.approvalActionBtn, styles.approvalActionPrimary],
              onPress: () => onPendingApprovalAction('approve'),
              children: /*#__PURE__*/_jsx(Text, {
                style: [styles.approvalActionText, styles.approvalActionPrimaryText],
                children: "Allow"
              })
            })]
          })]
        }) : null, !consentVisible && /*#__PURE__*/_jsx(TextInputRow, {
          text: text,
          setText: setText,
          onSend: handleSend,
          onCancel: onCancel,
          isThinking: isThinking,
          isArabic: isArabic,
          theme: theme
        })]
      }), mode === 'human' && !selectedTicketId && /*#__PURE__*/_jsx(ScrollView, {
        style: styles.ticketList,
        nestedScrollEnabled: true,
        children: tickets.length === 0 ? /*#__PURE__*/_jsx(Text, {
          style: styles.emptyText,
          children: "No active tickets"
        }) : tickets.map(ticket => {
          const unreadCount = unreadCounts[ticket.id] || 0;
          return /*#__PURE__*/_jsxs(Pressable, {
            style: styles.ticketCard,
            onPress: () => onTicketSelect?.(ticket.id),
            children: [/*#__PURE__*/_jsxs(View, {
              style: styles.ticketTopRow,
              children: [/*#__PURE__*/_jsx(Text, {
                style: styles.ticketReason,
                numberOfLines: 2,
                children: markdownToPlainText(ticket.history.length > 0 ? ticket.history[ticket.history.length - 1]?.content ?? ticket.reason : ticket.reason)
              }), unreadCount > 0 && /*#__PURE__*/_jsx(View, {
                style: styles.unreadBadge,
                children: /*#__PURE__*/_jsx(Text, {
                  style: styles.unreadBadgeText,
                  children: unreadCount > 99 ? '99+' : unreadCount
                })
              })]
            }), /*#__PURE__*/_jsx(View, {
              style: styles.ticketMeta,
              children: /*#__PURE__*/_jsx(Text, {
                style: [styles.ticketStatus, ticket.status === 'open' && styles.statusOpen],
                children: ticket.status
              })
            })]
          }, ticket.id);
        })
      }), mode === 'human' && selectedTicketId && null, mode === 'voice' && /*#__PURE__*/_jsx(VoiceControlsRow, {
        isMicActive: isMicActive,
        isSpeakerMuted: isSpeakerMuted,
        onMicToggle: onMicToggle || (() => {}),
        onSpeakerToggle: onSpeakerToggle || (() => {}),
        isAISpeaking: isAISpeaking,
        isVoiceConnected: isVoiceConnected,
        isArabic: isArabic,
        onStopSession: onStopSession
      })]
    })]
  });
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fabContainer: {
    position: 'absolute',
    zIndex: 9999
  },
  fabContainerNativeWindow: {
    position: 'relative'
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.3,
    shadowRadius: 6
  },
  fabIcon: {
    fontSize: 28
  },
  unreadPopup: {
    position: 'absolute',
    bottom: 70,
    // Float above the FAB
    left: -70,
    // Centered over a 60px FAB
    width: 200,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.25,
    shadowRadius: 5
  },
  unreadPopupLTR: {
    borderBottomLeftRadius: 4
  },
  unreadPopupRTL: {
    borderBottomRightRadius: 4
  },
  unreadPopupText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20
  },
  statusPopup: {
    position: 'absolute',
    bottom: 70,
    left: -70,
    width: 220,
    minHeight: 48,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  statusPopupText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    flex: 1
  },
  popupBadgeOverride: {
    top: -8,
    right: -8,
    borderColor: '#fff'
  },
  expandedContainer: {
    position: 'absolute',
    zIndex: 9999,
    width: 340,
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    borderRadius: 24,
    padding: 16,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.4,
    shadowRadius: 10
  },
  expandedContainerNativeWindow: {
    position: 'relative'
  },
  dragHandleArea: {
    width: '100%',
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8
  },
  dragGrip: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4
  },
  minimizeBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 12,
    zIndex: 20 // ensure it sits above the drag corner
  },
  minimizeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  // ── Corner drag handles ────────────────────────────────────────
  cornerHandle: {
    position: 'absolute',
    width: 32,
    height: 32,
    zIndex: 10
  },
  cornerTL: {
    top: 0,
    left: 0
  },
  cornerTR: {
    top: 0,
    right: 0
  },
  cornerBL: {
    bottom: 0,
    left: 0
  },
  cornerBR: {
    bottom: 0,
    right: 0
  },
  // Subtle L-shaped indicator so users know the corners are draggable
  cornerIndicator: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.25)'
  },
  cornerIndicatorTL: {
    top: 6,
    left: 6,
    width: 10,
    height: 2,
    borderTopLeftRadius: 1
  },
  cornerIndicatorTR: {
    top: 6,
    right: 6,
    width: 10,
    height: 2,
    borderTopRightRadius: 1
  },
  cornerIndicatorBL: {
    bottom: 6,
    left: 6,
    width: 10,
    height: 2,
    borderBottomLeftRadius: 1
  },
  cornerIndicatorBR: {
    bottom: 6,
    right: 6,
    width: 10,
    height: 2,
    borderBottomRightRadius: 1
  },
  messageList: {
    marginBottom: 12,
    flexShrink: 1
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
    maxWidth: '85%',
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden'
  },
  messageBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: '#7B68EE',
    borderBottomRightRadius: 4
  },
  messageBubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 4
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    maxWidth: '100%',
    minWidth: 0,
    flexShrink: 1,
    flexWrap: 'wrap',
    ...(Platform.OS === 'web' ? {
      overflowWrap: 'anywhere',
      wordBreak: 'break-word'
    } : null)
  },
  messageTextUser: {
    color: '#fff'
  },
  messageTextAI: {
    color: '#fff' // Or slightly off-white for contrast
  },
  dismissButton: {
    marginLeft: 8,
    padding: 2
  },
  dismissText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: 'bold'
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    flexShrink: 0,
    paddingBottom: 2 // Slight padding so buttons don't clip against bottom edge
  },
  approvalPanel: {
    marginBottom: 10,
    gap: 8
  },
  inlineConsentSummary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  inlineConsentSummaryLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8
  },
  inlineConsentSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 5
  },
  inlineConsentBullet: {
    color: '#7B68EE',
    fontSize: 14,
    marginRight: 8,
    marginTop: 1
  },
  inlineConsentSummaryText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.86)'
  },
  inlineConsentTextRTL: {
    textAlign: 'right',
    writingDirection: 'rtl'
  },
  inlineConsentLinkWrap: {
    alignItems: 'center',
    marginBottom: 12
  },
  inlineConsentLink: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    color: '#7B68EE'
  },
  approvalHint: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center'
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 8
  },
  approvalActionBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  approvalActionPrimary: {
    backgroundColor: '#7B68EE'
  },
  approvalActionNeutral: {
    backgroundColor: 'rgba(255,255,255,0.16)'
  },
  approvalActionSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  approvalActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  approvalActionPrimaryText: {
    color: '#ffffff'
  },
  approvalActionSecondaryText: {
    color: 'rgba(255,255,255,0.82)'
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    color: '#fff',
    fontSize: 16,
    minHeight: 48,
    maxHeight: 120 // wrap up to ~5 lines before scrolling internal
  },
  inputRTL: {
    textAlign: 'right',
    writingDirection: 'rtl'
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    opacity: 0.5
  },
  stopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonText: {
    fontSize: 18
  },
  dictationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  dictationButtonActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.3)'
  },
  ticketList: {
    maxHeight: 260,
    paddingHorizontal: 12
  },
  ticketCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8
  },
  ticketTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8
  },
  ticketReason: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1
  },
  ticketMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6
  },
  ticketStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)'
  },
  statusOpen: {
    color: '#FF9500'
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  backBtnText: {
    color: '#7B68EE',
    fontSize: 14,
    fontWeight: '600'
  },
  chatMessages: {
    maxHeight: 200,
    paddingHorizontal: 12,
    marginBottom: 8
  },
  msgBubble: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    maxWidth: '85%'
  },
  msgBubbleUser: {
    backgroundColor: 'rgba(123, 104, 238, 0.3)',
    alignSelf: 'flex-end'
  },
  msgBubbleAgent: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignSelf: 'flex-start'
  },
  msgText: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18
  },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingBottom: 6
  },
  typingText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    fontStyle: 'italic'
  },
  unreadBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 16,
    textAlign: 'center'
  },
  humanTabBadge: {
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    marginLeft: 3
  },
  humanTabBadgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center'
  },
  fabUnreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: '#1a1a2e'
  },
  fabUnreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 20,
    textAlign: 'center'
  }
});
const modeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 3
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4
  },
  tabActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)'
  },
  tabIcon: {
    fontSize: 14
  },
  tabLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: '600'
  },
  tabLabelActive: {
    color: '#fff'
  }
});
const audioStyles = StyleSheet.create({
  controlBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  controlBtnActive: {
    backgroundColor: 'rgba(255, 100, 100, 0.2)'
  },
  controlIcon: {
    fontSize: 16
  },
  micButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    gap: 8
  },
  micButtonActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.3)'
  },
  micButtonSpeaking: {
    backgroundColor: 'rgba(52, 199, 89, 0.3)'
  },
  micIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  micLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  micButtonConnecting: {
    backgroundColor: 'rgba(255, 200, 50, 0.2)',
    opacity: 0.7
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  statusDotConnected: {
    backgroundColor: '#34C759'
  },
  statusDotConnecting: {
    backgroundColor: '#FFCC00'
  },
  humanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8
  },
  humanStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF9500'
  },
  humanStatusText: {
    color: '#FF9500',
    fontSize: 13,
    fontWeight: '600'
  },
  ticketList: {
    maxHeight: 260,
    paddingHorizontal: 12
  },
  ticketCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8
  },
  ticketReason: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  ticketMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6
  },
  ticketStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)'
  },
  statusOpen: {
    color: '#FF9500'
  },
  emptyText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 30
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  backBtnText: {
    color: '#7B68EE',
    fontSize: 14,
    fontWeight: '600'
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)'
  },
  backText: {
    color: '#7B68EE',
    fontSize: 14,
    fontWeight: '600'
  },
  emptyTickets: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  emptyTicketsText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14
  }
});
// ─── Relative Date Helper ────────────────────────────────────────────────────

function getRelativeDate(timestampMs) {
  const now = Date.now();
  const diff = now - timestampMs;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(timestampMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
}

// ─── History Styles ───────────────────────────────────────────────────────

const historyStyles = StyleSheet.create({
  headerActions: {
    position: 'absolute',
    left: 16,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 20
  },
  // ─ History trigger button
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4
  },
  quickNewBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickNewBtnText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 18,
    lineHeight: 18,
    fontWeight: '500',
    marginTop: -1
  },
  historyCountBadge: {
    marginLeft: 3,
    backgroundColor: 'rgba(123,104,238,0.8)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1
  },
  historyCountBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14
  },
  // ─ Panel container
  panel: {
    flex: 1
  },
  // ─ Header row (Back | History | + New)
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4
  },
  backBtn: {
    padding: 4
  },
  backBtnText: {
    color: '#7B68EE',
    fontSize: 13,
    fontWeight: '600'
  },
  headerTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  newBtn: {
    backgroundColor: 'rgba(123,104,238,0.25)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  newBtnText: {
    color: '#7B68EE',
    fontSize: 12,
    fontWeight: '700'
  },
  // ─ Shimmer loading cards
  shimmerWrap: {
    gap: 8
  },
  shimmerCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    height: 64,
    justifyContent: 'center'
  },
  shimmerLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  // ─ Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 6
  },
  emptyTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600'
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center'
  },
  // ─ Conversation cards
  convCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  convCardPressed: {
    backgroundColor: 'rgba(123,104,238,0.18)',
    borderColor: 'rgba(123,104,238,0.3)'
  },
  convCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  convTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8
  },
  convMsgBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  convMsgBadgeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '600'
  },
  convPreview: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6
  },
  convDate: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    fontWeight: '500'
  }
});
//# sourceMappingURL=AgentChatBar.js.map
