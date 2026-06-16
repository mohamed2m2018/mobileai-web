import { jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { normalizeRichContent } from "../../core/richContent.js";
import { useBlockRegistry, useRichUITheme } from "../../components/rich-content/RichUIContext.js";
function renderInlineMarkdown(text, keyPrefix = "md") {
  const parts = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${parts.length}`;
    if (token.startsWith("`")) {
      parts.push(
        /* @__PURE__ */ jsx(
          "code",
          {
            style: {
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "0.92em",
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            },
            children: token.slice(1, -1)
          },
          key
        )
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        /* @__PURE__ */ jsx(
          "strong",
          {
            style: {
              fontWeight: 800
            },
            children: token.slice(2, -2)
          },
          key
        )
      );
    } else {
      parts.push(
        /* @__PURE__ */ jsx(
          "em",
          {
            style: {
              fontStyle: "italic"
            },
            children: token.slice(1, -1)
          },
          key
        )
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
function MarkdownText({ text, style }) {
  const lines = text.split(/\r?\n/);
  return /* @__PURE__ */ jsx("div", { style, children: lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return /* @__PURE__ */ jsx(
        "div",
        {
          style: {
            height: 10
          }
        },
        `blank-${index}`
      );
    }
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      return /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            minWidth: 0,
            maxWidth: "100%"
          },
          children: [
            /* @__PURE__ */ jsx(
              "span",
              {
                "aria-hidden": "true",
                style: {
                  flex: "0 0 auto",
                  lineHeight: "inherit"
                },
                children: "\u2022"
              }
            ),
            /* @__PURE__ */ jsx(
              "span",
              {
                style: {
                  minWidth: 0,
                  maxWidth: "100%",
                  overflowWrap: "anywhere",
                  wordBreak: "break-word"
                },
                children: renderInlineMarkdown(bulletMatch[1], `line-${index}`)
              }
            )
          ]
        },
        `line-${index}`
      );
    }
    return /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          minWidth: 0,
          maxWidth: "100%",
          overflowWrap: "anywhere",
          wordBreak: "break-word"
        },
        children: renderInlineMarkdown(line, `line-${index}`)
      },
      `line-${index}`
    );
  }) });
}
function blockHasRenderableContent(props) {
  if (!props || typeof props !== "object") return false;
  const str = (v) => typeof v === "string" && v.trim().length > 0;
  const arr = (v) => Array.isArray(v) && v.length > 0;
  return str(props.body) || str(props.description) || str(props.text) || str(props.subtitle) || str(props.headline) || str(props.price) || str(props.compareAtPrice) || str(props.image) || str(props.imageUrl) || str(props.imageUri) || str(props.name) || arr(props.facts) || arr(props.items) || arr(props.fields) || arr(props.chips) || arr(props.bullets) || arr(props.actions) || !!props.primaryAction || !!props.secondaryAction || !!props.submitAction;
}
function blockTextFallback(props) {
  if (!props || typeof props !== "object") return "";
  const lines = [];
  for (const key of ["title", "headline", "subtitle", "body", "description", "text"]) {
    if (typeof props[key] === "string" && props[key].trim()) lines.push(props[key].trim());
  }
  return lines.join("\n");
}
function RichContentRendererWeb({ content, surface, isUser = false, textStyle }) {
  const theme = useRichUITheme(surface === "support" ? "support" : surface);
  const registry = useBlockRegistry();
  const nodes = normalizeRichContent(content);
  return /* @__PURE__ */ jsx(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: theme.spacing.sm,
        minWidth: 0,
        maxWidth: "100%"
      },
      children: nodes.map((node, index) => {
        if (node.type === "image" && node.uri) {
          return /* @__PURE__ */ jsx(
            "img",
            {
              src: node.uri,
              alt: "user attachment",
              style: {
                maxWidth: "100%",
                borderRadius: 12,
                aspectRatio: "4 / 3",
                objectFit: "cover"
              }
            },
            node.id || `image-${index}`
          );
        }
        if (node.type === "text") {
          return /* @__PURE__ */ jsx(
            MarkdownText,
            {
              style: {
                fontSize: 15,
                lineHeight: 1.55,
                color: isUser || surface === "chat" || surface === "support" ? theme.colors.inverseText : theme.colors.primaryText,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                minWidth: 0,
                maxWidth: "100%",
                ...textStyle
              },
              text: node.content
            },
            node.id || `text-${index}`
          );
        }
        const definition = registry.get(node.blockType);
        if (!definition || !blockHasRenderableContent(node.props)) {
          const fallback = blockTextFallback(node.props);
          return fallback ? /* @__PURE__ */ jsx(
            MarkdownText,
            {
              style: {
                fontSize: 15,
                lineHeight: 1.55,
                color: isUser || surface === "chat" || surface === "support" ? theme.colors.inverseText : theme.colors.primaryText,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                minWidth: 0,
                maxWidth: "100%",
                ...textStyle
              },
              text: fallback
            },
            node.id || `block-${index}`
          ) : null;
        }
        const BlockComponent = definition.component;
        return /* @__PURE__ */ jsx(
          "div",
          {
            style: {
              borderRadius: theme.shape.cardRadius,
              overflow: "hidden",
              border: surface === "chat" || surface === "support" ? `1px solid ${theme.colors.subtleBorder}` : void 0,
              background: surface === "chat" || surface === "support" ? theme.colors.richMessageContainer : void 0,
              minWidth: 0,
              maxWidth: "100%"
            },
            children: /* @__PURE__ */ jsx(BlockComponent, { ...node.props })
          },
          node.id || `block-${index}`
        );
      })
    }
  );
}
export {
  RichContentRendererWeb
};
