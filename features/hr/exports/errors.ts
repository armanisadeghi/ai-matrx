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
  details: Record<string, unknown>;
  status: number | null;
  requestId: string;
  /** True when `details.retryable` is set — the queue/worker outage case (§1.3). */
  retryable: boolean;
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
      parseHttpErrorBody(asRecord(err.body) as HrErrorBody & object, err.status),
    );
  }

  if (err instanceof BackendApiError) {
    const details = asRecord(err.details);
    return {
      code: err.code,
      userMessage: err.userMessage,
      detail: err.detail,
      details,
      status: err.status,
      requestId: err.requestId,
      retryable: details.retryable === true,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    code: "unknown_error",
    userMessage: message,
    detail: message,
    details: {},
    status: null,
    requestId: "",
    retryable: false,
  };
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
