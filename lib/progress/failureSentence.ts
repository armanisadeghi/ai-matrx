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
 * Known raw provider/error TOKENS — not sentences — that a source still
 * writes directly into a "reason" column with no `error_sentence` alongside
 * it (`platform.acquisition_block.error_class`). cold-walk-13
 * (common-docs/projects/masterwork-methods-census/jobs-bar-2026-09-16/
 * cold-walk-13/README.md, Friction): the acquisition console's "What
 * happened" cell printed `LOGIN_REQUIRED` and `ProxyError` — a Python
 * exception class and a provider enum value — inside otherwise excellent
 * person-facing sentences.
 *
 * Same rule as the rest of this file, applied to a bare token instead of a
 * whole sentence: the token itself never reaches the sentence a person
 * reads. A recognised token gets a specific, plain sentence; anything else
 * says "a provider error" and carries the token as a SECONDARY detail —
 * useful if the person reports it, never folded into the sentence itself.
 */
const KNOWN_PROVIDER_ERROR_TOKENS: Record<string, string> = {
  LOGIN_REQUIRED: "This account needs you to sign in again.",
  login_required: "This account needs you to sign in again.",
  ProxyError: "The connection through our network failed.",
  PROXY_ERROR: "The connection through our network failed.",
  TimeoutError: "The provider did not answer in time.",
  TIMEOUT: "The provider did not answer in time.",
  RATE_LIMITED: "The provider is rate-limiting us right now.",
  RateLimitError: "The provider is rate-limiting us right now.",
  CAPTCHA: "The provider asked us to prove we are not a robot.",
  BOT_WALL: "The provider blocked automated access.",
  FORBIDDEN: "The provider refused the request.",
  AuthenticationError: "This account needs you to sign in again.",
};

/** What `providerErrorSentence` returns: a sentence that never names the raw
 * token, plus the token itself when it wasn't one we recognised. */
export interface ProviderErrorSentence {
  /** Always a plain sentence — never a raw token. */
  text: string;
  /** The raw token, present ONLY when it was not a recognised one. Render it
   * as secondary detail, never inside the sentence itself. */
  detail?: string;
}

/**
 * The sentence for a raw provider/error TOKEN — a bare value like
 * `LOGIN_REQUIRED` or `ProxyError`, not a sentence. Use `humanFailureSentence`
 * instead when the value in hand is already a sentence that might have a
 * class name embedded in it.
 */
export function providerErrorSentence(
  token: string | null | undefined,
): ProviderErrorSentence {
  const value = (token ?? "").trim();
  if (!value) return { text: "It refused without saying why." };
  const known = KNOWN_PROVIDER_ERROR_TOKENS[value];
  if (known) return { text: known };
  // An unrecognised value that is not a token at all but a driver's render —
  // SQL, bound arguments, a stack trace. Calling that "a provider error" would
  // blame the provider for our own database, so it says what it was: ours.
  // (See MACHINE TEXT IS NEVER THE SENTENCE, below.)
  if (namesMachineText(value)) {
    return { text: SYSTEM_ERROR_SENTENCE, detail: value };
  }
  return { text: "It failed because of a provider error.", detail: value };
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

/**
 * 🚨 MACHINE TEXT IS NEVER THE SENTENCE — AND SQL LEAST OF ALL.
 *
 * ## The defect this closes (fourteenth cold walk, 2026-09-20)
 *
 * `/acquisition` printed this inside a block row, as the person-facing account
 * of what happened to a first-time Expert's file:
 *
 *   Matrx ORM | QueryTimeoutError … Query: INSERT INTO
 *   docproc.processed_documents (id, organization_id, owner_id, …) VALUES
 *   ($1, $2, $… Args: ('03e3dab7-…', '5dc930e9-…', '87a6e699-…', 'cld_file', …)
 *
 * A database schema, a statement, and its bound argument values — which, read
 * out of the live row afterwards, turned out to include the OCR'd text of the
 * customer's own document. On a screen otherwise written in careful English.
 *
 * The server half is fixed at the Block Ledger's write seam
 * (`matrx_utils.person_sentence`, aidream `bd369c21c7`), so no new row can
 * carry driver text, and the six rows that already did were repaired.
 *
 * This is the CLIENT half, and it is not redundant with that — for the same
 * reason the top of this file gives for the exception-class rule. A screen that
 * renders whatever sentence arrives is one bad `except` away from printing SQL
 * again, in this lane or in any of the dozen others that show a server failure
 * sentence, and it is looking at rows written by every version of the server
 * there has ever been. So the rule lives here too, on the render path, where it
 * is structural rather than remembered.
 *
 * Same two-part shape as `providerErrorSentence`: the sentence never contains
 * the machine text, and the raw value rides as SECONDARY detail (muted, admin
 * only), never folded into the sentence itself.
 */

/** What we say when the whole sentence was machine text. It is a FACT about
 * WHERE the failure was — ours, not theirs — never a guess at a cause. */
export const SYSTEM_ERROR_SENTENCE =
  "This stopped because of a system error on our side.";

/**
 * The shapes only a machine writes. Deliberately narrow and structural: prose
 * that happens to contain "select" or "update" is left alone, because
 * over-cleaning a codec's careful refusal is the same lie in the other
 * direction. Mirrors `matrx_utils/person_sentence.py`'s `_MACHINE_SHAPES`.
 */
const MACHINE_SHAPES: readonly RegExp[] = [
  // A SQL statement.
  /\b(?:INSERT\s+INTO|UPDATE\s+[\w."]+\s+SET\b|DELETE\s+FROM|SELECT\s[\s\S]{0,200}?\sFROM\s|CREATE\s+(?:TABLE|INDEX)|ALTER\s+TABLE)\b/i,
  // Postgres bind placeholders as a driver renders them: "VALUES ($1, $2".
  /\$\d+\s*,\s*\$\d+/,
  // A payload marker the ORM inlines: "Query: …", "Args: (…)".
  /\b(?:Args|Arguments|Params|Parameters|Query|SQL|Statement)\s*:\s/,
  // A Python traceback, in either shape that has reached a field.
  /Traceback \(most recent call last\)|File "[^"]+", line \d+/,
  // A call written in code: `l.update_where(..., lock_rows_in_pk_order=True)`.
  // Needs a dotted receiver AND a keyword or ellipsis argument, so "Sign in
  // (again)" and "see step 2 (below)" do not match.
  /\b[A-Za-z_][\w.]*\.[A-Za-z_]\w*\(\s*(?:\.\.\.|\w+\s*=)/,
  // An ORM or driver banner title.
  /Matrx ORM\s*\||\[ERROR in [^\]]*\]/,
];

/**
 * Does this string carry SQL, bound parameters, a stack trace, an ORM banner
 * or a code call? Exported so a guard can assert it over real rows.
 */
export function namesMachineText(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  if (BARE_CLASS.test(value)) return true;
  return MACHINE_SHAPES.some((shape) => shape.test(value));
}

/**
 * The sentence for a server-written failure SENTENCE (as opposed to
 * `providerErrorSentence`, which takes a bare token).
 *
 * A sentence written for a person comes back word for word. One carrying
 * machine text comes back as {@link SYSTEM_ERROR_SENTENCE} with a remedy, and
 * the raw value in `detail` — for the muted, admin-only line beneath the
 * sentence, never inside it.
 */
export function personFacingSentence(
  raw: string | null | undefined,
  { remedy = DEFAULT_FAILURE_REMEDY }: { remedy?: string } = {},
): ProviderErrorSentence {
  const value = (raw ?? "").trim();
  if (!value) return { text: "It refused without saying why." };
  if (!namesMachineText(value)) return { text: value };
  return {
    text: remedy ? `${SYSTEM_ERROR_SENTENCE} ${remedy}` : SYSTEM_ERROR_SENTENCE,
    detail: value,
  };
}
