/**
 * lib/markdown/safe-html.ts — Markdown → sanitized HTML for any HTML that
 * leaves the app as markup (outgoing email, CMS drafts, innerHTML).
 *
 * The markdown is read by THE ONE CORE (components/markdown-core/
 * markdown-core-html.ts), which passes raw HTML through as CommonMark does, so
 * the serialized fragment is then run through THE ONE sanitizer:
 * `@ai-matrx/print/safe-html` (GitHub's allow-list minus style and embedding
 * tags). No local schema lives here. Isomorphic and synchronous (no DOM).
 */

import { toHtml } from "hast-util-to-html";
import { sanitizeHtmlFragment } from "@ai-matrx/print/safe-html";
import { markdownToHast } from "@ai-matrx/rich-content/markdown-core/markdown-core-html";

export { sanitizeHtmlFragment };

/** Markdown (CommonMark + GFM) → sanitized HTML fragment. */
export function markdownToSafeHtml(markdown: string): string {
  return sanitizeHtmlFragment(toHtml(markdownToHast(markdown)));
}
