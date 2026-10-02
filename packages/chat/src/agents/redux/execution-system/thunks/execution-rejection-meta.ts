/**
 * The rejection protocol of the execution thunks: the safe correlation fields
 * a rejected action carries, and the error NAMES that mark a rejection as the
 * person's own answer (Stop) or a handed-on turn (a scheduled resume retry).
 * The package owns it (P5); a host's capture middleware reads it — matrx-frontend
 * re-exports it from lib/diagnostics/executionRejectionMeta.ts.
 */
import { miniSerializeError } from "@reduxjs/toolkit";

/** Only stable correlation identifiers cross the rejected-action boundary. */
export interface ExecutionRejectionMeta {
  executionRequestId?: string;
  conversationId?: string;
  originalErrorName?: string;
}

/** Keep RTK's normal serialized Error shape, adding only named safe fields. */
export function serializeExecutionRejection(error: unknown) {
  const source = typeof error === "object" && error !== null
    ? error as Record<string, unknown> : {};
  const meta: ExecutionRejectionMeta = {};
  for (const key of ["executionRequestId", "conversationId", "originalErrorName"] as const) {
    if (typeof source[key] === "string") meta[key] = source[key];
  }
  return { ...miniSerializeError(error), ...meta };
}

export function executionRejectionMeta(
  executionRequestId: string,
  conversationId: string,
  originalErrorName?: string,
): ExecutionRejectionMeta {
  return { executionRequestId, conversationId, ...(originalErrorName ? { originalErrorName } : {}) };
}

/**
 * A rejection the PERSON caused on purpose — Stop during a run
 * (`StreamCancelledError`), or closing the organization picker
 * (`OrganizationSelectionCancelled`). It is an answer, not a failure: the
 * capture middleware files nothing for it (PB-05 W-49 — a Stop used to land
 * as a red "dead user turn"). Every execution thunk that rejects "Cancelled"
 * passes one of these names as `originalErrorName`; nothing else may.
 */
export const PERSON_CANCELLATION_ERROR_NAMES: ReadonlySet<string> = new Set([
  "StreamCancelledError",
  "OrganizationSelectionCancelled",
]);

export function isPersonCancellationErrorName(name: unknown): boolean {
  return typeof name === "string" && PERSON_CANCELLATION_ERROR_NAMES.has(name);
}

/**
 * A rejection that HANDS THE TURN ON instead of failing it. `resumeInstance`
 * rejects while it has already scheduled its own bounded retry (the suspending
 * stream is still closing, or a 409 resume_conflict); the next dispatch carries
 * the turn. It is control flow, not a failure: the capture middleware files
 * nothing for it (2026-10-01 — every scheduled retry landed as a red
 * "redux-rejected" dead turn). The FINAL failure after the retry budget is spent
 * carries no marker and stays red.
 */
export const RESUME_RETRY_SCHEDULED_ERROR_NAME = "ResumeRetryScheduled";

export function isScheduledRetryErrorName(name: unknown): boolean {
  return name === RESUME_RETRY_SCHEDULED_ERROR_NAME;
}
