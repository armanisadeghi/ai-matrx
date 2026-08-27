/**
 * features/hr/exports/errors.ts — one normalizer, one classifier, no guessing.
 *
 * Two transports can reject an export call and they reject differently: the live client throws a
 * `BackendApiError` already parsed through `lib/api/errors.ts`'s `parseHttpErrorBody` (HR's §1.3
 * envelope matches its FIRST branch — `{error, message, user_message, details, request_id}` —
 * so nothing new is needed), while the mock transport throws a plain Error carrying the raw
 * fixture body and its declared status. Both are normalized here, into the same shape, so a
 * surface never learns which lane it is on.
 *
 * 🚨 THE CLASSIFIER REFUSES TO GUESS. §4.4 names exactly four preconditions, each with its own
 * door, and two of them share a status AND a code (`409 hr_state_conflict`) — they are told apart
 * ONLY by which key `details` carries. Anything that does not match a named shape classifies as
 * `unknown` and is shown with the server's own `user_message`. Dressing an unrecognised failure up
 * as one of the four would send a payroll administrator to fix the wrong thing.
 */

import { BackendApiError, parseHttpErrorBody } from "@/lib/api/errors";
import type { ExportPrecondition, HrErrorBody } from "./types";

/** A failed export call, from either transport, in one shape. */
export interface ExportFailure {
  /** The §1.3 machine code, e.g. `hr_state_conflict`. */
  code: string;
  /** 🚨 The server's own sentence. Never substitute a generic one. */
  userMessage: string;
  /** For the log. */
  detail: string;
  /**
   * 🚨 THE SENTENCE THE ENGINE ACTUALLY WROTE — the half that was being thrown away (V2).
   *
   * `aidream/api/routers/hr_exports.py::_sql_error` maps a raise from the SQL surface onto the
   * §1.3 envelope like this:
   *
   *     validation_error(text, user_message="That request wasn't valid.", details={})
   *     state_conflict(text,   user_message="That isn't possible in this state.", details={})
   *
   * `text` is the FULL Postgres error — our own machine code, the engine's precise sentence, and
   * its HINT. `user_message` is a placeholder. The client rendered only `user_message`, so on the
   * most consequential write in the domain the operator was told "That request wasn't valid." while
   * the server was saying *"an export must name its actor; this call has neither an authenticated
   * user nor an employment in organization …"* with a hint naming the fix.
   *
   * The same discard silences this lane's own finality refusal, which names every pending
   * workweek id and explains why an unfinalised week cannot be exported.
   *
   * So the engine's text is parsed out and carried as DATA. It is never rewritten, never
   * summarised, and never substituted for — the surface shows the server's words.
   */
  engineMessage: string | null;
  /** The `HINT:` the engine attached, when it attached one. Verbatim. */
  hint: string | null;
  details: Record<string, unknown>;
  status: number | null;
  requestId: string;
  /** True when `details.retryable` is set — the queue/worker outage case (§1.3). */
  retryable: boolean;
}

/**
 * Pull the engine's own sentence and hint out of a raw Postgres error string.
 *
 * Shape, as `_sql_error` forwards it:
 *   `hr_state_conflict: 1 workweek(s) … are not final yet (…)\nHINT:  Finalise every workweek …`
 *
 * 🚨 CONSERVATIVE ON PURPOSE. Anything that does not look like our own `code: sentence` form is
 * left alone and returned as-is rather than sliced — a parser that guesses would eventually strip
 * the one clause that mattered. And the code prefix is dropped from the SENTENCE only because it is
 * carried separately as `code`; nothing else is removed.
 */
function splitEngineText(raw: string): {
  engineMessage: string | null;
  hint: string | null;
} {
  if (!raw.trim()) return { engineMessage: null, hint: null };

  let hint: string | null = null;
  let body = raw;
  const hintAt = raw.search(/\bHINT:\s*/i);
  if (hintAt >= 0) {
    body = raw.slice(0, hintAt);
    hint =
      raw
        .slice(hintAt)
        .replace(/^\s*HINT:\s*/i, "")
        .trim() || null;
  }

  // `hr_something: the sentence` → keep the sentence; the code travels in its own field.
  const coded = body.match(/^\s*(hr_[a-z0-9_]+|[A-Z0-9]{5}):\s*([\s\S]+)$/);
  const sentence = (coded ? coded[2] : body).trim();

  return { engineMessage: sentence || null, hint };
}

interface HrMockError extends Error {
  isHrMock: true;
  status: number;
  body: unknown;
}

function isHrMockError(err: unknown): err is HrMockError {
  return (
    err instanceof Error && (err as Partial<HrMockError>).isHrMock === true
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** Normalize anything an export call can reject with. */
export function toExportFailure(err: unknown): ExportFailure {
  if (isHrMockError(err)) {
    // Run the fixture body through the SAME parser the live path uses, so the mock lane can
    // never be kinder (or harsher) than production about the identical envelope.
    return toExportFailure(
      parseHttpErrorBody(
        asRecord(err.body) as HrErrorBody & object,
        err.status,
      ),
    );
  }

  if (err instanceof BackendApiError) {
    const details = asRecord(err.details);
    const parsed = splitEngineText(err.detail);
    return {
      code: err.code,
      userMessage: err.userMessage,
      detail: err.detail,
      // Only surface the engine's text when it actually SAYS something the headline does not.
      // Where the router set a real `user_message` the two are the same sentence, and repeating
      // it under itself is noise that trains people to stop reading the box.
      engineMessage: addsInformation(parsed.engineMessage, err.userMessage)
        ? parsed.engineMessage
        : null,
      hint: parsed.hint,
      details,
      status: err.status,
      requestId: err.requestId,
      retryable: details.retryable === true,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  const parsed = splitEngineText(message);
  return {
    code: "unknown_error",
    userMessage: message,
    detail: message,
    engineMessage: addsInformation(parsed.engineMessage, message)
      ? parsed.engineMessage
      : null,
    hint: parsed.hint,
    details: {},
    status: null,
    requestId: "",
    retryable: false,
  };
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The PLACEHOLDER sentences the router writes when it is forwarding someone else's raise.
 *
 * 🚨 THIS LIST IS THE WHOLE POINT, AND IT IS NOT A GUESS. Each string is copied from the live
 * source: `aidream/api/routers/hr_exports.py::_sql_error` lines 94/96, and the shared `not_found`
 * helper (observed on the wire, 2026-08-27). These are the cases where the router has NOT written a
 * human sentence — it has stamped a filler over the engine's real one.
 *
 * Everywhere else the router's `user_message` is genuinely written for the operator ("This pay
 * period has not been approved yet.", "That export hasn't produced a file yet.") and it MUST keep
 * the headline. An earlier cut of this file compared the two strings for equality instead, which
 * let a technical restatement full of raw UUIDs — *"pay period 49f4c46c-… is open, not approved"* —
 * shove aside a perfectly good human sentence. Fixing a discard by degrading the good cases is not
 * a fix.
 */
const ROUTER_PLACEHOLDERS: ReadonlySet<string> = new Set(
  [
    "That request wasn't valid.",
    "That isn't possible in this state.",
    "We couldn't find that.",
  ].map(norm),
);

/** True when the router stamped a filler over the engine's sentence. */
function isPlaceholder(userMessage: string): boolean {
  return ROUTER_PLACEHOLDERS.has(norm(userMessage));
}

/** True when the engine's sentence is not just the headline again. */
function addsInformation(
  engineMessage: string | null,
  userMessage: string,
): boolean {
  if (!engineMessage) return false;
  return norm(engineMessage) !== norm(userMessage);
}

/**
 * The ONE sentence to lead with — for a toast, which has room for exactly one.
 *
 * 🚨 THE ENGINE'S SENTENCE WINS. Where the router forwarded a real raise under a placeholder
 * `user_message` ("That request wasn't valid.", "That isn't possible in this state."), the toast
 * is the FIRST thing an operator reads and was showing the placeholder — so the precise reason
 * arrived only if they then looked at the alert underneath. Leading with the engine's own words
 * costs nothing when there are none: it falls straight back to `userMessage`.
 *
 * Still never invented, never rewritten — this only chooses which of the server's own two
 * sentences is the more useful one to show first.
 */
export function failureHeadline(failure: ExportFailure): string {
  // Only when the router stamped a filler does the engine's sentence take the lead. A real
  // `user_message` is written FOR the operator and outranks a technical restatement.
  if (failure.engineMessage && isPlaceholder(failure.userMessage)) {
    return failure.engineMessage;
  }
  return failure.userMessage;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * Classify a normalized failure into one of §4.4's four named preconditions.
 *
 * | Condition | Response |
 * |---|---|
 * | Pay period not `approved` or later | `409 hr_state_conflict`, `details.state` |
 * | A workweek is still `is_final=false` | `409 hr_state_conflict`, `details.pending_workweek_ids` |
 * | A contributing rule is advisory on money | `422 hr_advisory_rule_blocks_money` |
 * | An employment has an unmapped external id | `400 hr_validation_error`, `details.unmapped[]` |
 *
 * The pending-workweeks branch is tested FIRST because it is the more specific of the two
 * `hr_state_conflict` shapes: a body carrying both keys is about the workweeks.
 */
export function classifyPrecondition(
  failure: ExportFailure,
): ExportPrecondition {
  const { code, details } = failure;

  if (code === "hr_state_conflict") {
    const pendingWorkweekIds = stringArray(details.pending_workweek_ids);
    if (pendingWorkweekIds.length > 0) {
      return { kind: "pending_workweeks", pendingWorkweekIds };
    }
    if (typeof details.state === "string") {
      return { kind: "period_not_approved", state: details.state };
    }
    return { kind: "unknown" };
  }

  if (code === "hr_advisory_rule_blocks_money") {
    return {
      kind: "advisory_rule_blocks_money",
      ruleClass: stringOrNull(details.class),
      ruleId: stringOrNull(details.rule_id),
      jurisdictionKey: stringOrNull(details.jurisdiction_key),
      affectedEmploymentIds: stringArray(details.affected_employment_ids),
    };
  }

  if (code === "hr_validation_error") {
    const raw = Array.isArray(details.unmapped) ? details.unmapped : [];
    const unmapped = raw
      .map((entry) => asRecord(entry))
      .filter(
        (entry) =>
          typeof entry.employment_id === "string" &&
          typeof entry.field === "string",
      )
      .map((entry) => ({
        employment_id: entry.employment_id as string,
        field: entry.field as string,
      }));
    if (unmapped.length > 0) return { kind: "unmapped_identifiers", unmapped };
    return { kind: "unknown" };
  }

  return { kind: "unknown" };
}

/**
 * 🚨 The one refusal the SURFACE must anticipate rather than discover. §4.5: an `acknowledged`
 * export can never be superseded. If this code ever reaches a user it means a supersede control
 * was offered on an acknowledged row — the button should have been unavailable, with the reason
 * stated in words, before the click.
 */
export function isAlreadyAcknowledged(failure: ExportFailure): boolean {
  return failure.code === "hr_export_already_acknowledged";
}
