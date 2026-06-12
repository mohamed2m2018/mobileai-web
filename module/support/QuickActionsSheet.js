"use strict";

import { useState, useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, StyleSheet, Platform, StatusBar } from 'react-native';
import { CloseIcon } from "../components/Icons.js";
import { HelpArticleView } from "./HelpArticleView.js";
import { rankTopics, searchArticles } from "./quickActionsMatcher.js";
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
export function QuickActionsSheet({
  visible,
  config,
  currentScreen = '',
  onClose,
  onChatWithAI
}) {
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const showSearch = config.showSearchBar !== false;
  const otherLabel = config.otherLabel ?? 'Chat with AI';
  const rankedTopics = useMemo(() => rankTopics(config.topics, currentScreen), [config.topics, currentScreen]);
  const searchResults = useMemo(() => searchQuery.length >= 2 ? searchArticles(config.topics, searchQuery) : [], [config.topics, searchQuery]);
  const isSearching = searchQuery.length >= 2;
  const handleClose = () => {
    setSelectedTopic(null);
    setSearchQuery('');
    onClose();
  };
  const handleChatWithAI = context => {
    setSelectedTopic(null);
    setSearchQuery('');
    onChatWithAI(context);
  };
  if (selectedTopic) {
    return /*#__PURE__*/_jsx(Modal, {
      visible: visible,
      animationType: "slide",
      presentationStyle: "pageSheet",
      onRequestClose: handleClose,
      children: /*#__PURE__*/_jsx(HelpArticleView, {
        topic: selectedTopic,
        onBack: () => setSelectedTopic(null),
        onChatWithAI: handleChatWithAI,
        otherLabel: otherLabel,
        onArticleHelpful: config.onArticleHelpful,
        onArticleNotHelpful: config.onArticleNotHelpful
      })
    });
  }
  return /*#__PURE__*/_jsxs(Modal, {
    visible: visible,
    animationType: "slide",
    presentationStyle: "pageSheet",
    onRequestClose: handleClose,
    children: [/*#__PURE__*/_jsx(StatusBar, {
      barStyle: "light-content"
    }), /*#__PURE__*/_jsxs(View, {
      style: s.container,
      children: [/*#__PURE__*/_jsx(View, {
        style: s.dragHandle,
        children: /*#__PURE__*/_jsx(View, {
          style: s.dragGrip
        })
      }), /*#__PURE__*/_jsxs(View, {
        style: s.header,
        children: [/*#__PURE__*/_jsx(Pressable, {
          onPress: handleClose,
          style: s.headerBtn,
          hitSlop: 12,
          children: /*#__PURE__*/_jsx(CloseIcon, {
            size: 20,
            color: "rgba(255,255,255,0.7)"
          })
        }), /*#__PURE__*/_jsx(Text, {
          style: s.headerTitle,
          children: "How can we help?"
        }), /*#__PURE__*/_jsx(View, {
          style: s.headerBtn
        })]
      }), showSearch && /*#__PURE__*/_jsx(View, {
        style: s.searchContainer,
        children: /*#__PURE__*/_jsx(TextInput, {
          style: s.searchInput,
          placeholder: "Search for help...",
          placeholderTextColor: "rgba(255,255,255,0.35)",
          value: searchQuery,
          onChangeText: setSearchQuery,
          autoCorrect: false,
          clearButtonMode: "while-editing"
        })
      }), /*#__PURE__*/_jsxs(ScrollView, {
        style: s.content,
        contentContainerStyle: s.contentInner,
        showsVerticalScrollIndicator: false,
        keyboardShouldPersistTaps: "handled",
        children: [isSearching ? /*#__PURE__*/_jsx(_Fragment, {
          children: searchResults.length > 0 ? searchResults.map(({
            topic,
            article
          }, i) => /*#__PURE__*/_jsxs(Pressable, {
            style: s.searchResultCard,
            onPress: () => setSelectedTopic(topic),
            children: [/*#__PURE__*/_jsxs(Text, {
              style: s.searchResultTopic,
              children: [topic.icon, " ", topic.label]
            }), /*#__PURE__*/_jsx(Text, {
              style: s.searchResultQuestion,
              children: article.question
            })]
          }, `${topic.id}-${i}`)) : /*#__PURE__*/_jsxs(View, {
            style: s.emptySearch,
            children: [/*#__PURE__*/_jsx(Text, {
              style: s.emptySearchText,
              children: "No results found"
            }), /*#__PURE__*/_jsx(Pressable, {
              onPress: () => handleChatWithAI(),
              style: s.emptySearchBtn,
              children: /*#__PURE__*/_jsx(Text, {
                style: s.emptySearchBtnText,
                children: otherLabel
              })
            })]
          })
        }) : /*#__PURE__*/_jsxs(_Fragment, {
          children: [rankedTopics.some(t => t.isContextual) && /*#__PURE__*/_jsx(Text, {
            style: s.sectionLabel,
            children: "Suggested for you"
          }), /*#__PURE__*/_jsx(View, {
            style: s.topicGrid,
            children: rankedTopics.map((topic, i) => {
              const showDivider = topic.isContextual && rankedTopics[i + 1] && !rankedTopics[i + 1].isContextual;
              return /*#__PURE__*/_jsxs(View, {
                children: [/*#__PURE__*/_jsxs(Pressable, {
                  style: [s.topicCard, topic.isContextual && s.topicCardContextual],
                  onPress: () => setSelectedTopic(topic),
                  children: [topic.icon && /*#__PURE__*/_jsx(Text, {
                    style: s.topicIcon,
                    children: topic.icon
                  }), /*#__PURE__*/_jsx(Text, {
                    style: s.topicLabel,
                    children: topic.label
                  }), /*#__PURE__*/_jsxs(Text, {
                    style: s.topicCount,
                    children: [topic.articles.length, ' ', topic.articles.length === 1 ? 'article' : 'articles']
                  })]
                }), showDivider && /*#__PURE__*/_jsxs(View, {
                  style: s.divider,
                  children: [/*#__PURE__*/_jsx(View, {
                    style: s.dividerLine
                  }), /*#__PURE__*/_jsx(Text, {
                    style: s.dividerText,
                    children: "All topics"
                  }), /*#__PURE__*/_jsx(View, {
                    style: s.dividerLine
                  })]
                })]
              }, topic.id);
            })
          })]
        }), !isSearching && /*#__PURE__*/_jsxs(Pressable, {
          onPress: () => handleChatWithAI(),
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
    })]
  });
}
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1e'
  },
  // Drag handle
  dragHandle: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 16,
    paddingBottom: 6
  },
  dragGrip: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)'
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)'
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3
  },
  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  searchInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 15
  },
  // Content
  content: {
    flex: 1
  },
  contentInner: {
    paddingHorizontal: 16,
    paddingBottom: 40
  },
  // Section label
  sectionLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 4
  },
  // Topic grid
  topicGrid: {
    gap: 10
  },
  topicCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  topicCardContextual: {
    borderColor: 'rgba(123,104,238,0.3)',
    backgroundColor: 'rgba(123,104,238,0.08)'
  },
  topicIcon: {
    fontSize: 24,
    marginBottom: 8
  },
  topicLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4
  },
  topicCount: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13
  },
  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  dividerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  // Search results
  searchResultCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)'
  },
  searchResultTopic: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4
  },
  searchResultQuestion: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  // Empty search
  emptySearch: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptySearchText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 15,
    marginBottom: 16
  },
  emptySearchBtn: {
    backgroundColor: '#7B68EE',
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 12
  },
  emptySearchBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  // Chat fallback
  chatFallback: {
    alignItems: 'center',
    marginTop: 28,
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
//# sourceMappingURL=QuickActionsSheet.js.map