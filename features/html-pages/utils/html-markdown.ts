/**
 * Markdown -> clean HTML, on its own so `html-preview-utils` (reached by the
 * shell through the canvas HTML artifact) never statically loads
 * `@ai-matrx/print/markdown` (unified / remark / rehype / parse5 / KaTeX).
 * Import this module only from on-demand code (a click, an `import()`).
 */

import { markdownToHtml, removeThinkingContent } from "@ai-matrx/print/markdown";

/**
 * Simple conversion: markdown -> clean HTML
 */
export function convertMarkdownToHtml(markdown: string): string {
  const cleanedMarkdown = removeThinkingContent(markdown);
  return markdownToHtml(cleanedMarkdown);
}
