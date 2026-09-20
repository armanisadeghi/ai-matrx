// lib/progress/failureSentence.ts
//
// 🚨 A RAW EXCEPTION CLASS NAME IS NEVER A REASON, AND MUST NEVER REACH A PERSON.
//
// ## The defect this closes (twelfth cold walk, 2026-09-20, D2)
//
// A first-time Expert dropped five files on a Rulebook and the outcome screen
// printed, five times over:
//
//   Reading “02_controller_reprogram_cases.md” failed (AppError). Nothing was
//   added to your Rulebook.
//
// `AppError` is the name of a Python base class. It is not a reason, it is not
// actionable, and to the commercial irrigation contractor this product is for
// it is indistinguishable from noise. The real cause — a NOT NULL violation on
// `organization_id` after a migration dropped 341 org-stamping triggers — was
// thrown away by the `except` that wrote that sentence and existed in no log
// anywhere. aidream 3e51a3e865 fixed the SERVER half: `report_sub_pipeline_
// failure` now lands the exception in `system_error` and returns the sentence
// that names the real cause.
//
// This file is the CLIENT half, and it is not redundant with that fix. A screen
// that renders whatever sentence arrives is one bad `except` away from printing
// a class name again — in this lane or in any of the dozen others that show a
// server failure sentence. So the rule lives once, on the render path, where it
// is structural rather than remembered:
//
//   * a parenthesised exception-class token is REMOVED from a person-facing
//     sentence, always. Nothing is lost: the class name told the person nothing,
//     and the exception itself is in `system_error` with the run on it.
//   * when that token was standing where the REASON should have been — i.e.
//     nothing else in the sentence says why — the sentence must not pretend it
//     explained itself. `saidWhy` comes back false and the surface says so
//     plainly and offers the way out, rather than showing a failure with a hole
//     in the middle of it.
//   * a failure sentence that explained NOTHING carries a remedy (law #4:
//     nothing fails silently, and a stand-in without a remedy is a dead end
//     wearing a sentence). A sentence that DID explain itself is left exactly
//     as the server wrote it: the copy-protection refusal already names four
//     lawful ways in, and bolting "try it again" onto it would tell a person
//     to re-run a read that cannot ever succeed.
//
// It is deliberately in `lib/progress/` beside `honestSummary.ts`, which owns
// the other half of this rule (`DEFAULT_FAILURE_REMEDY`, and "a reassurance may
// never contradict a red row") — one home for how a failing run talks.

import { DEFAULT_FAILURE_REMEDY } from "./honestSummary";

/**
 * A parenthesised exception-class token, as every flattening `except` in the
 * platform writes it: `(AppError)`, `(ValueError)`, `(asyncio.TimeoutError)`,
 * `(ProxyError)`. Deliberately anchored on the parentheses — a sentence that
 * mentions "error" in prose ("YouTube returned an error page") is a real
 * reason and is left exactly as the server wrote it.
 */
const PARENTHESISED_CLASS =
  /\s*\((?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Failure)\)/g;

/** The same token standing ALONE as the whole message. */
const BARE_CLASS =
  /^(?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Failure)\.?$/;

/**
 * What a sentence looks like once the class name is gone, and whether anything
 * is left that actually says why.
 */
export interface HumanFailure {
  /**
   * The sentence to show. Never contains an exception class name, always ends
   * with a remedy.
   */
  text: string;
  /**
   * False when the only thing standing where the reason belonged was a class
   * name (or there was no sentence at all). The surface is then saying "we do
   * not know why" out loud rather than implying it explained itself.
   */
  saidWhy: boolean;
}

/**
 * The sentence a person is shown for one failure.
 *
 * `raw` is whatever the server sent for this unit of work — a source row's
 * `error`, a lane's fatal-error message, a run's terminal error. Anything
 * falsy is treated the same as a sentence that said nothing.
 */
export function humanFailureSentence(
  raw: string | null | undefined,
  {
    remedy = DEFAULT_FAILURE_REMEDY,
    /**
     * What we say when the server did not name a cause. It is a FACT about our
     * own reporting, not a guess about the failure — never "the file may be
     * corrupt" or any other invented diagnosis.
     */
    noReason = "The server did not say why.",
  }: { remedy?: string; noReason?: string } = {},
): HumanFailure {
  const original = (raw ?? "").trim();

  if (!original || BARE_CLASS.test(original)) {
    return { text: `${noReason} ${remedy}`, saidWhy: false };
  }

  const hadClassToken = PARENTHESISED_CLASS.test(original);
  // `test` on a /g/ regex advances `lastIndex`; reset before reusing it.
  PARENTHESISED_CLASS.lastIndex = 0;
  const stripped = original.replace(PARENTHESISED_CLASS, "").trim();

  // Did the class name stand where the reason belonged? The shape the whole
  // walk recorded is "Reading “X” failed. Nothing was added to your Rulebook."
  // — a sentence that names WHAT broke and never WHY. So: a stripped sentence
  // that still carries a "failed"/"could not"-style clause and nothing after it
  // beyond our own boilerplate has not explained anything.
  const saidWhy = hadClassToken ? mentionsACause(stripped) : true;

  const body = stripped || noReason;
  // THE REMEDY GOES WHERE THERE IS NOTHING ELSE. A sentence that named its own
  // cause — and usually its own way forward with it — is the server's account
  // and is not edited.
  const text = saidWhy
    ? endSentence(body)
    : withRemedy(`${body} ${noReason}`.replace(/\s+/g, " ").trim(), remedy);
  return { text, saidWhy };
}

/**
 * Does what is left of the sentence actually say WHY, as opposed to only
 * saying that something failed and what the consequence was?
 *
 * The test is deliberately conservative — a sentence we cannot classify is
 * treated as having explained itself, because over-claiming "the server did
 * not say why" on top of a server that DID say why is the same class of lie in
 * the other direction. The only shapes it calls unexplained are the ones the
 * flattening `except` blocks actually produce: a failure clause, optionally
 * followed by what did not happen, and nothing else.
 */
function mentionsACause(stripped: string): boolean {
  const text = stripped.toLowerCase();
  // Everything after the first sentence-ending punctuation is the consequence
  // ("Nothing was added to your Rulebook.") or our own remedy; the reason, if
  // there is one, rides in the first clause with the failure verb.
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  // "failed", "could not be read", "stopped" with NOTHING attached — no
  // "because", no ":", no "—" introducing the cause.
  const carriesCauseMarker = /[:—–]|\bbecause\b|\bafter\b|\bwhile\b/.test(first);
  const isBareFailureClause =
    /\b(failed|could not|couldn’t|couldn't|was not able|stopped|refused)\b/.test(
      first,
    );
  return carriesCauseMarker || !isBareFailureClause;
}

function withRemedy(body: string, remedy: string): string {
  const text = body.trim();
  if (!remedy) return text;
  if (text.toLowerCase().includes(remedy.toLowerCase().slice(0, 24))) return text;
  return `${endSentence(text)} ${remedy}`;
}

function endSentence(text: string): string {
  return /[.!?…]$/.test(text) ? text : `${text}.`;
}

/**
 * The census predicate. Exported so a guard can assert that nothing this
 * product puts in front of a person carries an exception class name — see
 * `lib/progress/__tests__/a-class-name-is-never-a-reason.test.ts`.
 */
export function namesAnExceptionClass(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (BARE_CLASS.test(value)) return true;
  PARENTHESISED_CLASS.lastIndex = 0;
  const found = PARENTHESISED_CLASS.test(value);
  PARENTHESISED_CLASS.lastIndex = 0;
  return found;
}
