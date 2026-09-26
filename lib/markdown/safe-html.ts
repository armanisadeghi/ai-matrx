/**
 * lib/markdown/safe-html.ts — THE Markdown → HTML conversion for any HTML that
 * leaves the app as markup: outgoing email bodies, CMS drafts that become
 * public pages, anything later set via `dangerouslySetInnerHTML`.
 *
 * `marked` renders CommonMark + GFM and PASSES RAW HTML THROUGH by design, so
 * AI- or user-authored Markdown can carry `<script>`, `onerror=`,
 * `javascript:` links, `<iframe>`, `<form>` and `<meta http-equiv>` into the
 * output. Every caller therefore goes through `markdownToSafeHtml`, which
 * parses marked's output into a hast tree and sanitizes it against an
 * ALLOW-LIST (hast-util-sanitize's default schema — GitHub's own rendering
 * rules), then serializes. Allow-list, not block-list: a tag or attribute
 * nobody listed never survives.
 *
 * Isomorphic and synchronous — no DOM, so it runs in API routes (email) and in
 * the browser (CMS push) alike. Output keeps marked's plain semantic tags (no
 * added class names), so CMS themes and email styling see the same shape they
 * always did, minus the dangerous parts.
 *
 * Why not @ai-matrx/print's converter: it strips script/on*-handlers/
 * javascript: but passes `<iframe>`, `<form>`, `<meta>`, `<object>` and inline
 * `style` through (verified 2026-09-25). Why not @ai-matrx/kit's
 * `renderMarkdownHtml`: DOMPurify there needs a `window`, so it throws on the
 * server where email is built.
 */

import { marked } from "marked";
import { fromHtml } from "hast-util-from-html";
import { defaultSchema, sanitize, type Schema } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import type { Root } from "hast";

/**
 * GitHub's schema, plus: elements whose TEXT must not leak as visible content
 * when the element itself is dropped (a stripped `<style>` would otherwise
 * print its CSS), and no `user-content-` prefix rewriting of ids — marked
 * emits none, and authored anchors should keep their names.
 */
export const MARKDOWN_HTML_SCHEMA: Schema = {
  ...defaultSchema,
  strip: [
    "script",
    "style",
    "noscript",
    "template",
    "iframe",
    "object",
    "embed",
    "textarea",
    "select",
  ],
  clobberPrefix: "",
  clobber: [],
};

/** Sanitize an HTML fragment against the allow-list. */
export function sanitizeHtmlFragment(html: string): string {
  const tree = sanitize(fromHtml(html, { fragment: true }), MARKDOWN_HTML_SCHEMA) as Root;
  return toHtml(tree);
}

/** Markdown (CommonMark + GFM) → sanitized HTML fragment. */
export function markdownToSafeHtml(markdown: string): string {
  return sanitizeHtmlFragment(marked.parse(markdown, { async: false }) as string);
}
