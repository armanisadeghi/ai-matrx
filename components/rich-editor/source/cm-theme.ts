// components/rich-editor/source/cm-theme.ts
//
// The one CodeMirror look for the rich editor (the source view and every
// island's own editor): semantic tokens only, so light and dark follow the app.

import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const richEditorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "hsl(var(--foreground))",
    fontSize: "0.9375rem",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-sans, ui-sans-serif, system-ui)",
    lineHeight: "1.65",
  },
  ".cm-content": { caretColor: "hsl(var(--foreground))", padding: "12px 0" },
  ".cm-line": { padding: "0 16px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--foreground))" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "hsl(var(--primary) / 0.18) !important",
  },
  ".cm-activeLine": { backgroundColor: "hsl(var(--muted) / 0.35)" },
  ".cm-gutters": { display: "none" },
  ".cm-tooltip": {
    backgroundColor: "hsl(var(--popover))",
    color: "hsl(var(--popover-foreground))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "hsl(var(--accent))",
    color: "hsl(var(--accent-foreground))",
  },
  ".cm-panels": { backgroundColor: "hsl(var(--card))", color: "hsl(var(--foreground))" },
});

/** Code-shaped editors (islands) use the mono face. */
export const monoTheme = EditorView.theme({
  ".cm-scroller": {
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: "0.8125rem",
    lineHeight: "1.55",
  },
  ".cm-line": { padding: "0 12px" },
  ".cm-content": { padding: "8px 0" },
});

export const richHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700" },
    { tag: tags.heading2, fontSize: "1.35em", fontWeight: "700" },
    { tag: tags.heading3, fontSize: "1.15em", fontWeight: "650" },
    { tag: [tags.heading4, tags.heading5, tags.heading6], fontWeight: "650" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
    { tag: tags.link, color: "hsl(var(--primary))", textDecoration: "underline" },
    { tag: tags.url, color: "hsl(var(--muted-foreground))" },
    { tag: tags.monospace, fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "0.9em" },
    { tag: tags.quote, color: "hsl(var(--muted-foreground))" },
    { tag: [tags.processingInstruction, tags.meta], color: "hsl(var(--muted-foreground))" },
    { tag: [tags.keyword, tags.operatorKeyword], color: "hsl(var(--primary))" },
    { tag: [tags.string, tags.special(tags.string)], color: "hsl(142 60% 38%)" },
    { tag: [tags.number, tags.bool, tags.null], color: "hsl(24 80% 48%)" },
    { tag: [tags.propertyName, tags.attributeName], color: "hsl(210 70% 50%)" },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
    { tag: [tags.tagName, tags.angleBracket], color: "hsl(280 50% 55%)" },
  ]),
);
