// ─────────────────────────────────────────────────────────────────────────
// THE ONE NESTED-FENCE RULE for a ```markdown / ```md / ```mdx fence.
//
// Models write a markdown document inside a ```markdown fence and put their
// own ```python … ``` blocks inside it with the SAME three backticks. Under
// strict CommonMark the first inner bare ``` closes the outer fence, which
// shredded the whole message: the markdown card ended mid-document, the rest
// of the document leaked out as prose, and the outer closing ``` then opened
// a phantom code block that swallowed everything after it (seen live,
// 2026-09-23 — Arman: "when we have a 'markdown' block inside of our text, we
// show a markdown block component but it's not formatted properly").
//
// The rule, for MARKDOWN-language fences only (every other language keeps
// strict CommonMark — a ```bash heredoc is code, not a document):
//   - a fence line WITH an info string (```python) opens a nested fence;
//   - a bare fence line (``` with at least the opener's tick count) closes
//     the innermost nested fence while one is open, and closes the outer
//     fence only when none is;
//   - a longer outer fence (````markdown) keeps working exactly as before —
//     an inner ``` is shorter than the opener, so it is plain content.
//
// Used by BOTH block splitters — the static one
// (`content-splitter-v2.ts`) and the live one (`StreamBlockAccumulator`) —
// so a message renders identically while streaming and after reload.
// ─────────────────────────────────────────────────────────────────────────

/** Fence languages whose body is itself a markdown document. */
export const NESTING_FENCE_LANGUAGES: ReadonlySet<string> = new Set([
  "markdown",
  "md",
  "mdx",
]);

/** True when a fence opened with this info-string language nests inner fences. */
export function fenceNestsInnerFences(language: string | undefined | null): boolean {
  return !!language && NESTING_FENCE_LANGUAGES.has(language.toLowerCase());
}

export type InnerFenceLine =
  /** Not a fence line — ordinary content of the outer fence. */
  | "content"
  /** ```lang inside a markdown fence — content, and one level deeper. */
  | "open-nested"
  /** Bare ``` that closes the innermost nested fence — content, one level up. */
  | "close-nested"
  /** Bare ``` that closes the OUTER fence. */
  | "close-outer";

/**
 * Classify one TRIMMED line inside an open backtick fence.
 *
 * @param trimmed     the line with surrounding whitespace removed
 * @param openTicks   backtick count of the outer fence's opener
 * @param nests       whether the outer fence follows the nesting rule
 * @param nestedDepth how many nested fences are open right now
 */
export function classifyInnerFenceLine(
  trimmed: string,
  openTicks: number,
  nests: boolean,
  nestedDepth: number,
): InnerFenceLine {
  let ticks = 0;
  while (ticks < trimmed.length && trimmed[ticks] === "`") ticks++;
  if (ticks < 3) return "content";
  const info = trimmed.slice(ticks).trim();
  if (info === "") {
    if (ticks < openTicks) return "content";
    if (nests && nestedDepth > 0) return "close-nested";
    return "close-outer";
  }
  // A fence line with an info string never closes anything (CommonMark).
  // Inside a markdown fence it opens a nested one — unless the outer opener is
  // LONGER, in which case CommonMark already treats the inner fence as content
  // and its bare closer can never reach the outer fence.
  if (nests && ticks >= openTicks && !info.includes("`")) return "open-nested";
  return "content";
}
