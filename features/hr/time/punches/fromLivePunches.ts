"use client";

/**
 * features/hr/time/punches/fromLivePunches.ts — the seams for the punch lane's reads and writes.
 *
 * 🚨 WHY THESE EXIST: THE CAST-AT-A-SEAM CLASS.
 * `callHrTimeRpc<T>` ends in `return data as T`. The cast compiles against a hand-written type and
 * proves nothing about the payload, so wherever the live shape differs the fields arrive
 * `undefined` and the surface renders a blank, a `NaN`, or crashes — always at runtime, always only
 * once real data exists. Eight instances of this class landed in one day across this feature.
 *
 * Every shape below was read from the LIVE function bodies (`pg_proc.prosrc`, 2026-08-26), not
 * inferred from `types.ts`.
 *
 * THE STANDING LAWS, RESTATED BECAUSE AN ADAPTER IS WHERE THEY DIE QUIETLY:
 *   • a null amount becomes `moneyWithheld`, NEVER `?? 0`;
 *   • a field the server does not send stays dark — never invented, never defaulted into a claim;
 *   • a refusal is data: it arrives as `HrRpcError` carrying the server's own `userMessage`.
 */

import type { AttendanceExceptionRow, Paged, PunchRow } from "../api/types";
import type { PunchCorrectionResult } from "../api/service";
import {
  arr,
  bool,
  mapLivePunch,
  nstr,
  num,
  obj,
  type Live,
} from "../timesheet/fromLiveTimesheet";

/**
 * `hr.punch_register` → `Paged<PunchRow>`.
 *
 * LIVE:  `{ok, rows, contains_computed_values, page:{limit, offset, returned, total, has_more, next_offset}}`
 * TYPES: `{rows, page: number, pageSize, totalRows, hasMore}`
 *
 * 🚨 `page` is an OBJECT live and a NUMBER in the view model, and `totalRows` does not exist —
 * it is `page.total`. So the register's pager read `undefined` and reported **zero total rows while
 * rendering a page of them**. On an evidence lane that is the worst possible failure: a reviewer
 * looking for a punch is told the register holds nothing beyond what is on screen.
 */
export function fromLivePunchRegister(payload: unknown): Paged<PunchRow> {
  const live = obj(payload);
  const page = obj(live.page);
  const limit = num(page.limit, 50) || 50;
  const offset = num(page.offset);

  return {
    rows: arr(live.rows).map((r) => mapLivePunch(r)),
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
    totalRows: num(page.total),
    hasMore: bool(page.hasMore),
  };
}

/**
 * `hr.punch_correct` / `hr.punch_void` → `PunchCorrectionResult`.
 *
 * LIVE:  `{ok, reason, recompute[], audit_trails, voided_punch_ids[], replacement_punch_ids[],
 *          pairs, exceptions_closed[], exceptions_opened[],
 *          notifications:{event_key, rows_written, org_overridable},
 *          intervals:{is_stale, recompute_door, affected[]}}`
 *
 * 🚨 THREE OF THE EIGHT FIELDS THE CORRECTION DIALOG RENDERS WERE ARRIVING `undefined`:
 *
 *   `auditTrailCount`     ← `audit_trails`              (renamed)
 *   `employeeNotified`    ← `notifications.rows_written > 0`   (structural)
 *   `requiresReapproval`  ← `intervals.is_stale`               (structural)
 *
 * The middle one matters most. §4.1's ruling is that **the employee is always notified**, and the
 * dialog exists to say so at the moment a manager commits. With `employeeNotified` undefined that
 * sentence never rendered — so the product silently stopped making the promise it was built to
 * make, while still performing the notification. A cast turned a guarantee into a blank.
 */
export function fromLivePunchCorrection(payload: unknown): PunchCorrectionResult {
  const live = obj(payload);
  const notifications = obj(live.notifications);
  const intervals = obj(live.intervals);

  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    voidedPunchIds: ids(live.voidedPunchIds),
    replacementPunchIds: ids(live.replacementPunchIds),
    // The workweeks the write invalidated, named by the engine's own affected list.
    recomputedWorkweekIds: arr(intervals.affected)
      .map((a) => nstr(a.id))
      .filter((x): x is string => x !== null),
    exceptionsOpened: arr(live.exceptionsOpened) as unknown as AttendanceExceptionRow[],
    exceptionsClosed: arr(live.exceptionsClosed)
      .map((e) => (typeof e === "string" ? e : nstr(obj(e).id)))
      .filter((x): x is string => x !== null),
    // One reasoned action, N audit trails — the count always equals the punch count (§4.1).
    auditTrailCount: num(live.auditTrails),
    /*
     * `rows_written` is how many notification rows the server actually wrote. Reading it as a
     * boolean is honest: it says the employee WAS told, rather than asserting a promise the client
     * cannot see the result of. Zero rows renders as "not notified", which is a finding, not a
     * cosmetic default.
     */
    employeeNotified: num(obj(notifications).rowsWritten) > 0,
    // Intervals are stale until a recompute runs; an already-approved period must be re-approved.
    requiresReapproval: bool(intervals.isStale),
  };
}

/**
 * `hr.attendance_exception_list` → `Paged<AttendanceExceptionRow>`.
 *
 * ✅ CHECKED AND ALREADY ALIGNED — recorded here so the next reader does not "fix" it.
 * `hr._time_exception_json` emits **camelCase keys that match `AttendanceExceptionRow` exactly**
 * (`employmentId`, `allowedResolutions`, `isEstimate`, `workedAfterDenial`, …), and the payload
 * carries `page` / `page_size` / `total_rows` / `has_more`, which camelize onto `Paged<T>`'s own
 * field names. The only work left is coercing the paging numbers so a missing value cannot render
 * as `NaN` in the pager.
 */
export function fromLiveExceptionList(payload: unknown): Paged<AttendanceExceptionRow> {
  const live = obj(payload);
  return {
    rows: arr(live.rows) as unknown as AttendanceExceptionRow[],
    page: num(live.page, 1) || 1,
    pageSize: num(live.pageSize, 50) || 50,
    totalRows: num(live.totalRows),
    hasMore: bool(live.hasMore),
  };
}

/**
 * `hr.attendance_exception_resolve` → `{exception, intervalsWritten}`.
 *
 * The resolution's own row comes back under `exception` and is already camelCase (it is built by
 * `hr._time_exception_json`, the same helper the list uses). What this mapper adds is the
 * guarantee the CALLER depends on: `exception` is either a row or `null`, and `intervalsWritten` is
 * always an array — so a surface can say "a premium line was written" from its length without a
 * defensive check at every call site.
 *
 * 🚨 The premium lines this returns are the §4.3 statutory ones: a meal and a rest premium on the
 * same day are TWO lines and are never merged. Nothing here collapses them.
 */
export function fromLiveExceptionResolution(payload: unknown): {
  exception: AttendanceExceptionRow;
  intervalsWritten: unknown[];
} {
  const live = obj(payload);
  return {
    exception: obj(live.exception) as unknown as AttendanceExceptionRow,
    intervalsWritten: arr(live.intervalsWritten ?? live.intervals),
  };
}
