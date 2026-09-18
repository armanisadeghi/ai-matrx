// features/masterwork/kept-sources/ruleQuotes.ts
//
// WHAT TO LIGHT UP when a person jumps from a rule to its passage.
//
// The quotes on a rule are MACHINE-VERIFIED VERBATIM against the kept source
// at ingestion (`source_ref.quote_unverified` marks the ones that are not), so
// finding them in the raw material is plain literal string matching and
// nothing more. That is the whole reason this file is twenty lines and not a
// fuzzy-anchoring system: the guarantee was made upstream, on the bytes that
// were actually stored, so the UI does not have to guess.
//
// A rule carries up to two kinds of quote — `rule.quote`, the expression it
// was built from (`distill.py` writes it at the TOP level of the rule, and
// writes `null` rather than an unverified span), and `source_ref.quotes`, the
// OTHER ways that source stated the same judgment (kept since "neither
// expression wins"). Both are fed to the highlighter, because a person who
// jumped here to check one rule wants every place their source said it, not
// the first one append order happened to keep.
//
// The matching itself is `components/text/HighlightedText` over
// `features/notes/utils/findMatches` — THE ONE matcher in the codebase. This
// file only decides WHICH strings to hand it.

import type { RulebookRule } from "../types";

/**
 * Every verbatim string this rule claims its source contains, longest first.
 *
 * Longest first matters: `computeMatches` walks the text once and the
 * highlighter skips ranges that overlap one already taken, so a short quote
 * that is a substring of a longer one would otherwise win the span and leave
 * the fuller passage unmarked around it.
 *
 * Deduplicated and trimmed of blanks. Empty for a rule with no quote at all —
 * a real state (a paraphrased or interview-distilled rule), and the reader
 * says so rather than opening with nothing lit and no explanation.
 */
export function ruleQuotes(rule: Pick<RulebookRule, "quote" | "source_ref">): string[] {
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  };
  push(rule.quote);
  for (const kept of rule.source_ref?.quotes ?? []) {
    push(kept.quote);
  }
  return [...seen].sort((a, b) => b.length - a.length);
}
