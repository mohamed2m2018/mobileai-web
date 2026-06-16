import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import React, { useMemo, useState } from "react";
import { RichContentRendererWeb } from "./RichContentRendererWeb.js";
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
  const lower = (query || "").toLowerCase().trim();
  if (!lower) return [];
  const results = [];
  for (const topic of topics || []) {
    for (const article of topic.articles || []) {
      const haystack = [article.question, ...article.tags || [], topic.label].join(" ").toLowerCase();
      if (haystack.includes(lower)) {
        results.push({ topic, article });
      }
    }
  }
  return results;
}
function BackChevron({ size = 16, color = "#fff" }) {
  return React.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 2.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true
    },
    React.createElement("path", { d: "M15 18L9 12L15 6" })
  );
}
function QuickActionsPanelWeb({ config, currentScreen = "", accent = "#0D9373", onChatWithAI }) {
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const topics = config?.topics || [];
  const showSearch = config?.showSearchBar !== false;
  const otherLabel = config?.otherLabel || "Chat with AI";
  const rankedTopics = useMemo(() => rankTopics(topics, currentScreen), [topics, currentScreen]);
  const searchResults = useMemo(
    () => searchQuery.length >= 2 ? searchArticles(topics, searchQuery) : [],
    [topics, searchQuery]
  );
  const isSearching = searchQuery.length >= 2;
  const handleChatWithAI = (context) => {
    setSelectedTopic(null);
    setSelectedArticle(null);
    setSearchQuery("");
    onChatWithAI?.(context);
  };
  const primaryButtonStyle = {
    border: "none",
    borderRadius: 999,
    background: accent,
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    padding: "11px 22px",
    cursor: "pointer"
  };
  if (selectedTopic && selectedArticle) {
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, minHeight: 220 }, children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setSelectedArticle(null),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0
          },
          children: [
            /* @__PURE__ */ jsx(BackChevron, { size: 14, color: "rgba(255,255,255,0.7)" }),
            /* @__PURE__ */ jsx("span", { children: selectedTopic.label })
          ]
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 17, fontWeight: 800, color: "#fff", lineHeight: 1.25 }, children: selectedArticle.question }),
      /* @__PURE__ */ jsx(
        "div",
        {
          style: {
            overflowY: "auto",
            color: "rgba(255,255,255,0.85)",
            fontSize: 14,
            lineHeight: 1.55,
            paddingRight: 4
          },
          children: /* @__PURE__ */ jsx(RichContentRendererWeb, { content: selectedArticle.answer, surface: "chat" })
        }
      ),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => handleChatWithAI({ topicId: selectedTopic.id, articleQuestion: selectedArticle.question }),
          style: { ...primaryButtonStyle, alignSelf: "flex-start", marginTop: 4 },
          children: otherLabel
        }
      )
    ] });
  }
  if (selectedTopic) {
    return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 10, minHeight: 220 }, children: [
      /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          onClick: () => setSelectedTopic(null),
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            border: "none",
            background: "transparent",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            padding: 0
          },
          children: [
            /* @__PURE__ */ jsx(BackChevron, { size: 14, color: "rgba(255,255,255,0.7)" }),
            /* @__PURE__ */ jsx("span", { children: "All topics" })
          ]
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { fontSize: 17, fontWeight: 800, color: "#fff" }, children: [
        selectedTopic.icon ? `${selectedTopic.icon} ` : "",
        selectedTopic.label
      ] }),
      /* @__PURE__ */ jsx("div", { style: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }, children: (selectedTopic.articles || []).map((article, i) => /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => setSelectedArticle(article),
          style: {
            textAlign: "left",
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: "13px 14px",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer"
          },
          children: article.question
        },
        `${article.question}-${i}`
      )) }),
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: () => handleChatWithAI({ topicId: selectedTopic.id }),
          style: { ...primaryButtonStyle, alignSelf: "flex-start", marginTop: 4 },
          children: otherLabel
        }
      )
    ] });
  }
  const hasContextual = rankedTopics.some((t) => t.isContextual);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 12, minHeight: 220 }, children: [
    /* @__PURE__ */ jsx("div", { style: { fontSize: 17, fontWeight: 800, color: "#fff" }, children: "How can we help?" }),
    showSearch ? /* @__PURE__ */ jsx(
      "input",
      {
        type: "text",
        value: searchQuery,
        placeholder: "Search for help\u2026",
        onChange: (event) => setSearchQuery(event.target.value),
        style: {
          width: "100%",
          boxSizing: "border-box",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.06)",
          color: "#fff",
          padding: "11px 14px",
          fontSize: 14,
          outline: "none"
        }
      }
    ) : null,
    /* @__PURE__ */ jsx("div", { style: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }, children: isSearching ? searchResults.length > 0 ? searchResults.map(({ topic, article }, i) => /* @__PURE__ */ jsxs(
      "button",
      {
        type: "button",
        onClick: () => {
          setSelectedTopic(topic);
          setSelectedArticle(article);
        },
        style: {
          textAlign: "left",
          border: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.05)",
          borderRadius: 12,
          padding: "13px 14px",
          color: "#fff",
          cursor: "pointer"
        },
        children: [
          /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 4 }, children: [
            topic.icon ? `${topic.icon} ` : "",
            topic.label
          ] }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: 14, fontWeight: 600 }, children: article.question })
        ]
      },
      `${topic.id}-${i}`
    )) : /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 0" }, children: [
      /* @__PURE__ */ jsx("div", { style: { color: "rgba(255,255,255,0.45)", fontSize: 14 }, children: "No results found" }),
      /* @__PURE__ */ jsx("button", { type: "button", onClick: () => handleChatWithAI(), style: primaryButtonStyle, children: otherLabel })
    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
      hasContextual ? /* @__PURE__ */ jsx(
        "div",
        {
          style: {
            color: "rgba(255,255,255,0.5)",
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em"
          },
          children: "Suggested for you"
        }
      ) : null,
      rankedTopics.map((topic, i) => {
        const showDivider = topic.isContextual && rankedTopics[i + 1] && !rankedTopics[i + 1].isContextual;
        return /* @__PURE__ */ jsxs(React.Fragment, { children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => setSelectedTopic(topic),
              style: {
                textAlign: "left",
                border: topic.isContextual ? `1px solid ${accent}` : "1px solid rgba(255,255,255,0.06)",
                background: topic.isContextual ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.05)",
                borderRadius: 14,
                padding: "16px",
                color: "#fff",
                cursor: "pointer"
              },
              children: [
                topic.icon ? /* @__PURE__ */ jsx("div", { style: { fontSize: 22, marginBottom: 6 }, children: topic.icon }) : null,
                /* @__PURE__ */ jsx("div", { style: { fontSize: 15, fontWeight: 700, marginBottom: 3 }, children: topic.label }),
                /* @__PURE__ */ jsxs("div", { style: { fontSize: 12, color: "rgba(255,255,255,0.42)" }, children: [
                  (topic.articles || []).length,
                  " ",
                  (topic.articles || []).length === 1 ? "article" : "articles"
                ] })
              ]
            }
          ),
          showDivider ? /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }, children: [
            /* @__PURE__ */ jsx("div", { style: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" } }),
            /* @__PURE__ */ jsx(
              "span",
              {
                style: {
                  color: "rgba(255,255,255,0.35)",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em"
                },
                children: "All topics"
              }
            ),
            /* @__PURE__ */ jsx("div", { style: { flex: 1, height: 1, background: "rgba(255,255,255,0.08)" } })
          ] }) : null
        ] }, topic.id);
      }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 12 }, children: [
        /* @__PURE__ */ jsx("div", { style: { color: "rgba(255,255,255,0.4)", fontSize: 13 }, children: "Can't find what you need?" }),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: () => handleChatWithAI(), style: primaryButtonStyle, children: otherLabel })
      ] })
    ] }) })
  ] });
}
QuickActionsPanelWeb.displayName = "QuickActionsPanelWeb";
export {
  QuickActionsPanelWeb
};
