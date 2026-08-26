// features/hr/people/new/writeAck.ts
//
// 🚨 A DEFECT IN THE SHARED TRANSPORT, HANDLED HERE UNTIL IT IS FIXED THERE.
//
// `features/hr/service.ts`'s `callHr` treats a payload as a refusal only when it
// carries `granted: false`. That is the READ doors' dialect. The WRITE doors —
// `hr_employee_create`, `hr_position_change`, `hr_transfer`, `hr_compensation_upsert`,
// `hr_separation_record`, `hr_duplicate_scan` and the rest — speak a THIRD
// dialect that neither the file's header nor its `isRefusalEnvelope` accounts
// for:
//
//     { "ok": false, "reason": "validation", "field": "hire_date", "detail": "…" }
//     { "ok": false, "reason": "location_without_jurisdiction", "door": "/hr/settings/structure" }
//     { "ok": false, "reason": "rehire_required", "existing": { … } }
//
// Because `granted` is absent, `callHr` falls through to its success branch and
// hands the caller `{ok: true, data: {ok: false, …}}`. A call site that only
// checks `result.ok` therefore reads a REFUSAL AS A SUCCESSFUL WRITE — and in
// this lane that means telling an HR admin somebody was hired when nothing was
// written.
//
// (Verified against the live function bodies 2026-08-26. The same reading also
// shows `features/hr/service.ts`'s header claim that these writes are "NOT LIVE
// YET" is stale: every one of them exists in `pg_proc` today. Both findings are
// in the lane report; the fix belongs in `callHr`, once, not in each caller.)
//
// Every write in this lane goes through `readWriteAck` so the bug cannot reach a
// user from here, and so the fix upstream is a deletion rather than a hunt.

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
          field: null,
          door: null,
          payload: {},
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
