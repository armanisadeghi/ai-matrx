// components/rich-editor/source/markdown-language.ts
//
// The source view's markdown language: the Lezer markdown parser with GFM
// (tables, strikethrough, task lists, autolinks), wrapped as a CodeMirror
// Language directly. `@codemirror/lang-markdown` is NOT used — it statically
// imports `@codemirror/lang-html`, which drags in the JavaScript and CSS
// grammars (~150 KB minified) for highlighting inside code fences. Code fences
// here are islands the live preview draws through the shared renderer, so the
// source view shows their text plainly and never needs those grammars.

import { Language, defineLanguageFacet } from "@codemirror/language";
import { GFM, parser } from "@lezer/markdown";

const data = defineLanguageFacet({ commentTokens: { block: { open: "<!--", close: "-->" } } });

export const markdownSourceLanguage = new Language(data, parser.configure([GFM]), [], "markdown");
