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

/** The §2.6 filter set, verbatim from the spec's own list. */
export interface AttendanceExceptionFilters {
  resolutionStates?: ExceptionResolutionState[];
  exceptionKinds?: AttendanceExceptionKind[];
  severities?: ExceptionSeverity[];
  locationIds?: string[];
  departmentIds?: string[];
  managerEmploymentIds?: string[];
  employmentIds?: string[];
  payPeriodId?: string;
  from?: string;
  to?: string;
  /** §2.6's last filter: exceptions on a period nobody has approved yet. */
  affectsUnapprovedPeriod?: boolean;
  search?: string;
}

/** Fully paginated — a list a caller treats as complete is never a capped fetch (LAW 3). */
export function listAttendanceExceptions(
  filters: AttendanceExceptionFilters,
  page: PageRequest,
  opts?: HrRpcOptions,
): Promise<Paged<AttendanceExceptionRow>> {
  return callHrTimeRpc<Paged<AttendanceExceptionRow>>(
    "hr_attendance_exception_list",
    { p_filters: filters, p_page: page },
    opts,
  );
}
