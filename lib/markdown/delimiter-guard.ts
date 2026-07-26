/**
 * Markdown delimiter guard — stops ONE stray delimiter from swallowing a
 * whole section of an answer.
 *
 * THE FAILURE CLASS
 * -----------------
 * Markdown delimiters pair greedily and blindly. A single stray opener emitted
 * by a model (the common shape is a mangled citation:
 * `…/a-quicker-way-to-heal-prp-and-prf$$ .`) pairs with the next matching
 * delimiter anywhere later in the message, and everything in between —
 * headings, bold, links, whole sections — collapses into one node.
 *
 * Two delimiters cause this in our pipeline:
 *
 * 1. `$$` (remark-math). The swallowed prose becomes a math node, KaTeX fails
 *    to parse it, and `rehype-katex` falls back to its built-in error
 *    rendering: the raw source re-emitted inside `<span class="katex-error"
 *    style="color:#cc0000">`. With our display-math `font-size: 1.5em` rule
 *    (BasicMarkdownContent) the symptom is a huge block of BRIGHT RED
 *    unrendered markdown mid-answer. That red is KaTeX reporting a parse error
 *    on text that was never math — not a style of ours.
 * 2. `[` (CommonMark link label). The swallowed prose becomes the label of one
 *    enormous hyperlink — the same bug wearing blue instead of red.
 *
 * WHAT THIS DOES
 * --------------
 * Before the markdown pipeline runs, each candidate span is checked for
 * plausibility. A `$$…$$` span carrying markdown structure (links, URLs, bold,
 * headings, list markers) or reading as prose is not math; a link label that is
 * hundreds of characters long or contains block structure is not a label. The
 * offending OPENER is neutralized (`&#36;&#36;`, `&#91;`) and scanning resumes at the next
 * delimiter, so genuine math and genuine links later in the same message still
 * render. Real content is never touched.
 *
 * LOUD RECOVERY: every firing is a real upstream defect (a model emitting
 * malformed delimiters, or a producer mangling a citation). Callers report the
 * returned violations — see `reportDelimiterViolations`.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export type DelimiterViolationReason =
  /** A `$$…$$` pair whose contents are prose/markdown, not math. */
  | "prose-span"
  /** A `$$` with no closing partner in the content. */
  | "unpaired"
  /** A `[…](…)` link whose label swallowed prose/structure. */
  | "runaway-link";

export interface DelimiterViolation {
  reason: DelimiterViolationReason;
  /** Character offset of the offending delimiter in the input string. */
  index: number;
  /** Length of the span between the delimiters (0 for `unpaired`). */
  spanLength: number;
  /** Short excerpt of what would have been swallowed. */
  preview: string;
}

export interface DelimiterGuardResult {
  /** Input with runaway openers escaped. */
  text: string;
  violations: DelimiterViolation[];
}

/**
 * Neutralized delimiters. Two requirements drove this encoding:
 *
 * - It must be INVISIBLE in the rendered output. A backslash escape (`\$\$`)
 *   is emitted literally when the delimiter abuts constructs remark does not
 *   re-parse, so the reader sees stray backslashes.
 * - It must not be swallowed by the GFM autolink extension. These strays sit
 *   right after a bare URL (that is how they are produced), and a character
 *   reference placed there is absorbed into the link target instead of being
 *   decoded.
 *
 * A zero-width space satisfies both: it terminates the autolink, splits the
 * `$$` token so remark-math never sees a delimiter (single `$` is inert —
 * `singleDollarTextMath: false`), and renders as nothing. The bracket keeps a
 * character reference (a lone `[` has no token to split) behind a ZWSP.
 */
const ZWSP = "\u200B";
const ESCAPED_DOLLARS = `${ZWSP}$${ZWSP}$`;
const ESCAPED_BRACKET = `${ZWSP}&#91;`;

/** Longest span we will accept as real math when no LaTeX command is present. */
const MAX_MATH_SPAN = 600;

/**
 * Markdown structure that can never appear inside real math:
 * a markdown link, a bare URL, bold markers, an ATX heading, or a
 * line-leading list marker.
 */
const STRUCTURAL_MARKDOWN =
  /\]\(|https?:\/\/|\*\*|(?:^|\n)[ \t]{0,3}#{1,6}[ \t]|(?:^|\n)[ \t]*[-*+][ \t]+|(?:^|\n)[ \t]*\d+[.)][ \t]/;

/** A LaTeX control sequence (`\frac`, `\sim`, `\text`, …). */
const LATEX_COMMAND = /\\[a-zA-Z]/;

/** Alphabetic words of 3+ letters — the prose signal for command-free spans. */
const PROSE_WORD = /[A-Za-z]{3,}/g;

/** Word count at which a LaTeX-command-free span is judged to be prose. */
const PROSE_WORD_LIMIT = 6;

function looksLikeMath(inner: string): boolean {
  const s = inner.trim();
  if (!s) return false;

  // Structural markdown wins over every other signal — a swallowed prose span
  // routinely contains real LaTeX fragments (`$\sim 200 \text{ g}$`) picked up
  // from the sentences it ate, so the command check cannot run first.
  if (STRUCTURAL_MARKDOWN.test(s)) return false;

  if (s.length > MAX_MATH_SPAN) return false;

  // A LaTeX control sequence is strong evidence of math — but not proof: a
  // swallowed span often eats sentences that themselves contained inline math
  // (`$\sim 400 \text{ g}$`). Real math is symbol-dense, so a span that is
  // mostly English words is still prose.
  if (LATEX_COMMAND.test(s)) {
    return (s.match(PROSE_WORD) ?? []).length < PROSE_WORD_LIMIT * 3;
  }

  if (/\n[ \t]*\n/.test(s)) return false;

  return (s.match(PROSE_WORD) ?? []).length < PROSE_WORD_LIMIT;
}

/** Ranges (fenced blocks, inline code) whose `$$` must be ignored. */
function protectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const patterns = [/```[\s\S]*?(?:```|$)/g, /~~~[\s\S]*?(?:~~~|$)/g, /`[^`\n]*`/g];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      ranges.push([m.index, m.index + m[0].length]);
    }
  }
  return ranges;
}

function isProtected(index: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => index >= start && index < end);
}

function preview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Escapes `$$` delimiters that would make remark-math swallow non-math text.
 * Pure — safe to call on every render / stream chunk.
 */
export function guardMathDelimiters(text: string): DelimiterGuardResult {
  if (!text.includes("$$")) return { text, violations: [] };

  const ranges = protectedRanges(text);

  // Collect `$$` offsets outside code.
  const tokens: number[] = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== "$" || text[i + 1] !== "$") continue;
    if (!isProtected(i, ranges)) tokens.push(i);
    i++; // never treat the second `$` of a pair as a new opener
  }
  if (tokens.length === 0) return { text, violations: [] };

  const violations: DelimiterViolation[] = [];
  const escapeAt: number[] = [];

  let j = 0;
  while (j < tokens.length) {
    const open = tokens[j];
    const close = tokens[j + 1];

    if (close === undefined) {
      violations.push({
        reason: "unpaired",
        index: open,
        spanLength: 0,
        // An unpaired `$$` is inert to remark-math (nothing closes it), so it
        // is reported but NOT escaped — it already renders as literal text.
        preview: preview(text.slice(open, open + 120)),
      });
      break;
    }

    const inner = text.slice(open + 2, close);
    if (looksLikeMath(inner)) {
      j += 2;
      continue;
    }

    escapeAt.push(open);
    violations.push({
      reason: "prose-span",
      index: open,
      spanLength: inner.length,
      preview: preview(inner),
    });
    // Resume at the closing delimiter: it may legitimately open the NEXT span.
    j += 1;
  }

  let guarded = text;
  for (const index of [...escapeAt].sort((a, b) => b - a)) {
    guarded = `${guarded.slice(0, index)}${ESCAPED_DOLLARS}${guarded.slice(index + 2)}`;
  }

  return { text: guarded, violations };
}

/** Longest link label we accept before calling it a runaway. */
const MAX_LINK_LABEL = 200;

/**
 * Block structure that can never legitimately sit inside a link label:
 * a blank line, a list item on its own line, or an ATX heading marker
 * (`## `…`#### `) anywhere — a heading inside a label always means the label
 * ran past its intended end.
 */
const LABEL_BLOCK_STRUCTURE =
  /\n[ \t]*\n|(?:^|\n)[ \t]*[-*+][ \t]+|#{2,6}[ \t]/;

/**
 * Escapes the `[` of a markdown link whose label ran away — the link twin of
 * the stray-`$$` bug. An unclosed citation bracket pairs with a `]` hundreds of
 * characters later and turns an entire section into one hyperlink.
 *
 * Pure. Runs after the math guard so both share one escaping pass conceptually,
 * but each is independently usable.
 */
export function guardRunawayLinks(text: string): DelimiterGuardResult {
  if (!text.includes("[")) return { text, violations: [] };

  const ranges = protectedRanges(text);
  const violations: DelimiterViolation[] = [];
  const escapeAt: number[] = [];

  // `[label](target)` — label is non-greedy but may span newlines, which is
  // exactly the runaway shape we are looking for.
  const linkRe = /\[((?:[^[\]]|\\.)*)\]\(([^\s)]*)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    const open = m.index;
    if (isProtected(open, ranges)) continue;

    const label = m[1];
    const runaway =
      label.length > MAX_LINK_LABEL || LABEL_BLOCK_STRUCTURE.test(label);
    if (!runaway) continue;

    escapeAt.push(open);
    violations.push({
      reason: "runaway-link",
      index: open,
      spanLength: label.length,
      preview: preview(label),
    });
  }

  let guarded = text;
  for (const index of [...escapeAt].sort((a, b) => b - a)) {
    guarded = `${guarded.slice(0, index)}${ESCAPED_BRACKET}${guarded.slice(index + 1)}`;
  }

  return { text: guarded, violations };
}

/**
 * The front door: run every delimiter guard in order. Offsets in the returned
 * violations refer to each guard's own input, so they are for diagnostics only.
 */
export function guardMarkdownDelimiters(text: string): DelimiterGuardResult {
  const math = guardMathDelimiters(text);
  const links = guardRunawayLinks(math.text);
  return {
    text: links.text,
    violations: [...math.violations, ...links.violations],
  };
}

/**
 * Loud recovery. A firing means malformed math delimiters reached the renderer
 * — the guard kept the message readable, but the producer is still emitting
 * broken content and must be found.
 */
export function reportDelimiterViolations(
  violations: DelimiterViolation[],
  context: { renderPath: string; messageId?: string; conversationId?: string },
): void {
  if (violations.length === 0) return;
  try {
    const worst =
      violations.find((v) => v.reason !== "unpaired") ?? violations[0];
    const message =
      worst.reason === "prose-span"
        ? `Malformed math delimiters: a stray "$$" would have turned ${worst.spanLength} chars of prose into a math span (KaTeX would render it as red error text). Escaped it.`
        : worst.reason === "runaway-link"
          ? `Runaway markdown link: an unclosed "[" would have turned ${worst.spanLength} chars into one link label. Escaped it.`
          : `Malformed math delimiters: an unpaired "$$" reached the renderer.`;

    // eslint-disable-next-line no-console -- loud recovery: this is a defect.
    console.warn(`[markdown-delimiter-guard] ${message}`, {
      renderPath: context.renderPath,
      violations,
    });

    captureError({
      source: "markdown-delimiters",
      message,
      relation: `markdown:${context.renderPath}`,
      details: worst.preview,
      conversationId: context.conversationId,
      callSite: "guardMarkdownDelimiters",
      raw: { messageId: context.messageId, violations },
    });
  } catch {
    // Capture must never break rendering.
  }
}
