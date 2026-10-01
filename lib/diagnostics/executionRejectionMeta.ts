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
