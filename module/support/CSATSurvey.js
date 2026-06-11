"use strict";

/**
 * CSAT Survey — Customer Satisfaction component.
 *
 * Shown after a support conversation ends (or after idle timeout).
 * Supports three rating types: emoji, stars, thumbs.
 */

import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { MobileAI } from "../services/telemetry/index.js";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const EMOJI_OPTIONS = [{
  emoji: '😡',
  label: 'Terrible',
  score: 1
}, {
  emoji: '😞',
  label: 'Bad',
  score: 2
}, {
  emoji: '😐',
  label: 'Okay',
  score: 3
}, {
  emoji: '😊',
  label: 'Good',
  score: 4
}, {
  emoji: '🤩',
  label: 'Amazing',
  score: 5
}];
const CES_OPTIONS = [{
  label: 'Very Difficult',
  score: 1
}, {
  label: 'Difficult',
  score: 2
}, {
  label: 'Neutral',
  score: 3
}, {
  label: 'Easy',
  score: 4
}, {
  label: 'Very Easy',
  score: 5
}];
const NPS_SCALE = Array.from({
  length: 11
}, (_, i) => i); // 0–10

const STAR_COUNT = 5;
export function CSATSurvey({
  config,
  metadata,
  onDismiss,
  theme
}) {
  const [selectedScore, setSelectedScore] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const primary = theme?.primaryColor ?? '#8b5cf6';
  const textColor = theme?.textColor ?? '#ffffff';
  const bgColor = theme?.backgroundColor ?? 'rgba(26, 26, 46, 0.98)';
  const surveyType = config.surveyType ?? 'csat';
  const ratingType = config.ratingType ?? 'emoji';
  const defaultQuestion = surveyType === 'nps' ? 'How likely are you to recommend us to a friend or colleague?' : surveyType === 'ces' ? 'How easy was it to get the help you needed?' : 'How was your experience?';
  const question = config.question ?? defaultQuestion;
  const handleSubmit = () => {
    if (selectedScore === null) return;
    const rating = {
      score: selectedScore,
      feedback: feedback.trim() || undefined,
      metadata
    };
    config.onSubmit(rating);
    setSubmitted(true);

    // Track CSAT/CES/NPS response
    const fcrAchieved = surveyType === 'nps' ? selectedScore >= 9 : selectedScore >= 4 || ratingType === 'thumbs' && selectedScore === 5;
    const eventName = surveyType === 'nps' ? 'nps_response' : surveyType === 'ces' ? 'ces_response' : 'csat_response';
    MobileAI.track(eventName, {
      score: selectedScore,
      fcrAchieved,
      ticketId: metadata?.ticketId
    });
    if (fcrAchieved) {
      MobileAI.track('fcr_achieved', {
        score: selectedScore,
        ticketId: metadata?.ticketId
      });
    }

    // Auto-dismiss after 1.5s
    setTimeout(onDismiss, 1500);
  };
  if (submitted) {
    return /*#__PURE__*/_jsx(View, {
      style: [styles.container, {
        backgroundColor: bgColor
      }],
      children: /*#__PURE__*/_jsx(Text, {
        style: [styles.thankYou, {
          color: textColor
        }],
        children: "Thank you for your feedback! \uD83D\uDE4F"
      })
    });
  }
  return /*#__PURE__*/_jsxs(View, {
    style: [styles.container, {
      backgroundColor: bgColor
    }],
    children: [/*#__PURE__*/_jsx(Text, {
      style: [styles.question, {
        color: textColor
      }],
      children: question
    }), /*#__PURE__*/_jsxs(View, {
      style: styles.ratingContainer,
      children: [surveyType === 'ces' && /*#__PURE__*/_jsx(View, {
        style: styles.cesRow,
        children: CES_OPTIONS.map(opt => /*#__PURE__*/_jsxs(TouchableOpacity, {
          onPress: () => setSelectedScore(opt.score),
          style: [styles.cesButton, selectedScore === opt.score && {
            backgroundColor: `${primary}30`,
            borderColor: primary
          }],
          activeOpacity: 0.7,
          children: [/*#__PURE__*/_jsx(Text, {
            style: [styles.cesNumber, {
              color: selectedScore === opt.score ? primary : textColor
            }],
            children: opt.score
          }), /*#__PURE__*/_jsx(Text, {
            style: [styles.cesLabel, {
              color: selectedScore === opt.score ? primary : '#71717a'
            }],
            children: opt.label
          })]
        }, opt.score))
      }), surveyType === 'nps' && /*#__PURE__*/_jsxs(View, {
        children: [/*#__PURE__*/_jsx(View, {
          style: styles.npsRow,
          children: NPS_SCALE.map(score => /*#__PURE__*/_jsx(TouchableOpacity, {
            onPress: () => setSelectedScore(score),
            style: [styles.npsButton, selectedScore === score && {
              backgroundColor: `${primary}30`,
              borderColor: primary
            }],
            activeOpacity: 0.7,
            children: /*#__PURE__*/_jsx(Text, {
              style: [styles.npsNumber, {
                color: selectedScore === score ? primary : textColor
              }],
              children: score
            })
          }, score))
        }), /*#__PURE__*/_jsxs(View, {
          style: styles.npsLabels,
          children: [/*#__PURE__*/_jsx(Text, {
            style: {
              color: '#71717a',
              fontSize: 10
            },
            children: "Not likely"
          }), /*#__PURE__*/_jsx(Text, {
            style: {
              color: '#71717a',
              fontSize: 10
            },
            children: "Very likely"
          })]
        })]
      }), surveyType === 'csat' && ratingType === 'emoji' && /*#__PURE__*/_jsx(View, {
        style: styles.emojiRow,
        children: EMOJI_OPTIONS.map(opt => /*#__PURE__*/_jsxs(TouchableOpacity, {
          onPress: () => setSelectedScore(opt.score),
          style: [styles.emojiButton, selectedScore === opt.score && {
            backgroundColor: `${primary}30`,
            borderColor: primary
          }],
          activeOpacity: 0.7,
          children: [/*#__PURE__*/_jsx(Text, {
            style: styles.emoji,
            children: opt.emoji
          }), /*#__PURE__*/_jsx(Text, {
            style: [styles.emojiLabel, {
              color: selectedScore === opt.score ? primary : '#71717a'
            }],
            children: opt.label
          })]
        }, opt.score))
      }), surveyType === 'csat' && ratingType === 'stars' && /*#__PURE__*/_jsx(View, {
        style: styles.starsRow,
        children: Array.from({
          length: STAR_COUNT
        }, (_, i) => i + 1).map(star => /*#__PURE__*/_jsx(TouchableOpacity, {
          onPress: () => setSelectedScore(star),
          activeOpacity: 0.7,
          children: /*#__PURE__*/_jsx(Text, {
            style: [styles.star, {
              color: selectedScore !== null && star <= selectedScore ? '#fbbf24' : '#52525b'
            }],
            children: "\u2605"
          })
        }, star))
      }), surveyType === 'csat' && ratingType === 'thumbs' && /*#__PURE__*/_jsxs(View, {
        style: styles.thumbsRow,
        children: [/*#__PURE__*/_jsx(TouchableOpacity, {
          onPress: () => setSelectedScore(1),
          style: [styles.thumbButton, selectedScore === 1 && {
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderColor: '#ef4444'
          }],
          activeOpacity: 0.7,
          children: /*#__PURE__*/_jsx(Text, {
            style: [styles.thumbEmoji, selectedScore === 1 && {
              opacity: 1
            }],
            children: "\uD83D\uDC4E"
          })
        }), /*#__PURE__*/_jsx(TouchableOpacity, {
          onPress: () => setSelectedScore(5),
          style: [styles.thumbButton, selectedScore === 5 && {
            backgroundColor: 'rgba(34, 197, 94, 0.2)',
            borderColor: '#22c55e'
          }],
          activeOpacity: 0.7,
          children: /*#__PURE__*/_jsx(Text, {
            style: [styles.thumbEmoji, selectedScore === 5 && {
              opacity: 1
            }],
            children: "\uD83D\uDC4D"
          })
        })]
      })]
    }), selectedScore !== null && /*#__PURE__*/_jsx(TextInput, {
      style: [styles.feedbackInput, {
        color: textColor
      }],
      placeholder: "Any additional feedback? (optional)",
      placeholderTextColor: "#52525b",
      value: feedback,
      onChangeText: setFeedback,
      multiline: true,
      maxLength: 500
    }), /*#__PURE__*/_jsxs(View, {
      style: styles.actions,
      children: [/*#__PURE__*/_jsx(TouchableOpacity, {
        onPress: onDismiss,
        activeOpacity: 0.7,
        children: /*#__PURE__*/_jsx(Text, {
          style: styles.dismissText,
          children: "Skip"
        })
      }), selectedScore !== null && /*#__PURE__*/_jsx(TouchableOpacity, {
        style: [styles.submitButton, {
          backgroundColor: primary
        }],
        onPress: handleSubmit,
        activeOpacity: 0.7,
        children: /*#__PURE__*/_jsx(Text, {
          style: [styles.submitText, {
            color: textColor
          }],
          children: "Submit"
        })
      })]
    })]
  });
}
const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 20,
    margin: 12
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16
  },
  thankYou: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    paddingVertical: 12
  },
  ratingContainer: {
    marginBottom: 12
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8
  },
  emojiButton: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  emoji: {
    fontSize: 28
  },
  emojiLabel: {
    fontSize: 10,
    marginTop: 4,
    fontWeight: '500'
  },
  npsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 2
  },
  npsButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  npsNumber: {
    fontSize: 14,
    fontWeight: '600'
  },
  npsLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2
  },
  cesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4
  },
  cesButton: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    minWidth: 60
  },
  cesNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4
  },
  cesLabel: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center'
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8
  },
  star: {
    fontSize: 36
  },
  thumbsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20
  },
  thumbButton: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  thumbEmoji: {
    fontSize: 36
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#3f3f46',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dismissText: {
    color: '#71717a',
    fontSize: 14
  },
  submitButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10
  },
  submitText: {
    fontSize: 14,
    fontWeight: '600'
  }
});
//# sourceMappingURL=CSATSurvey.js.map