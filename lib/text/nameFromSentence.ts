// lib/text/nameFromSentence.ts
//
// 🚨 A NAME NEVER STOPS MID-THOUGHT WITHOUT SAYING SO.
//
// Everywhere in this product, a person types a sentence about their own work
// and we turn it into the name of the thing they just made — a Rulebook, a
// Vision Interview, a rule saved out of a conversation. It is the first thing
// they see afterwards, and it is how they tell their own work apart later.
//
// This kept being written by hand, once per surface, and every hand-rolled
// copy lost the same detail. Cold walk, 2026-09-16: someone typed
//
//   "How I decide which incoming e-waste pallets need a manual sort instead
//    of going straight to the shredder."
//
// and the Rulebook header read
//
//   "How I decide which incoming e-waste pallets need a manual"
//
// — cut on a dangling adjective, with nothing at all saying it had been cut.
// A first-timer reads that as a typo, not as a decision. The Vision Interview
// had the identical defect a day earlier (its list read nine rows of
// "I want a simple assistant that tells"); the rule-saving path still has it.
// Three copies, one bug, so this is the one implementation all three call.
//
// The rules, in order:
//   1. The person's own FIRST SENTENCE is what they would call it.
//   2. If it fits, use it whole — and say so with an ellipsis if there was
//      more after it, because "…" is the difference between a name and a lie.
//   3. If it does not fit, cut at a WORD boundary and always mark the cut.
//   4. Empty input gets the caller's fallback, never an empty string.

/** The default ceiling — long enough to tell two of anything apart. */
export const NAME_FROM_SENTENCE_MAX_LENGTH = 72;

export interface NameFromSentenceOptions {
  /** Longest name to produce, before the ellipsis. */
  maxLength?: number;
  /** What to return when there is nothing to name. */
  fallback?: string;
}

/**
 * Turn what a person typed into the name of the thing they made.
 *
 * Always returns either the text unabridged, or an abridgement that ENDS IN
 * an ellipsis. There is no third outcome: a caller can trust that a name
 * without "…" is the whole thought.
 */
export function nameFromSentence(
  typed: string,
  options: NameFromSentenceOptions = {},
): string {
  const maxLength = options.maxLength ?? NAME_FROM_SENTENCE_MAX_LENGTH;
  const fallback = options.fallback ?? "Untitled";

  const text = typed.replace(/\s+/g, " ").trim();
  if (!text) return fallback;

  // Rule 1 — the first sentence is the name.
  const sentenceEnd = text.search(/[.!?](\s|$)/);
  const firstSentence =
    sentenceEnd === -1 ? text : text.slice(0, sentenceEnd + 1);
  const candidate = firstSentence.trim() || text;
  // Anything after that sentence was dropped — its own terminator does not count.
  const droppedSomething = text.slice(candidate.length).trim().length > 0;

  // Rule 2 — it fits.
  if (candidate.length <= maxLength) {
    return droppedSomething ? `${candidate.replace(/[.!?]+$/, "")}…` : candidate;
  }

  // Rule 3 — it does not, so cut at a word boundary and MARK it.
  const clipped = candidate.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  // A cut that lands in the first few characters would leave a name made of
  // one fragment; keep the hard cut rather than a two-letter title.
  const atWord =
    lastSpace > Math.min(20, Math.floor(maxLength / 3))
      ? clipped.slice(0, lastSpace)
      : clipped;
  return `${atWord.replace(/[,;:\s]+$/, "").replace(/[.!?]+$/, "")}…`;
}
