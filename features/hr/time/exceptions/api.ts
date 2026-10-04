"use client";

/** Exceptions queue read through the public wrapper over hr.attendance_exception_list. */

import { callHrTimeRpc, type HrRpcOptions } from "../api/rpc";
import { toTimePage } from "../api/timePage";
import { fromLiveExceptionList } from "../punches/fromLivePunches";
import type {
  AttendanceExceptionKind,
  AttendanceExceptionRow,
  ExceptionResolutionState,
  ExceptionSeverity,
  Paged,
  PageRequest,
} from "../api/types";

/** Live enum filter axes accept arrays; scalar callers select one member of that set. */
export interface AttendanceExceptionFilters {
  /**
   * 🚨 THE PERIOD AXIS — the one route 28's strip scopes by (SPEC-TIME §5.4).
   *
   * It resolves the period's REAL envelope server-side: the
   * `pay_period_employment`-or-pay-group roster, and the period range **or the boundary-workweek
   * days**. That last part is why this exists and why a `from`/`to` window is not a substitute — a
   * boundary week's findings fall outside the period's own date range, so a date filter silently
   * drops exactly the days most likely to carry an overtime dispute.
   *
   * Refuses `hr_pay_period_not_found` for an id the caller cannot see.
   */
  payPeriodId?: string;
  resolutionState?: ExceptionResolutionState | readonly ExceptionResolutionState[];
  exceptionKind?: AttendanceExceptionKind | readonly AttendanceExceptionKind[];
  severity?: ExceptionSeverity | readonly ExceptionSeverity[];
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
  // MAPPED, not cast — see `../punches/fromLivePunches.ts` for the live-vs-types diff.
  return callHrTimeRpc<unknown>(
    "hr_attendance_exception_list",
    {
      p_filters: snakeizeExceptionFilters(filters),
      p_page: toTimePage(page),
    },
    opts,
  ).then(fromLiveExceptionList);
}

function snakeizeExceptionFilters(
  filters: AttendanceExceptionFilters,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    const wireKey = key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (key === "resolutionState" || key === "exceptionKind" || key === "severity") {
      const values = Array.isArray(value) ? value : [value];
      if (values.length > 0) out[wireKey] = values;
    } else {
      out[wireKey] = value;
    }
  }
  return out;
}
