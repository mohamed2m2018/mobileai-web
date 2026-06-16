'use strict';

import React, { useMemo, useState } from 'react';
import { RichContentRendererWeb } from './RichContentRendererWeb.js';

// U3 — Web QuickActions self-service panel. Mirrors the RN QuickActionsSheet
// (categorized help topics → article view → "Chat with AI" handoff). Honors the
// same supportMode.quickActions config shape: { enabled, topics, showSearchBar,
// otherLabel }. Rendered inside the chat popup, so it inherits the dark surface.

function rankTopics(topics, currentScreen) {
  const contextual = [];
  const rest = [];
  for (const topic of topics || []) {
    const isContextual = topic.contextTrigger ? !!topic.contextTrigger(currentScreen) : false;
    (isContextual ? contextual : rest).push({ ...topic, isContextual });
  }
  return [...contextual, ...rest];
}

function searchArticles(topics, query) {
  const lower = (query || '').toLowerCase().trim();
  if (!lower) return [];
  const results = [];
  for (const topic of topics || []) {
    for (const article of topic.articles || []) {
      const haystack = [article.question, ...(article.tags || []), topic.label].join(' ').toLowerCase();
      if (haystack.includes(lower)) {
        results.push({ topic, article });
      }
    }
  }
  return results;
}

function BackChevron({ size = 16, color = '#fff' }) {
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: color,
      strokeWidth: 2.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    React.createElement('path', { d: 'M15 18L9 12L15 6' }),
  );
}

export function QuickActionsPanelWeb({ config, currentScreen = '', accent = '#0D9373', onChatWithAI }) {
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const topics = config?.topics || [];
  const showSearch = config?.showSearchBar !== false;
  const otherLabel = config?.otherLabel || 'Chat with AI';

  const rankedTopics = useMemo(() => rankTopics(topics, currentScreen), [topics, currentScreen]);
  const searchResults = useMemo(
    () => (searchQuery.length >= 2 ? searchArticles(topics, searchQuery) : []),
    [topics, searchQuery],
  );
  const isSearching = searchQuery.length >= 2;

  const handleChatWithAI = (context) => {
    setSelectedTopic(null);
    setSelectedArticle(null);
    setSearchQuery('');
    onChatWithAI?.(context);
  };

  const primaryButtonStyle = {
    border: 'none',
    borderRadius: 999,
    background: accent,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    padding: '11px 22px',
    cursor: 'pointer',
  };

  // ── Article detail view ──────────────────────────────────────
  if (selectedTopic && selectedArticle) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 220 }}>
        <button
          type="button"
          onClick={() => setSelectedArticle(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <BackChevron size={14} color="rgba(255,255,255,0.7)" />
          <span>{selectedTopic.label}</span>
        </button>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.25 }}>
          {selectedArticle.question}
        </div>
        <div
          style={{
            overflowY: 'auto',
            color: 'rgba(255,255,255,0.85)',
            fontSize: 14,
            lineHeight: 1.55,
            paddingRight: 4,
          }}
        >
          <RichContentRendererWeb content={selectedArticle.answer} surface="chat" />
        </div>
        <button
          type="button"
          onClick={() =>
            handleChatWithAI({ topicId: selectedTopic.id, articleQuestion: selectedArticle.question })
          }
          style={{ ...primaryButtonStyle, alignSelf: 'flex-start', marginTop: 4 }}
        >
          {otherLabel}
        </button>
      </div>
    );
  }

  // ── Topic detail view (article list) ─────────────────────────
  if (selectedTopic) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 220 }}>
        <button
          type="button"
          onClick={() => setSelectedTopic(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <BackChevron size={14} color="rgba(255,255,255,0.7)" />
          <span>{'All topics'}</span>
        </button>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>
          {selectedTopic.icon ? `${selectedTopic.icon} ` : ''}
          {selectedTopic.label}
        </div>
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
          {(selectedTopic.articles || []).map((article, i) => (
            <button
              type="button"
              key={`${article.question}-${i}`}
              onClick={() => setSelectedArticle(article)}
              style={{
                textAlign: 'left',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 12,
                padding: '13px 14px',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {article.question}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => handleChatWithAI({ topicId: selectedTopic.id })}
          style={{ ...primaryButtonStyle, alignSelf: 'flex-start', marginTop: 4 }}
        >
          {otherLabel}
        </button>
      </div>
    );
  }

  // ── Topic grid / search ──────────────────────────────────────
  const hasContextual = rankedTopics.some((t) => t.isContextual);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 220 }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{'How can we help?'}</div>
      {showSearch ? (
        <input
          type="text"
          value={searchQuery}
          placeholder="Search for help…"
          onChange={(event) => setSearchQuery(event.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.06)',
            color: '#fff',
            padding: '11px 14px',
            fontSize: 14,
            outline: 'none',
          }}
        />
      ) : null}
      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
        {isSearching ? (
          searchResults.length > 0 ? (
            searchResults.map(({ topic, article }, i) => (
              <button
                type="button"
                key={`${topic.id}-${i}`}
                onClick={() => {
                  setSelectedTopic(topic);
                  setSelectedArticle(article);
                }}
                style={{
                  textAlign: 'left',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 12,
                  padding: '13px 14px',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                  {topic.icon ? `${topic.icon} ` : ''}
                  {topic.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{article.question}</div>
              </button>
            ))
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0' }}>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{'No results found'}</div>
              <button type="button" onClick={() => handleChatWithAI()} style={primaryButtonStyle}>
                {otherLabel}
              </button>
            </div>
          )
        ) : (
          <>
            {hasContextual ? (
              <div
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {'Suggested for you'}
              </div>
            ) : null}
            {rankedTopics.map((topic, i) => {
              const showDivider =
                topic.isContextual && rankedTopics[i + 1] && !rankedTopics[i + 1].isContextual;
              return (
                <React.Fragment key={topic.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedTopic(topic)}
                    style={{
                      textAlign: 'left',
                      border: topic.isContextual
                        ? `1px solid ${accent}`
                        : '1px solid rgba(255,255,255,0.06)',
                      background: topic.isContextual ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.05)',
                      borderRadius: 14,
                      padding: '16px',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    {topic.icon ? <div style={{ fontSize: 22, marginBottom: 6 }}>{topic.icon}</div> : null}
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{topic.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>
                      {(topic.articles || []).length}{' '}
                      {(topic.articles || []).length === 1 ? 'article' : 'articles'}
                    </div>
                  </button>
                  {showDivider ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.35)',
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {'All topics'}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 12 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{"Can't find what you need?"}</div>
              <button type="button" onClick={() => handleChatWithAI()} style={primaryButtonStyle}>
                {otherLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

QuickActionsPanelWeb.displayName = 'QuickActionsPanelWeb';
