/**
 * A DECLARED MACHINE LINE NEVER REACHES A PERSON'S SCREEN — including out of a
 * row that was written before the filter existed.
 *
 * A control token is a line a mandate asks a model to write for the SERVER, not
 * for the reader: `WRAP_RATING: 4` is the vision-interview primary voice rating
 * how ready the stage is to wrap. aidream owns the registry
 * (`aidream/services/mandates/control_token_declarations.py`, filtered at
 * `matrx_connect/emitters/control_tokens.py`) and a census guard that fails its
 * build when an instruction asks for a line nobody declared.
 *
 * That filter runs at the EMITTER, so it protects text written after it landed
 * (2026-09-15) and nothing before. The turns already in the database keep the
 * line, and on 2026-09-16 a vision interview from the day before still read, in
 * the middle of the expert's own transcript:
 *
 *     Does the intake technician select from a strict, finite list …?
 *
 *     WRAP_RATING: 4
 *
 * So the reader is protected on the way IN as well as on the way out. This
 * strips only the tokens whose aidream declaration is human-visible and
 * filtered; the bench's deliberately-unfiltered SEARCH/FINAL lines are not
 * listed, because their consumer is a harness and no person reads them.
 */

/** Names mirrored from aidream's `DECLARED` where `filter_enabled` is true. */
export const HUMAN_FILTERED_CONTROL_TOKENS = ["WRAP_RATING", "USED"] as const;

const LINE_PATTERN = new RegExp(
  `^[ \\t>*_-]*(?:${HUMAN_FILTERED_CONTROL_TOKENS.join("|")})\\s*:.*$`,
);

/**
 * Removes whole lines that are nothing but a declared control token, and
 * collapses the blank line each one leaves behind. Prose that merely mentions a
 * token mid-sentence is untouched: only a line that STARTS with it counts.
 */
export function stripControlLines(text: string): string {
  if (!text) return text;
  const kept = text
    .split("\n")
    .filter((line) => !LINE_PATTERN.test(line.trimEnd()));
  if (kept.length === text.split("\n").length) return text;
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}
