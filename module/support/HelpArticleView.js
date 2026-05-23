"use strict";

import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function HelpArticleView({
  topic,
  onBack,
  onChatWithAI,
  otherLabel = 'Chat with AI',
  onArticleHelpful,
  onArticleNotHelpful
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [feedbackGiven, setFeedbackGiven] = useState({});
  const toggleArticle = index => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };
  const handleFeedback = (index, helpful, article) => {
    setFeedbackGiven(prev => ({
      ...prev,
      [index]: helpful ? 'yes' : 'no'
    }));
    if (helpful) {
      onArticleHelpful?.(topic.id, article);
    } else {
      onArticleNotHelpful?.(topic.id, article);
    }
  };
  return /*#__PURE__*/_jsxs(View, {
    style: s.container,
    children: [/*#__PURE__*/_jsxs(View, {
      style: s.header,
      children: [/*#__PURE__*/_jsx(Pressable, {
        onPress: onBack,
        style: s.backBtn,
        hitSlop: 12,
        children: /*#__PURE__*/_jsx(Text, {
          style: s.backArrow,
          children: "\u2039"
        })
      }), /*#__PURE__*/_jsxs(View, {
        style: s.headerCenter,
        children: [topic.icon && /*#__PURE__*/_jsx(Text, {
          style: s.headerIcon,
          children: topic.icon
        }), /*#__PURE__*/_jsx(Text, {
          style: s.headerTitle,
          children: topic.label
        })]
      }), /*#__PURE__*/_jsx(View, {
        style: s.backBtn
      })]
    }), /*#__PURE__*/_jsxs(ScrollView, {
      style: s.list,
      contentContainerStyle: s.listContent,
      showsVerticalScrollIndicator: false,
      children: [topic.articles.map((article, i) => {
        const isExpanded = expandedIndex === i;
        const feedback = feedbackGiven[i];
        return /*#__PURE__*/_jsxs(View, {
          style: s.articleCard,
          children: [/*#__PURE__*/_jsxs(Pressable, {
            onPress: () => toggleArticle(i),
            style: s.questionRow,
            children: [/*#__PURE__*/_jsx(Text, {
              style: s.questionText,
              children: article.question
            }), /*#__PURE__*/_jsx(Text, {
              style: [s.chevron, isExpanded && s.chevronOpen],
              children: "\u203A"
            })]
          }), isExpanded && /*#__PURE__*/_jsxs(View, {
            style: s.answerContainer,
            children: [/*#__PURE__*/_jsx(Text, {
              style: s.answerText,
              children: article.answer
            }), /*#__PURE__*/_jsxs(View, {
              style: s.feedbackRow,
              children: [/*#__PURE__*/_jsx(Text, {
                style: s.feedbackLabel,
                children: "Did this help?"
              }), feedback ? /*#__PURE__*/_jsx(Text, {
                style: s.feedbackThanks,
                children: feedback === 'yes' ? 'Thanks! 👍' : 'Sorry to hear that'
              }) : /*#__PURE__*/_jsxs(View, {
                style: s.feedbackButtons,
                children: [/*#__PURE__*/_jsx(Pressable, {
                  onPress: () => handleFeedback(i, true, article),
                  style: s.feedbackBtn,
                  hitSlop: 8,
                  children: /*#__PURE__*/_jsx(Text, {
                    style: s.feedbackBtnText,
                    children: "\uD83D\uDC4D Yes"
                  })
                }), /*#__PURE__*/_jsx(Pressable, {
                  onPress: () => handleFeedback(i, false, article),
                  style: s.feedbackBtn,
                  hitSlop: 8,
                  children: /*#__PURE__*/_jsx(Text, {
                    style: s.feedbackBtnText,
                    children: "\uD83D\uDC4E No"
                  })
                })]
              })]
            })]
          })]
        }, i);
      }), /*#__PURE__*/_jsxs(Pressable, {
        onPress: () => onChatWithAI({
          topicId: topic.id
        }),
        style: s.chatFallback,
        children: [/*#__PURE__*/_jsx(Text, {
          style: s.chatFallbackText,
          children: "Can't find what you need?"
        }), /*#__PURE__*/_jsx(View, {
          style: s.chatFallbackBtn,
          children: /*#__PURE__*/_jsx(Text, {
            style: s.chatFallbackBtnText,
            children: otherLabel
          })
        })]
      })]
    })]
  });
}
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e'
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 58 : 16,
    paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)'
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  backArrow: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    marginTop: -2
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  headerIcon: {
    fontSize: 20
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  // List
  list: {
    flex: 1
  },
  listContent: {
    padding: 16,
    paddingBottom: 40
  },
  // Article card
  articleCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16
  },
  questionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 12
  },
  chevron: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 22,
    fontWeight: '300',
    transform: [{
      rotate: '0deg'
    }]
  },
  chevronOpen: {
    transform: [{
      rotate: '90deg'
    }]
  },
  // Answer
  answerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  answerText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    lineHeight: 21,
    paddingTop: 12
  },
  // Feedback
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)'
  },
  feedbackLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13
  },
  feedbackButtons: {
    flexDirection: 'row',
    gap: 8
  },
  feedbackBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  feedbackBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13
  },
  feedbackThanks: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontStyle: 'italic'
  },
  // Chat fallback
  chatFallback: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 20
  },
  chatFallbackText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginBottom: 12
  },
  chatFallbackBtn: {
    backgroundColor: '#7B68EE',
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 12,
    elevation: 3,
    shadowColor: '#7B68EE',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.3,
    shadowRadius: 4
  },
  chatFallbackBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  }
});
//# sourceMappingURL=HelpArticleView.js.map