/**
 * Bold/italic HTML for table cells and other lightweight inline markdown
 * surfaces. Links are handled separately via `InlineMarkdownWithLinks` +
 * `LinkComponent` so the hover menu delay applies everywhere.
 */
export function applyInlineMarkdownHtmlFormatting(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, "<em>$1</em>");
}
