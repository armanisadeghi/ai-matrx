// features/hr/people/new/writeAck.ts
//
// Normalizes every way an HR write can say no into ONE shape for this form.
//
// 🚨 THIS FILE USED TO CARRY A TRANSPORT DEFECT, AND NO LONGER DOES — the note is kept because
// the bug is worth recognising if it ever comes back. `features/hr/service.ts`'s `callHr` tested
// a payload for `granted: false` only. That is the READ doors' dialect; the WRITE doors answer
// `{ ok: false, reason, field?, door? }`, so `callHr` fell through to its SUCCESS branch and
// handed callers `{ok: true, data: {ok: false, …}}`. A call site checking `result.ok` therefore
// read a REFUSAL AS A SUCCESSFUL WRITE — in this lane, telling an HR admin somebody was hired
// when nothing was written.
//
// Fixed at the source: `isRefusalEnvelope` now accepts both dialects, and `HrDenied` carries
// `field`, `door` and the whole `payload` (which `rehire_required` needs — its `existing` block
// IS §4.6's rehire panel). This file is now a thin adapter that knows nothing about dialects.

import type { HrResult } from "../../types";

export type HrWriteRefusal = {
  reason: string;
  detail: string | null;
  /** The field the server named, for `reason: 'validation'`. */
  field: string | null;
  /** A route the server handed back — always followed, never invented. */
  door: string | null;
  /** Extra payload the refusal carried (e.g. `existing` on `rehire_required`). */
  payload: Record<string, unknown>;
};

export type HrWriteOutcome<T extends Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; refusal: HrWriteRefusal };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Normalize every way an HR write can say no into ONE shape.
 *
 * `fallback` is what to say when the server refused without a sentence — never
 * a bare reason code, which is not an answer to "what went wrong?".
 */
export function readWriteAck<T extends Record<string, unknown>>(
  result: HrResult<Record<string, unknown>>,
  fallback: string,
): HrWriteOutcome<T> {
  if (!result.ok) {
    // The transport's own two dialects: a raised 42501, or a genuine failure.
    if (result.kind === "denied") {
      return {
        ok: false,
        refusal: {
          reason: result.reason,
          detail: result.detail ?? fallback,
          field: result.field,
          door: result.door,
          payload: result.payload,
        },
      };
    }
    return {
      ok: false,
      refusal: {
        reason: "failed",
        detail: result.message || fallback,
        field: null,
        door: null,
        payload: {},
      },
    };
  }

  const payload = asRecord(result.data);

  // THE THIRD DIALECT.
  if (payload.ok === false) {
    return {
      ok: false,
      refusal: {
        reason: str(payload, "reason") ?? "refused",
        detail: str(payload, "detail") ?? fallback,
        field: str(payload, "field"),
        door: str(payload, "door"),
        payload,
      },
    };
  }

  return { ok: true, data: payload as T };
}
