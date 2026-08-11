/**
 * Markdown → plain text, for places that must show WORDS rather than render a
 * document: table cells, tooltips, meta descriptions, chart labels, aria-labels,
 * exported slide text.
 *
 * This is NOT a renderer and never competes with one. When the surface can
 * afford real formatting, render the markdown through the canonical path
 * (`BasicMarkdownContent` / `MarkdownStream`) instead. Reach for this only when
 * a single line of text is the product — where a rendered `<strong>` cannot go
 * and raw `**asterisks**` would otherwise reach a user's eyes.
 *
 * Deliberately conservative: it unwraps the inline emphasis markers people
 * actually hit (bold, italic, inline code, strikethrough, links) and leaves
 * everything else alone. Stray, unpaired `*` and `_` survive untouched, because
 * a lone asterisk in prose is prose — mangling it would be worse than the
 * problem this solves.
 */

/** Ordered so the greedy double-marker forms resolve before the single ones. */
const INLINE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // [label](href) → label. Runs first so emphasis inside a label still unwraps.
  [/\[([^\]]+)\]\([^)]*\)/g, "$1"],
  [/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "$1"],
  [/___(?=\S)([\s\S]*?\S)___/g, "$1"],
  [/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1"],
  [/__(?=\S)([\s\S]*?\S)__/g, "$1"],
  [/~~(?=\S)([\s\S]*?\S)~~/g, "$1"],
  [/\*(?=\S)([^*\n]*?\S)\*/g, "$1"],
  // Underscore italics only between word boundaries: snake_case_names are not
  // emphasis, and mangling an identifier is a worse defect than a stray marker.
  [/(^|[\s(])_(?=\S)([^_\n]*?\S)_(?=[\s).,;:!?]|$)/g, "$1$2"],
  [/`([^`\n]+)`/g, "$1"],
];

/**
 * Strip inline markdown emphasis so the text reads cleanly as prose.
 *
 * Returns "" for nullish input so callers can pass a possibly-absent DB column
 * straight in.
 */
export function markdownToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  let text = value;
  for (const [pattern, replacement] of INLINE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}
