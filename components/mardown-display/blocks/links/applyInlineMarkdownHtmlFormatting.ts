/** Escape the four characters that could let cell text break out of an HTML attribute/element. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Bold/italic/inline-code HTML for table cells and other lightweight inline
 * markdown surfaces. Links are handled separately via `InlineMarkdownWithLinks`
 * + `LinkComponent` so the hover menu delay applies everywhere.
 *
 * Inline code spans (`` `code` ``) are rendered as a styled `<code>` so the
 * backtick markers never leak through as raw characters — previously they were
 * left untouched and showed up literally in the cell.
 */
export function applyInlineMarkdownHtmlFormatting(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "<em>$1</em>")
    .replace(
      /`([^`]+)`/g,
      (_m, code: string) =>
        `<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">${escapeHtml(code)}</code>`,
    );
}
