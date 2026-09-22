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

/**
 * 🚨 A MACHINE TOKEN STANDING INSIDE OTHERWISE GOOD ENGLISH — cold walk 20,
 * defect B (2026-09-22, production v0.4.2135 AND v0.4.2139).
 *
 * Ten rows of `/acquisition`'s WHAT HAPPENED column read, verbatim:
 *
 *   YouTube would not answer what captions this video has — it asked the
 *   server to prove it is not a robot (LOGIN_REQUIRED). YouTube said: "Sign in
 *   to confirm you're not a bot". … YouTube could not be reached to ask what
 *   captions this video has (ProxyError), so nothing is known about them yet.
 *
 * `LOGIN_REQUIRED` is YouTube's own `playabilityStatus.status` enum and
 * `ProxyError` is `type(exc).__name__`, both interpolated straight into the
 * sentence by `aidream/services/media_catalog/adapters/youtube_adapter.py`.
 * Everything around them is excellent: the prose names the provider's own
 * words, refuses to claim the video has no captions, and the adjacent column
 * says exactly what to do. The tokens add nothing a person can use.
 *
 * Why nothing caught it: `BARE_CLASS` is anchored `^…$`, so it only sees a
 * class name that IS the whole string, and no `MACHINE_SHAPES` entry matches
 * an identifier sitting in parentheses mid-prose. `PARENTHESISED_CLASS` does
 * strip `(ProxyError)` — but only in `humanFailureSentence`/`personSentence`,
 * which this path never calls — and it would still miss `(LOGIN_REQUIRED)`,
 * which carries no `Error` suffix.
 *
 * So the rule is: LIFT, don't nuke. A sentence whose only fault is a
 * parenthesised identifier keeps every word the server wrote; the identifier
 * moves to the muted detail line. Replacing it with a generic system-error
 * sentence would throw away four clauses of genuinely good writing to remove
 * one word.
 */
const PARENTHESISED_MACHINE_TOKEN = new RegExp(
  "\\s*\\(" +
    "(?:" +
    // A SCREAMING_SNAKE provider constant. The underscore is what makes this
    // safe: an English parenthetical is never `LOGIN_REQUIRED`, and `(HOA)`,
    // `(USA)`, `(PDF)` carry no underscore and are left alone.
    "[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+" +
    "|" +
    // An exception / failure class, dotted or not, by its suffix. Same
    // anchoring principle as PARENTHESISED_CLASS: prose that merely says
    // "error" is a real reason and is never touched.
    "(?:[A-Za-z_][A-Za-z0-9_]*\\.)*[A-Za-z_][A-Za-z0-9_]*" +
    "(?:Error|Exception|Failure|Timeout|Refused|Denied)" +
    ")" +
    "\\)",
  "g",
);

/** A sentence with its embedded machine tokens taken out, and what they were. */
export interface LiftedSentence {
  /** The prose, word for word, minus the parenthesised identifiers. */
  text: string;
  /** The tokens that were lifted out, in the order they stood. */
  tokens: string[];
}

/**
 * Take every parenthesised machine identifier out of a sentence and hand it
 * back separately. Exported so a guard can assert it over the real stored rows
 * and so the aidream repair script's expectations can be read against it.
 */
export function liftEmbeddedMachineTokens(
  raw: string | null | undefined,
): LiftedSentence {
  const value = (raw ?? "").trim();
  if (!value) return { text: "", tokens: [] };
  const tokens =
    value
      .match(new RegExp(PARENTHESISED_MACHINE_TOKEN.source, "g"))
      ?.map((match) => match.trim().replace(/^\(|\)$/g, "")) ?? [];
  if (tokens.length === 0) return { text: value, tokens: [] };
  const text = value
    .replace(new RegExp(PARENTHESISED_MACHINE_TOKEN.source, "g"), "")
    // The regex eats the space BEFORE the parenthesis, so "robot (X)." closes
    // as "robot." and "has (X), so" as "has, so" with nothing to tidy. This
    // only catches a sentence that had a space on both sides.
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, tokens };
}

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
  // 🚨 WALK 19, DEFECT C — a machine identifier with a value bolted to it.
  // `/acquisition` printed "cloud_sync read returned empty for
  // cld_file_id=3c38fee2-…" in the column where every other row speaks
  // English. It is sentence-SHAPED machine text: no SQL, no placeholders, no
  // banner, so every shape above answered "no" and the cell rendered it. Two
  // underscore-joined segments minimum AND a value must follow, so "x = 1" and
  // ordinary prose cannot match.
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\s*=\s*\S/,
  // A raw row identifier standing in a sentence. A person has no use for a
  // uuid; when one is present the string is a developer's note.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
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
  if (!namesMachineText(value)) {
    // WALK 20 DEFECT B — the sentence is good English carrying a parenthesised
    // identifier. Lift the identifier into the detail and keep every word.
    const lifted = liftEmbeddedMachineTokens(value);
    if (lifted.tokens.length > 0 && lifted.text) {
      return { text: lifted.text, detail: value };
    }
    return { text: value };
  }
  return {
    text: remedy ? `${SYSTEM_ERROR_SENTENCE} ${remedy}` : SYSTEM_ERROR_SENTENCE,
    detail: value,
  };
}

// =============================================================================
// 🚨 A RETRY THE SERVER ALREADY REFUSED IS NEVER OFFERED
// =============================================================================
//
// ## The defect this closes (fifteenth cold walk, 2026-09-20, blocking C)
//
// One missing import took down five surfaces at once, and the SERVER wrote the
// best sentence in the product about it:
//
//   This part of the server was built wrong and cannot run: it is missing
//   'origin_override_for' from aidream.services.conversation_context.scope.
//   That is our defect, not anything you did, and trying again will fail the
//   same way until it is fixed. It was recorded as 4f3c…<32 hex> so it can be
//   traced. Nothing you sent was changed or lost.
//
// Then the screens threw that honesty away. The Understudy box said *"Try
// again, or reload the page; it costs nothing and takes a second."* and the
// Your-words panel said *"try again"* — two screens telling the Expert to do
// the one thing the server had just finished saying cannot work, each with a
// live **Try again** button under it. The run box was the single surface that
// repeated the server's warning, and it only got there because someone wrote
// that sentence by hand in `run-failure-explanation.ts`.
//
// A per-surface habit is not a rule. So the rule lives once, here, beside the
// other two halves of "how a failing run talks":
//
//   * `serverRefusal` reads the ENVELOPE, not just its prose. `error:
//     "build_defect"` — the aidream code for "the code that shipped does not
//     fit the packages that shipped with it" (`aidream/api/errors.py`
//     `_build_defect_user_message`) — means retrying is futile as a matter of
//     fact, not of phrasing. The prose test is a second net for envelopes that
//     never reach the client intact.
//   * when retrying is pointless the surface renders THE SERVER'S OWN REMEDY
//     and must not offer a retry control (`retryIsPointless` is what a caller
//     branches on). A control that cannot work is the fourth law's dead end
//     wearing a button.
//   * the sentence carries NO module path and NO trace id. The bench printed
//     `aidream.services.conversation_context.scope` and a 32-hex id straight
//     at the Expert. A dotted server path is the same class as the exception
//     class name the top of this file kills; the trace id is real and useful,
//     so it comes back separately as `traceId` for a MUTED detail line, never
//     inside the sentence.

/** `X.y.z` — a server module path, as a Python import error renders one. */
const DOTTED_MODULE_PATH =
  /(?<![/\w.])[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){2,}(?![\w.])/g;

/** The whole "it is missing 'sym' from a.b.c" clause a build defect writes. */
const MISSING_SYMBOL_CLAUSE =
  /it is missing\s+['"«][^'"»]+['"»]\s+from\s+[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+/gi;

/** A 32-hex request/trace id, alone or inside the clause that introduces it. */
const TRACE_ID = /\b[0-9a-f]{32}\b/gi;
const RECORDED_CLAUSE =
  /\s*It (?:was recorded as\s+[0-9a-f-]{8,}|has been recorded)[^.]*\.\s*/gi;

/**
 * Envelope codes aidream uses for "this cannot work until we fix it".
 * `build_defect` is written by `aidream/api/errors.py`; the others are the
 * refusal codes that are equally deterministic.
 */
const RETRY_IS_POINTLESS_CODES: ReadonlySet<string> = new Set([
  "build_defect",
  "definition_invalid",
]);

/**
 * What a server sentence says when retrying it cannot possibly help. Kept
 * narrow and quoted from the sentences aidream actually writes — a vague
 * "something went wrong" is NOT in here, because claiming a retry is futile
 * when it might work is the same lie in the other direction.
 */
const RETRY_IS_POINTLESS_PROSE: readonly RegExp[] = [
  /\bfail the same way\b/i,
  /\bwill fail again\b/i,
  /\bstop at the same place\b/i,
  /\bwas built wrong and cannot run\b/i,
  /\buntil it is fixed\b/i,
];

/** What a surface renders for one server refusal. */
export interface ServerRefusal {
  /**
   * The sentence to show. Never a module path, never a trace id, never an
   * exception class name, never SQL.
   */
  text: string;
  /**
   * The server said retrying cannot work. A surface that reads `true` shows
   * {@link ServerRefusal.text} as-is and REMOVES its retry control — it never
   * appends a remedy of its own on top of the server's.
   */
  retryIsPointless: boolean;
  /**
   * The trace id the server recorded this under, when it gave one. For a
   * muted secondary line ("Recorded as …"), never inside the sentence.
   */
  traceId?: string;
  /**
   * The raw server text, when it was not fit to show. Admin-only detail.
   */
  detail?: string;
}

/** The envelope shape aidream returns and `callApi` preserves as `serverDetail`. */
interface ServerErrorEnvelope {
  error?: unknown;
  message?: unknown;
  user_message?: unknown;
  request_id?: unknown;
}

/**
 * Pull the envelope out of whatever a caller is holding: the envelope itself,
 * a `callApi` `ApiCallError` (whose `serverDetail` is the envelope), or an
 * `Error` thrown by `operationFailed` (whose `cause` is one of those).
 */
function readEnvelope(raw: unknown, depth = 0): {
  code: string | null;
  sentence: string;
  requestId: string | null;
} {
  if (depth > 4 || raw === null || raw === undefined) {
    return { code: null, sentence: "", requestId: null };
  }
  if (typeof raw === "string") {
    return { code: null, sentence: raw.trim(), requestId: null };
  }
  if (typeof raw !== "object") {
    return { code: null, sentence: "", requestId: null };
  }

  const holder = raw as Record<string, unknown> & ServerErrorEnvelope;
  const nested =
    holder.serverDetail !== undefined
      ? readEnvelope(holder.serverDetail, depth + 1)
      : holder.cause !== undefined
        ? readEnvelope(holder.cause, depth + 1)
        : null;

  const code =
    typeof holder.error === "string" && holder.error.trim()
      ? holder.error.trim()
      : (nested?.code ?? null);
  const requestId =
    typeof holder.request_id === "string" && holder.request_id.trim()
      ? holder.request_id.trim()
      : (nested?.requestId ?? null);

  // A nested envelope's own `user_message` beats the wrapper's generic
  // sentence: `operationFailed` writes "We couldn't refresh the Understudy."
  // over the top of the server's account of WHY.
  const own =
    typeof holder.user_message === "string" && holder.user_message.trim()
      ? holder.user_message.trim()
      : "";
  const wrapper =
    typeof holder.message === "string" && holder.message.trim()
      ? holder.message.trim()
      : "";
  const sentence = own || nested?.sentence || wrapper;

  return { code, sentence, requestId };
}

/**
 * Does this server envelope or sentence say that retrying cannot work?
 * Exported so a guard can assert it over the real aidream envelope.
 */
export function retryIsPointless(raw: unknown): boolean {
  const { code, sentence } = readEnvelope(raw);
  if (code && RETRY_IS_POINTLESS_CODES.has(code)) return true;
  return RETRY_IS_POINTLESS_PROSE.some((shape) => shape.test(sentence));
}

/**
 * The census predicate for the bench's defect: a dotted server module path in
 * a sentence a person reads. Exported so a guard can assert it over the copy
 * every Masterwork surface renders.
 */
export function namesAModulePath(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  DOTTED_MODULE_PATH.lastIndex = 0;
  const found = DOTTED_MODULE_PATH.test(value);
  DOTTED_MODULE_PATH.lastIndex = 0;
  return found;
}

/** The census predicate for a 32-hex trace id in prose. */
export function namesATraceId(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  TRACE_ID.lastIndex = 0;
  const found = TRACE_ID.test(value);
  TRACE_ID.lastIndex = 0;
  return found;
}

/** Lift the trace id out of a sentence, returning the sentence without it. */
function liftTraceId(sentence: string): { text: string; traceId?: string } {
  TRACE_ID.lastIndex = 0;
  const match = TRACE_ID.exec(sentence);
  TRACE_ID.lastIndex = 0;
  const traceId = match?.[0];
  const text = sentence
    .replace(RECORDED_CLAUSE, " ")
    .replace(TRACE_ID, "")
    .replace(/\s+/g, " ")
    .trim();
  return traceId ? { text, traceId } : { text };
}

/**
 * THE ONE READING of a server refusal, for every surface that shows one.
 *
 * `raw` is whatever the surface is holding — the aidream envelope, a
 * `callApi` error, an `Error` from `operationFailed`, or a bare sentence.
 *
 * `remedy` is the surface's own way out, and — exactly as in
 * `humanFailureSentence` — it is attached ONLY where there is nothing else: a
 * server sentence that explained itself is never edited. When the server said
 * retrying is futile, `retryIsPointless` comes back true and the SURFACE must
 * take its retry control away; bolting "try again" onto the server's own
 * refusal, in prose or as a button, is precisely the contradiction this closes.
 */
export function serverRefusal(
  raw: unknown,
  {
    remedy = DEFAULT_FAILURE_REMEDY,
    noReason = "The server did not say why.",
  }: { remedy?: string; noReason?: string } = {},
): ServerRefusal {
  const { code, sentence, requestId } = readEnvelope(raw);
  const pointless =
    (code !== null && RETRY_IS_POINTLESS_CODES.has(code)) ||
    RETRY_IS_POINTLESS_PROSE.some((shape) => shape.test(sentence));

  if (!sentence) {
    return {
      text: pointless ? noReason : `${noReason} ${remedy}`.trim(),
      retryIsPointless: pointless,
      ...(requestId ? { traceId: requestId } : {}),
    };
  }

  // MACHINE TEXT NEVER SURVIVES. SQL, a stack, an ORM banner — the sentence
  // becomes our own and the raw value rides as admin-only detail.
  if (namesMachineText(sentence)) {
    const lifted = liftTraceId(sentence);
    return {
      text: pointless
        ? SYSTEM_ERROR_SENTENCE
        : `${SYSTEM_ERROR_SENTENCE} ${remedy}`.trim(),
      retryIsPointless: pointless,
      traceId: lifted.traceId ?? requestId ?? undefined,
      detail: sentence,
    };
  }

  // The server's own words, minus the two things that are ours and not the
  // Expert's: the module path and the trace id.
  const withoutSymbol = sentence.replace(
    MISSING_SYMBOL_CLAUSE,
    "a piece of it is missing",
  );
  const withoutPath = withoutSymbol.replace(DOTTED_MODULE_PATH, "").trim();
  const lifted = liftTraceId(withoutPath);
  const cleaned = lifted.text
    .replace(/\bfrom\s*([.,;:]|$)/g, "$1")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  // THE EXCEPTION-CLASS RULE STILL APPLIES. A refusal is a failure sentence
  // like any other, so it goes through the same reading the rest of this file
  // owns rather than growing a second, drifting copy of it. When the server
  // said retrying is futile its own remedy stands alone — the empty `remedy`
  // is how that is said to `humanFailureSentence`.
  const human = humanFailureSentence(cleaned || sentence, {
    remedy: pointless ? "" : remedy,
    noReason,
  });

  const changed = human.text !== sentence;
  return {
    text: human.text,
    retryIsPointless: pointless,
    traceId: lifted.traceId ?? requestId ?? undefined,
    ...(changed ? { detail: sentence } : {}),
  };
}

// =============================================================================
// 🚨 A SETTING'S IDENTIFIER IS NEVER PROSE
// =============================================================================
//
// ## The defect this closes (sixteenth cold walk, 2026-09-21, defect D)
//
// `Run the Bench` — the one screen in the product where a person decides to
// spend real money — printed this to a residential HVAC contractor:
//
//   Budget multiple
//   100x arm C's measured cost — the Bench's own declared default. There is no
//   `masterwork.bench.a2_budget_multiple` knob row yet, so no admin can turn
//   this number; seeding it is a migration.
//
// A knob key, an admin capability statement and a database instruction, in one
// sentence, on a non-technical Expert's screen.
//
// The SERVER half is fixed at the sentence's source (aidream's bench service
// now writes plain English). This is the CLIENT half, and it is not redundant
// with that for exactly the reason the top of this file gives for exception
// class names and SQL: a screen that renders whatever sentence arrives is one
// bad copy edit away from printing a knob key again — in this lane or in any
// of the dozens that show a server-written sentence, across every version of
// the server that has ever run. So the rule lives on the render path too,
// where it is structural rather than remembered.
//
// Deliberately narrow and structural, same as `MACHINE_SHAPES`: the shapes
// only a settings registry writes. Prose that happens to contain a period, a
// hostname (`server.app.matrxserver.com`), or an abbreviation (`e.g.`) is left
// exactly as the server wrote it, because over-cleaning a careful sentence is
// the same lie in the other direction.

/**
 * A dotted setting/knob key: two or more all-lowercase segments with at least
 * one underscore somewhere in the token (`masterwork.bench.a2_budget_multiple`,
 * `education.spoken_practice`). The underscore is what separates a key from a
 * hostname or a sentence's punctuation.
 */
const DOTTED_SETTING_KEY =
  /`?\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\b`?(?=[\s.,;:)\]]|$)/g;

/**
 * A bare key: three or more underscore-joined lowercase segments
 * (`a2_budget_multiple`). Two segments are not enough — that shape occurs in
 * ordinary technical English and the cost of a false positive is a mangled
 * sentence.
 */
const BARE_SETTING_KEY = /`?\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b`?/g;

function hasUnderscore(token: string): boolean {
  return token.includes("_");
}

/**
 * Does this sentence carry a setting/knob identifier? Exported so a guard can
 * assert it over the sentences this product actually renders.
 */
export function namesASettingKey(text: string | null | undefined): boolean {
  const value = (text ?? "").trim();
  if (!value) return false;
  DOTTED_SETTING_KEY.lastIndex = 0;
  const dotted = (value.match(DOTTED_SETTING_KEY) ?? []).some(hasUnderscore);
  DOTTED_SETTING_KEY.lastIndex = 0;
  BARE_SETTING_KEY.lastIndex = 0;
  const bare = BARE_SETTING_KEY.test(value);
  BARE_SETTING_KEY.lastIndex = 0;
  return dotted || bare;
}

/** What `personSentence` returns. */
export interface PersonSentence {
  /** Safe to render: no SQL, no stack, no exception class, no setting key. */
  text: string;
  /**
   * True when something had to be removed. The surface may show `detail` as a
   * muted, admin-only line — it is never folded back into the sentence.
   */
  cleaned: boolean;
  /** The raw sentence, present only when it was cleaned. */
  detail?: string;
}

/**
 * THE ONE READING for a server-written sentence a person will read that is NOT
 * a failure — a form's explanation, a note beside a control, a description of
 * what a run will do. (`humanFailureSentence` owns the failure half; it adds a
 * remedy, which is wrong on a sentence that is not reporting a failure.)
 *
 * Applies the same two rules the failure path applies, in the same order:
 * machine text is never the sentence, and an identifier is never prose.
 */
export function personSentence(
  raw: string | null | undefined,
): PersonSentence {
  const original = (raw ?? "").trim();
  if (!original) return { text: "", cleaned: false };

  // A sentence that IS machine text is replaced whole — the same answer
  // `providerErrorSentence` gives, for the same reason.
  if (namesMachineText(original)) {
    return { text: SYSTEM_ERROR_SENTENCE, cleaned: true, detail: original };
  }

  PARENTHESISED_CLASS.lastIndex = 0;
  let text = original.replace(PARENTHESISED_CLASS, "");
  DOTTED_SETTING_KEY.lastIndex = 0;
  text = text.replace(DOTTED_SETTING_KEY, (token) =>
    hasUnderscore(token) ? "this setting" : token,
  );
  BARE_SETTING_KEY.lastIndex = 0;
  text = text.replace(BARE_SETTING_KEY, "this setting");

  text = text
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  const cleaned = text !== original;
  return cleaned ? { text, cleaned, detail: original } : { text, cleaned };
}

// =============================================================================
// 🚨 AND A FIELD NAME IS NEVER PROSE EITHER (walk 18, defect D)
// =============================================================================
//
// The eighteenth cold walk's finished deliverable — 12,642 characters of
// otherwise flawless English, the document an Expert hands a customer or a new
// hire — contained exactly one machine token:
//
//   Editor's `violations_not_fixed: []` — OVERRULED as premature.
//
// Same class as the knob key above, one seam further out: a key out of a
// schema WE declared and handed the model (`aidream/services/masterworks/
// build.py`, the Editor's output shape), quoted back by the model — which is
// correct behaviour for an agent citing what it was given — and printed raw
// because nothing on the reading side turned it into words.
//
// `personSentence` answers a knob key with "this setting", which is right for
// a sentence ABOUT a setting and wrong for a field name being quoted inside
// somebody's ruling. So the SHAPE is shared from here (one definition of what
// an identifier looks like, never a second regex) and the WORDS are the
// caller's: `features/masterwork/ruleCitations.ts` renders them in prose.

/**
 * Is this token a machine identifier — an underscore-joined lowercase key, as
 * a schema field or a settings row writes one?
 *
 * `minSegments` is the caller's call, and the difference is about DELIMITERS,
 * not about taste. Running loose in prose the floor is 3 (the
 * {@link personSentence} rule: `word_count` shapes occur in ordinary technical
 * English and a false positive mangles a real sentence). Inside a delimiter a
 * person can see — a whole inline-code span, a JSON key — 2 is safe, because
 * the delimiter already said "this is a machine thing".
 */
export function isMachineIdentifier(
  token: string | null | undefined,
  { minSegments = 3 }: { minSegments?: number } = {},
): boolean {
  const value = (token ?? "").trim();
  if (value === "") return false;
  const segments = `(?:_[a-z0-9]+){${minSegments - 1},}`;
  return new RegExp(`^[a-z][a-z0-9]*${segments}$`).test(value);
}

/**
 * The words a machine identifier was always standing for:
 * `violations_not_fixed` → `violations not fixed`.
 *
 * A resolution, never an invention — the underscores become spaces and
 * nothing else changes, so no reader is told something the token did not say.
 */
export function machineIdentifierWords(token: string): string {
  return token.replace(/_/g, " ");
}
