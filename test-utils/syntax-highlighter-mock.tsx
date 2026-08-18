/**
 * Jest stub for `react-syntax-highlighter`.
 *
 * The real package loads `refractor`, which pulls the ESM-only
 * `parse-entities` / `is-decimal` / `character-entities` chain. Transforming
 * that whole tree is pure cost: no test asserts SYNTAX COLOURING, and without
 * a stub any suite that renders real markdown (`BasicMarkdownContent` →
 * `InlineCodeSnippet`) dies at import before a single assertion runs — which
 * is every test of the structured-value floor, since prose renders through the
 * canonical markdown renderer.
 *
 * The stub keeps the CODE itself in the markup, so assertions about content
 * still hold.
 */

import React from "react";

function Highlighter({ children }: { children?: React.ReactNode }) {
  return <pre data-testid="syntax-highlighter">{children}</pre>;
}

export const Prism = Highlighter;
export const Light = Highlighter;
export const PrismLight = Highlighter;
export const PrismAsyncLight = Highlighter;
export default Highlighter;
