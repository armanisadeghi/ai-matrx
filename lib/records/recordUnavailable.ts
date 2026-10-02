/**
 * lib/records/recordUnavailable.ts
 *
 * The ONE shape for "a single-record read came back with zero rows".
 *
 * Zero rows is at least three different situations: the row was soft-deleted,
 * the row is alive but this reader's access (org membership / permission
 * grant) does not reach it, or the id is stale/wrong. Asserting deletion for
 * all three is what D133 cost — two agent-review items were rejected as "site
 * deleted or is no longer accessible" while the brand AND site were live and
 * un-deleted; the null was RLS.
 *
 * So `deleted` is claimed ONLY when a probe proved it. Everything else is
 * `unknown` and says both possibilities out loud. Honest ambiguity beats a
 * false assertion, and every construction screams into the Error Inspector —
 * an access gap masquerading as data loss is a defect to find, not a friendly
 * sentence to render.
 */

import {
  captureError,
  resolveCapturedError,
} from "@/lib/diagnostics/errorCaptureStore";

import {
  isRecordUnavailableError,
  RecordUnavailableError,
  recordUnavailableMessage,
  type RecordUnavailableReason,
  type RecordUnavailableResolution,
} from "@ai-matrx/data/db";

// The error class lives in `@ai-matrx/data/db` so the app and `@ai-matrx/chat`
// (whose diagnostics seam builds the same error) share ONE class: every
// `isRecordUnavailableError` check holds wherever the error was thrown.
export {
  isRecordUnavailableError,
  RecordUnavailableError,
  recordUnavailableMessage,
  type RecordUnavailableReason,
  type RecordUnavailableResolution,
};

/**
 * Build the error AND capture it. Never construct `RecordUnavailableError`
 * directly at a read site — the capture is the loud half of the contract.
 */
export function recordUnavailable(input: {
  entity: string;
  reason: RecordUnavailableReason;
  recordId?: string;
  /** Canonical entity token, so the surface can ask instead of describing. */
  token?: string;
  /** Table/view the zero-row read hit, for the inspector row. */
  relation?: string;
}): RecordUnavailableError {
  const error = new RecordUnavailableError(input);
  try {
    error.captureId = captureError({
      source: "record-unavailable",
      operation: "select",
      relation: input.relation ?? input.entity,
      message: `Zero-row read for ${input.entity}${input.recordId ? ` ${input.recordId}` : ""} (${input.reason})`,
      userMessage: error.message,
      name: error.name,
      raw: {
        entity: input.entity,
        reason: input.reason,
        recordId: input.recordId,
        token: input.token,
      },
    });
  } catch {
    /* capture must never break the read path */
  }
  return error;
}

/**
 * Replace an ambiguous record-unavailable capture with AccessGate's resolved
 * truth. The same inspector row remains logged; the tier rules decide whether
 * that truth is expected or still a system error. A resolver failure never
 * calls this, so the original `unknown` capture stays loud.
 */
export function resolveRecordUnavailableCapture(
  value: unknown,
  resolution: RecordUnavailableResolution,
): void {
  if (!isRecordUnavailableError(value) || !value.captureId) return;
  if (value.captureResolution === resolution) return;

  resolveCapturedError(value.captureId, {
    message: `Zero-row read for ${value.entity}${value.recordId ? ` ${value.recordId}` : ""} (${resolution})`,
    userMessage: resolvedRecordUnavailableMessage(value.entity, resolution),
    raw: {
      entity: value.entity,
      reason: resolution,
      recordId: value.recordId,
      token: value.token,
    },
  });
  value.captureResolution = resolution;
}

function resolvedRecordUnavailableMessage(
  entity: string,
  resolution: RecordUnavailableResolution,
): string {
  switch (resolution) {
    case "denied":
      return `You don't have access to this ${entity}.`;
    case "deleted":
      return `This ${entity} was deleted.`;
    case "missing":
      return `We couldn't find this ${entity}.`;
    case "signed-out":
      return `Sign in to open this ${entity}.`;
    case "ok":
      return `We couldn't load this ${entity}.`;
  }
}
