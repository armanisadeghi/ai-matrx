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

import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/** `deleted` is PROVEN (a probe read the row and saw `deleted_at`). */
export type RecordUnavailableReason = "deleted" | "unknown";

export class RecordUnavailableError extends Error {
  readonly entity: string;
  readonly reason: RecordUnavailableReason;
  readonly recordId?: string;

  constructor(input: {
    entity: string;
    reason: RecordUnavailableReason;
    recordId?: string;
  }) {
    super(recordUnavailableMessage(input.entity, input.reason));
    this.name = "RecordUnavailableError";
    this.entity = input.entity;
    this.reason = input.reason;
    this.recordId = input.recordId;
  }
}

export function recordUnavailableMessage(
  entity: string,
  reason: RecordUnavailableReason,
): string {
  if (reason === "deleted") {
    return `This ${entity} was deleted, so it can no longer be opened.`;
  }
  return `We couldn't open this ${entity}. It may have been deleted, or it may belong to an organization you don't have access to.`;
}

export function isRecordUnavailableError(
  value: unknown,
): value is RecordUnavailableError {
  return value instanceof RecordUnavailableError;
}

/**
 * Build the error AND capture it. Never construct `RecordUnavailableError`
 * directly at a read site — the capture is the loud half of the contract.
 */
export function recordUnavailable(input: {
  entity: string;
  reason: RecordUnavailableReason;
  recordId?: string;
  /** Table/view the zero-row read hit, for the inspector row. */
  relation?: string;
}): RecordUnavailableError {
  const error = new RecordUnavailableError(input);
  try {
    captureError({
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
      },
    });
  } catch {
    /* capture must never break the read path */
  }
  return error;
}
