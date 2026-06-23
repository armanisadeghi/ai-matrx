/**
 * Derive 1-based line/column + line count from a plain textarea caret index.
 * Used by demo harnesses that stand in for Monaco when mirroring `/code` context.
 */
export function textareaCursorMeta(content: string, caretIndex: number) {
  const safeIndex = Math.max(0, Math.min(caretIndex, content.length));
  const before = content.slice(0, safeIndex);
  const linesBefore = before.split("\n");
  const currentLine = linesBefore.length;
  const currentColumn = (linesBefore[linesBefore.length - 1]?.length ?? 0) + 1;
  const lineCount = content.length === 0 ? 1 : content.split("\n").length;

  return { currentLine, currentColumn, lineCount };
}
