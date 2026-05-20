"use strict";

import React, { useState } from 'react';
import { MobileAI } from "../services/telemetry/MobileAI.js";
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

function baseButtonStyle(selected, primaryColor) {
  return {
    border: `1px solid ${selected ? primaryColor : 'rgba(255,255,255,0.1)'}`,
    background: selected ? `${primaryColor}22` : 'rgba(255,255,255,0.04)',
    color: '#fff',
    borderRadius: 16,
    cursor: 'pointer'
  };
}

export function CSATSurvey({
  config,
  metadata,
  onDismiss,
  theme
}) {
  const [selectedScore, setSelectedScore] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const primary = theme?.primaryColor ?? '#7B68EE';
  const textColor = theme?.textColor ?? '#ffffff';
  const backgroundColor = theme?.backgroundColor ?? 'rgba(26, 26, 46, 0.98)';
  const surveyType = config.surveyType ?? 'csat';
  const ratingType = config.ratingType ?? 'emoji';
  const question = config.question ?? (surveyType === 'ces' ? 'How easy was it to get the help you needed?' : 'How was your experience?');
  const submit = () => {
    if (selectedScore === null) return;
    const rating = {
      score: selectedScore,
      feedback: feedback.trim() || undefined,
      metadata
    };
    config.onSubmit(rating);
    setSubmitted(true);
    const fcrAchieved = selectedScore >= 4 || ratingType === 'thumbs' && selectedScore === 1;
    const eventName = surveyType === 'ces' ? 'ces_response' : 'csat_response';
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
    setTimeout(() => {
      onDismiss();
    }, 1200);
  };
  if (submitted) {
    return /*#__PURE__*/_jsx("div", {
      style: {
        width: 360,
        maxWidth: 'calc(100vw - 40px)',
        borderRadius: 24,
        padding: 24,
        background: backgroundColor,
        color: textColor,
        boxShadow: '0 24px 60px rgba(0,0,0,0.36)',
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 700
      },
      children: "Thank you for your feedback."
    });
  }
  return /*#__PURE__*/_jsxs("div", {
    style: {
      width: 380,
      maxWidth: 'calc(100vw - 40px)',
      borderRadius: 24,
      padding: 24,
      background: backgroundColor,
      color: textColor,
      boxShadow: '0 24px 60px rgba(0,0,0,0.36)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    },
    children: [/*#__PURE__*/_jsx("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        lineHeight: 1.3
      },
      children: question
    }), surveyType === 'ces' ? /*#__PURE__*/_jsx("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 8
      },
      children: CES_OPTIONS.map(option => /*#__PURE__*/_jsxs("button", {
        type: "button",
        onClick: () => setSelectedScore(option.score),
        style: {
          ...baseButtonStyle(selectedScore === option.score, primary),
          padding: '12px 8px'
        },
        children: [/*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 18,
            fontWeight: 800,
            marginBottom: 4
          },
          children: option.score
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 11,
            color: selectedScore === option.score ? textColor : 'rgba(255,255,255,0.72)'
          },
          children: option.label
        })]
      }, option.score))
    }) : ratingType === 'stars' ? /*#__PURE__*/_jsx("div", {
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: 8
      },
      children: [1, 2, 3, 4, 5].map(score => /*#__PURE__*/_jsx("button", {
        type: "button",
        onClick: () => setSelectedScore(score),
        style: {
          border: 'none',
          background: 'transparent',
          fontSize: 34,
          cursor: 'pointer',
          color: selectedScore !== null && score <= selectedScore ? '#fbbf24' : 'rgba(255,255,255,0.28)'
        },
        children: "★"
      }, score))
    }) : ratingType === 'thumbs' ? /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: 12
      },
      children: [/*#__PURE__*/_jsx("button", {
        type: "button",
        onClick: () => setSelectedScore(0),
        style: {
          ...baseButtonStyle(selectedScore === 0, '#ef4444'),
          padding: '14px 18px',
          fontSize: 28
        },
        children: "👎"
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        onClick: () => setSelectedScore(1),
        style: {
          ...baseButtonStyle(selectedScore === 1, primary),
          padding: '14px 18px',
          fontSize: 28
        },
        children: "👍"
      })]
    }) : /*#__PURE__*/_jsx("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 8
      },
      children: EMOJI_OPTIONS.map(option => /*#__PURE__*/_jsxs("button", {
        type: "button",
        onClick: () => setSelectedScore(option.score),
        style: {
          ...baseButtonStyle(selectedScore === option.score, primary),
          padding: '12px 8px'
        },
        children: [/*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 24,
            marginBottom: 4
          },
          children: option.emoji
        }), /*#__PURE__*/_jsx("div", {
          style: {
            fontSize: 11,
            color: selectedScore === option.score ? textColor : 'rgba(255,255,255,0.72)'
          },
          children: option.label
        })]
      }, option.score))
    }), /*#__PURE__*/_jsx("textarea", {
      value: feedback,
      onChange: event => setFeedback(event.target.value),
      placeholder: "Anything you'd like us to know? (optional)",
      rows: 3,
      style: {
        width: '100%',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(255,255,255,0.04)',
        color: textColor,
        padding: '12px 14px',
        resize: 'vertical',
        outline: 'none',
        font: 'inherit',
        boxSizing: 'border-box'
      }
    }), /*#__PURE__*/_jsxs("div", {
      style: {
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end'
      },
      children: [/*#__PURE__*/_jsx("button", {
        type: "button",
        onClick: onDismiss,
        style: {
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'transparent',
          color: textColor,
          borderRadius: 999,
          padding: '10px 14px',
          cursor: 'pointer'
        },
        children: "Skip"
      }), /*#__PURE__*/_jsx("button", {
        type: "button",
        disabled: selectedScore === null,
        onClick: submit,
        style: {
          border: 'none',
          background: selectedScore === null ? 'rgba(123,104,238,0.45)' : primary,
          color: '#fff',
          borderRadius: 999,
          padding: '10px 16px',
          cursor: selectedScore === null ? 'default' : 'pointer',
          fontWeight: 700
        },
        children: "Submit"
      })]
    })]
  });
}
