"use strict";

export function rankTopics(topics, currentScreen) {
  const contextual = [];
  const rest = [];
  for (const topic of topics) {
    const isContextual = topic.contextTrigger?.(currentScreen) ?? false;
    if (isContextual) {
      contextual.push({
        ...topic,
        isContextual
      });
    } else {
      rest.push({
        ...topic,
        isContextual
      });
    }
  }
  return [...contextual, ...rest];
}
export function searchArticles(topics, query) {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];
  const results = [];
  for (const topic of topics) {
    for (const article of topic.articles) {
      const haystack = [article.question, ...(article.tags ?? []), topic.label].join(' ').toLowerCase();
      if (haystack.includes(lower)) {
        results.push({
          topic,
          article
        });
      }
    }
  }
  return results;
}
//# sourceMappingURL=quickActionsMatcher.js.map