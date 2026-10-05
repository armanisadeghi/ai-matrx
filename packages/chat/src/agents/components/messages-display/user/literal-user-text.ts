/**
 * The person's own words render as typed.
 *
 * Special blocks (`<decision>`, `<questionnaire>`, …) are what an ASSISTANT
 * emits. When a person TYPES such a tag — "Answer using a <decision
 * prompt="Pick one"> block" — the render pipeline read it as a half-open block
 * and the bubble showed "Answer using a  block". Found live 2026-10-04
 * (chat 9ed2ce2a…). The stored and sent text was always intact; only the bubble
 * dropped it.
 *
 * `literalUserText` entity-escapes the `<` of those tags, outside code fences
 * and inline code (which already render literally), before the text reaches the
 * markdown pipeline. Editor pills (`editor_error`, `editor_code_snippet`) and
 * `audiocite` are deliberately NOT escaped: they round-trip through user turns
 * on purpose.
 */

const ASSISTANT_BLOCK_TAGS = [
  "thinking", "think", "reasoning", "info", "task", "database", "private", "plan",
  "event", "tool", "questionnaire", "flashcards", "cooking_recipe", "timeline",
  "progress_tracker", "troubleshooting", "resources", "research", "decision", "artifact",
  "option",
];

const TAG_RE = new RegExp(`<(/?(?:${ASSISTANT_BLOCK_TAGS.join("|")}))(?=[\\s>/])`, "gi");
// Fenced blocks and inline code spans are already literal.
const CODE_RE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g;

export function literalUserText(text: string): string {
  return text
    .split(CODE_RE)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(TAG_RE, "&lt;$1")))
    .join("");
}
