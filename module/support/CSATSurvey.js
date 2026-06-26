"use strict";

/**
 * CSAT Survey — Customer Satisfaction component (web / DOM).
 *
 * Shown after a support conversation ends (or after idle timeout).
 * Supports survey types csat (emoji/stars/thumbs), ces, nps.
 *
 * Web-native: plain DOM + inline styles, no react-native dependency.
 */

import { useState } from 'react';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";

const EMOJI_OPTIONS = [
  { emoji: '😡', label: 'Terrible', score: 1 },
  { emoji: '😞', label: 'Bad', score: 2 },
  { emoji: '😐', label: 'Okay', score: 3 },
  { emoji: '😊', label: 'Good', score: 4 },
  { emoji: '🤩', label: 'Amazing', score: 5 },
];
const CES_OPTIONS = [
  { label: 'Very Difficult', score: 1 },
  { label: 'Difficult', score: 2 },
  { label: 'Neutral', score: 3 },
  { label: 'Easy', score: 4 },
  { label: 'Very Easy', score: 5 },
];
const NPS_SCALE = Array.from({ length: 11 }, (_, i) => i); // 0–10
const STAR_COUNT = 5;

// merge plain style objects (drops falsy entries)
const merge = (...parts) => Object.assign({}, ...parts.filter(Boolean));

const styles = {
  container: { display: 'flex', flexDirection: 'column', borderRadius: '16px', padding: '20px', margin: '12px', boxSizing: 'border-box' },
  question: { fontSize: '16px', fontWeight: 600, textAlign: 'center', marginBottom: '16px' },
  thankYou: { fontSize: '16px', fontWeight: 500, textAlign: 'center', padding: '12px 0' },
  ratingContainer: { marginBottom: '12px' },
  emojiRow: { display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '8px' },
  emojiButton: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 10px', borderRadius: '12px', border: '1px solid transparent', background: 'none', cursor: 'pointer' },
  emoji: { fontSize: '28px' },
  emojiLabel: { fontSize: '10px', marginTop: '4px', fontWeight: 500 },
  npsRow: { display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '2px' },
  npsButton: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '36px', borderRadius: '6px', border: '1px solid transparent', background: 'none', cursor: 'pointer' },
  npsNumber: { fontSize: '14px', fontWeight: 600 },
  npsLabels: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginTop: '4px', padding: '0 2px' },
  cesRow: { display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '4px' },
  cesButton: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 8px', borderRadius: '8px', border: '1px solid transparent', minWidth: '60px', background: 'none', cursor: 'pointer' },
  cesNumber: { fontSize: '22px', fontWeight: 700, marginBottom: '4px' },
  cesLabel: { fontSize: '9px', fontWeight: 600, textAlign: 'center' },
  starsRow: { display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '8px' },
  starButton: { background: 'none', border: 'none', padding: 0, cursor: 'pointer' },
  star: { fontSize: '36px' },
  thumbsRow: { display: 'flex', flexDirection: 'row', justifyContent: 'center', gap: '20px' },
  thumbButton: { padding: '12px', borderRadius: '16px', border: '1px solid transparent', background: 'none', cursor: 'pointer' },
  thumbEmoji: { fontSize: '36px' },
  feedbackInput: { boxSizing: 'border-box', width: '100%', border: '1px solid #3f3f46', borderRadius: '12px', padding: '12px', fontSize: '14px', minHeight: '60px', background: 'transparent', marginBottom: '12px', fontFamily: 'inherit', resize: 'vertical' },
  actions: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dismissButton: { background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
  dismissText: { color: '#71717a', fontSize: '14px' },
  submitButton: { padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer' },
  submitText: { fontSize: '14px', fontWeight: 600 },
};

export function CSATSurvey({ config, metadata, onDismiss, theme, onPersist }) {
  const [selectedScore, setSelectedScore] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const primary = theme?.primaryColor ?? '#8b5cf6';
  const textColor = theme?.textColor ?? '#ffffff';
  const bgColor = theme?.backgroundColor ?? 'rgba(26, 26, 46, 0.98)';
  const surveyType = config.surveyType ?? 'csat';
  const ratingType = config.ratingType ?? 'emoji';
  const defaultQuestion = surveyType === 'nps'
    ? 'How likely are you to recommend us to a friend or colleague?'
    : surveyType === 'ces'
      ? 'How easy was it to get the help you needed?'
      : 'How was your experience?';
  const question = config.question ?? defaultQuestion;

  const handleSubmit = () => {
    if (selectedScore === null) return;
    const rating = { score: selectedScore, feedback: feedback.trim() || undefined, metadata };
    // Host-supplied callback (optional).
    config.onSubmit?.(rating);
    // Persist to the backend, which is the source of truth for the
    // csat_response / nps_response / ces_response (+ fcr_achieved) analytics
    // events — the client no longer emits them itself (would double-count).
    onPersist?.(rating);
    setSubmitted(true);
    setTimeout(onDismiss, 1500);
  };

  if (submitted) {
    return _jsx("div", {
      style: merge(styles.container, { backgroundColor: bgColor }),
      children: _jsx("span", { style: merge(styles.thankYou, { color: textColor }), children: "Thank you for your feedback! 🙏" }),
    });
  }

  const selected = (score) => selectedScore === score;
  const selStyle = (active) => active ? { backgroundColor: `${primary}30`, borderColor: primary } : null;

  let rating = null;
  if (surveyType === 'ces') {
    rating = _jsx("div", {
      style: styles.cesRow,
      children: CES_OPTIONS.map((opt) => _jsxs("button", {
        type: "button",
        onClick: () => setSelectedScore(opt.score),
        style: merge(styles.cesButton, selStyle(selected(opt.score))),
        children: [
          _jsx("span", { style: merge(styles.cesNumber, { color: selected(opt.score) ? primary : textColor }), children: opt.score }),
          _jsx("span", { style: merge(styles.cesLabel, { color: selected(opt.score) ? primary : '#71717a' }), children: opt.label }),
        ],
      }, opt.score)),
    });
  } else if (surveyType === 'nps') {
    rating = _jsxs("div", {
      children: [
        _jsx("div", {
          style: styles.npsRow,
          children: NPS_SCALE.map((score) => _jsx("button", {
            type: "button",
            onClick: () => setSelectedScore(score),
            style: merge(styles.npsButton, selStyle(selected(score))),
            children: _jsx("span", { style: merge(styles.npsNumber, { color: selected(score) ? primary : textColor }), children: score }),
          }, score)),
        }),
        _jsxs("div", {
          style: styles.npsLabels,
          children: [
            _jsx("span", { style: { color: '#71717a', fontSize: '10px' }, children: "Not likely" }),
            _jsx("span", { style: { color: '#71717a', fontSize: '10px' }, children: "Very likely" }),
          ],
        }),
      ],
    });
  } else if (ratingType === 'emoji') {
    rating = _jsx("div", {
      style: styles.emojiRow,
      children: EMOJI_OPTIONS.map((opt) => _jsxs("button", {
        type: "button",
        onClick: () => setSelectedScore(opt.score),
        style: merge(styles.emojiButton, selStyle(selected(opt.score))),
        children: [
          _jsx("span", { style: styles.emoji, children: opt.emoji }),
          _jsx("span", { style: merge(styles.emojiLabel, { color: selected(opt.score) ? primary : '#71717a' }), children: opt.label }),
        ],
      }, opt.score)),
    });
  } else if (ratingType === 'stars') {
    rating = _jsx("div", {
      style: styles.starsRow,
      children: Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((starV) => _jsx("button", {
        type: "button",
        onClick: () => setSelectedScore(starV),
        style: styles.starButton,
        children: _jsx("span", { style: merge(styles.star, { color: selectedScore !== null && starV <= selectedScore ? '#fbbf24' : '#52525b' }), children: "★" }),
      }, starV)),
    });
  } else if (ratingType === 'thumbs') {
    rating = _jsxs("div", {
      style: styles.thumbsRow,
      children: [
        _jsx("button", {
          type: "button",
          onClick: () => setSelectedScore(1),
          style: merge(styles.thumbButton, selected(1) && { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444' }),
          children: _jsx("span", { style: merge(styles.thumbEmoji, { opacity: selected(1) ? 1 : 0.5 }), children: "👎" }),
        }),
        _jsx("button", {
          type: "button",
          onClick: () => setSelectedScore(5),
          style: merge(styles.thumbButton, selected(5) && { backgroundColor: 'rgba(34, 197, 94, 0.2)', borderColor: '#22c55e' }),
          children: _jsx("span", { style: merge(styles.thumbEmoji, { opacity: selected(5) ? 1 : 0.5 }), children: "👍" }),
        }),
      ],
    });
  }

  return _jsxs("div", {
    style: merge(styles.container, { backgroundColor: bgColor }),
    children: [
      _jsx("span", { style: merge(styles.question, { color: textColor }), children: question }),
      _jsx("div", { style: styles.ratingContainer, children: rating }),
      selectedScore !== null && _jsx("textarea", {
        style: merge(styles.feedbackInput, { color: textColor }),
        placeholder: "Any additional feedback? (optional)",
        value: feedback,
        onInput: (e) => setFeedback(e.target.value),
        maxLength: 500,
      }),
      _jsxs("div", {
        style: styles.actions,
        children: [
          _jsx("button", { type: "button", onClick: onDismiss, style: styles.dismissButton, children: _jsx("span", { style: styles.dismissText, children: "Skip" }) }),
          selectedScore !== null && _jsx("button", {
            type: "button",
            onClick: handleSubmit,
            style: merge(styles.submitButton, { backgroundColor: primary }),
            children: _jsx("span", { style: merge(styles.submitText, { color: textColor }), children: "Submit" }),
          }),
        ],
      }),
    ],
  });
}
