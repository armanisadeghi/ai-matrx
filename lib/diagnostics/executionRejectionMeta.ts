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
