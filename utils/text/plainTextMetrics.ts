export interface PlainTextMetrics {
  /** Total Unicode code units in the string (same as `.length`). */
  charCount: number;
  /** Characters excluding whitespace. */
  nonWhitespaceCharCount: number;
  /** Whitespace-delimited tokens; 0 when empty or whitespace-only. */
  wordCount: number;
  /** Newline-separated rows; 0 when the string is empty. */
  lineCount: number;
  /** Blocks separated by one or more blank lines; 0 when empty. */
  paragraphCount: number;
}

/** Lightweight stats for a plain-text buffer (editor footers, toolbars, etc.). */
export function computePlainTextMetrics(text: string): PlainTextMetrics {
  const charCount = text.length;
  const trimmed = text.trim();

  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const lineCount = charCount === 0 ? 0 : text.split("\n").length;
  const paragraphCount = trimmed
    ? text.split(/\n\s*\n/).filter((block) => block.trim().length > 0).length
    : 0;
  const nonWhitespaceCharCount = text.replace(/\s/g, "").length;

  return {
    charCount,
    nonWhitespaceCharCount,
    wordCount,
    lineCount,
    paragraphCount,
  };
}
