// features/education/trust/documentPassage.ts
//
// Where a markdown-document citation lands. The server names the cited part
// `<id>:<n>` (the n-th packed paragraph run) — a count the browser cannot
// reproduce — so the place is found the way a transcript quote is: by the
// quoted words. The body's lines are searched for the excerpt's opening words;
// the heading path above that line names the section, and the lines the quote
// spans are the passage. Pure — the body is read by `useDocumentPassage`.

export interface DocumentPassage {
  /** Index of the first body line of the passage. */
  startLine: number;
  /** One past the last body line of the passage. */
  endLine: number;
  /** Headings above the passage, outermost first (`Mechanism`, `Substrate binding`). */
  headings: string[];
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** "Mechanism › Substrate binding"; the document title (a lone `#` root) is dropped. */
export function headingLabel(headings: readonly string[]): string | null {
  const shown = headings.length > 1 ? headings.slice(1) : headings;
  return shown.length ? shown.join(" › ") : null;
}

/**
 * The passage a quote sits in, or null when its opening words are not in the
 * body (no guess). A quote's later words drift, so only the opening run
 * (8 words down to 3, at least 16 letters) is searched.
 */
export function findDocumentPassage(
  body: string | null | undefined,
  excerpt: string | null | undefined,
): DocumentPassage | null {
  const lines = (body ?? "").split("\n");
  const quote = (excerpt ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const words = norm(quote).split(" ").filter(Boolean);
  const normLines = lines.map(norm);
  let at = -1;
  for (let n = Math.min(8, words.length); n >= 3 && at < 0; n--) {
    const needle = words.slice(0, n).join(" ");
    if (needle.length < 16) break;
    at = normLines.findIndex((l) => l.includes(needle));
  }
  if (at < 0) return null;

  const stack: Array<{ level: number; text: string }> = [];
  for (let i = 0; i <= at; i++) {
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i]!);
    if (!m) continue;
    const level = m[1]!.length;
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    stack.push({ level, text: m[2]!.replace(/[*_`]/g, "").trim() });
  }
  // A heading line IS its own section's start, not "inside" it as a passage.
  const target = norm(excerpt ?? "").length;
  let end = at + 1;
  let seen = normLines[at]!.length;
  while (end < lines.length && seen < target && !/^#{1,6}\s/.test(lines[end]!)) {
    seen += normLines[end]!.length + 1;
    end++;
  }
  return { startLine: at, endLine: end, headings: stack.map((s) => s.text) };
}
