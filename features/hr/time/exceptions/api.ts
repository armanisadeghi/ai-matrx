"use client";

/**
 * features/hr/time/exceptions/api.ts — the exceptions queue's read.
 *
 * 🚨 THIS CONTRACT DOES NOT EXIST YET, AND THAT IS RECORDED RATHER THAN PAPERED OVER.
 * SPEC-TIME §2.6 specifies route 31's filters in detail but §1.3 names only
 * `hr.attendance_exception_resolve` — there is no list contract anywhere in the frozen set, and a
 * live check on 2026-08-26 found no `hr.attendance_exception_list` and no `public` wrapper for one.
 * The queue is unbuildable without a read, so the name is **declared** here under R-L3 U-03's
 * grammar instead of being invented three different ways by three different agents. See the comment
 * on `hr_attendance_exception_list` in `../api/rpc.ts`.
 *
 * Until the SQL lands, route 31 runs on the fixtures appended to `../api/mock/registry.ts`.
 */

import { callHrTimeRpc, type HrRpcOptions } from "../api/rpc";
import type {
  AttendanceExceptionKind,
  AttendanceExceptionRow,
  ExceptionResolutionState,
  ExceptionSeverity,
  Paged,
  PageRequest,
} from "../api/types";

/**
 * The §2.6 filter set, **as the live function actually reads it** (verified 2026-08-26 against
 * `hr.attendance_exception_list(p_filters jsonb, p_page jsonb)`).
 *
 * 🚨 SINGULAR, NOT ARRAYS. This lane declared the contract name before the SQL existed and assumed
 * plural array filters (`exceptionKinds: [...]`). The lane that built it reads
 * `exception_kind`, `resolution_state`, `severity`, `employment_id`, `work_location_id`, `from`,
 * `to`, `affects_unapproved_period` — one value each. Their signature is the one that runs, so it
 * wins, and this type is corrected to it rather than being translated somewhere invisible.
 * `service.ts` snake-cases the bag on the way out.
 */
export interface AttendanceExceptionFilters {
  resolutionState?: ExceptionResolutionState;
  exceptionKind?: AttendanceExceptionKind;
  severity?: ExceptionSeverity;
  employmentId?: string;
  workLocationId?: string;
  /** Inclusive `local_work_date` bounds. A work DATE, never an instant. */
  from?: string;
  to?: string;
  /** §2.6's last filter: exceptions on a period nobody has approved yet. */
  affectsUnapprovedPeriod?: boolean;
}

/** Fully paginated — a list a caller treats as complete is never a capped fetch (LAW 3). */
export function listAttendanceExceptions(
  filters: AttendanceExceptionFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<AttendanceExceptionRow>> {
  return callHrTimeRpc<Paged<AttendanceExceptionRow>>(
    "hr_attendance_exception_list",
    {
      p_filters: snakeizeExceptionFilters(filters),
      // The SQL reads `limit`/`offset`, not `page`/`pageSize`.
      p_page: { limit: page.pageSize, offset: Math.max(0, (page.page - 1) * page.pageSize) },
    },
    opts,
  );
}

function snakeizeExceptionFilters(
  filters: AttendanceExceptionFilters,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    out[key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)] = value;
  }
  return out;
}
