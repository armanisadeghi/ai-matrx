/**
 * Compatibility surface for published packages that still import the thinking
 * helpers from `@ai-matrx/kit/text`. Those helpers moved to content-ir/source,
 * while the current kit release keeps its two sentence-assembly utilities.
 */
import {
  hasThinkingTags,
  stripThinking,
  stripThinkingStreaming,
} from "@ai-matrx/content-ir/source";

export { hasThinkingTags, stripThinking, stripThinkingStreaming };

export interface EditorSurroundPosition {
  selectionStart: number;
  selectionEnd: number;
}

export function asClause(value: unknown): string {
  if (value == null) return "";
  return (typeof value === "string" ? value : String(value)).replace(/[\s.!?…。]+$/u, "");
}

export function formatEditorSurroundContext(
  content: string,
  position: EditorSurroundPosition,
  maxCharsPerSide = 500,
): string {
  const length = content.length;
  const normalizePosition = (value: number, fallback: number) =>
    Number.isFinite(value) ? Math.trunc(value) : fallback;
  const start = Math.max(0, Math.min(normalizePosition(position.selectionStart, 0), length));
  const end = Math.max(start, Math.min(normalizePosition(position.selectionEnd, start), length));
  const width = Math.max(0, Math.trunc(maxCharsPerSide));
  const escapeXmlText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const before = escapeXmlText(content.slice(Math.max(0, start - width), start)).replace(/\n$/, "");
  const after = escapeXmlText(content.slice(end, Math.min(length, end + width))).replace(/^\n/, "");
  return `<TEXT_BEFORE>\n${before}\n</TEXT_BEFORE>\n<TEXT_AFTER>\n${after}\n</TEXT_AFTER>`;
}
