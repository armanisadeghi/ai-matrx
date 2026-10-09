// features/spaces/editor/code-highlight.ts — C10: Notion colors code by its language. BlockNote's own
// SyntaxHighlightingExtension runs Shiki (already a dependency); the highlighter is loaded the first time a
// code block with a language needs it, each language on first use, with the JavaScript regex engine (no wasm).
// Light and dark themes both load (BlockNote needs the pair); the code box is dark in both schemes, so spaces.css draws --shiki-dark.

import { SyntaxHighlightingExtension } from "@blocknote/core";

export const codeHighlighting = () =>
  SyntaxHighlightingExtension({
    createHighlighter: async () => {
      const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([import("shiki"), import("shiki/engine/javascript")]);
      return createHighlighter({ themes: ["github-light", "github-dark"], langs: [], engine: createJavaScriptRegexEngine() });
    },
  });
