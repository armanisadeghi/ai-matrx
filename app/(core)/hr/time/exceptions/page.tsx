import { Suspense } from "react";

import { HrTimeShell } from "@/features/hr/time/HrTimeShell";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { ExceptionsQueue } from "@/features/hr/time/exceptions/ExceptionsQueue";
import type { AttendanceExceptionKind } from "@/features/hr/time/api/types";

/**
 * Route 31 — `/hr/time/exceptions` (SPEC-UI-IA §3.4 row 31, SPEC-TIME §2.6).
 *
 * The queue that makes the scheduled-vs-actual join real. `?kind=` is how the exceptions strip on
 * routes 28 and 29 hands over pre-filtered.
 *
 * No `PageHeader`: `HrTimeShell` → `HrSubShell` → `HrShell` injects the route header, the HR nav,
 * the employer switcher and the section's tab bar, and owns the scroll chain.
 */
export const metadata = { title: "Attendance exceptions" };

/** The closed CHECK-constrained set. An unknown `?kind=` is ignored rather than sent to the server. */
const KINDS = new Set<string>([
  "late_arrival",
  "early_departure",
  "no_show",
  "unscheduled_work",
  "missed_punch",
  "orphan_punch",
  "auto_closed_estimate",
  "unapproved_overtime",
  "worked_through_break",
  "meal_not_provided",
  "rest_not_provided",
  "over_scheduled_hours",
  "call_off",
  "left_early_approved",
  "ip_verification_failed",
]);

export default async function AttendanceExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; employment?: string; day?: string }>;
}) {
  const { kind, employment, day } = await searchParams;
  const validKind =
    kind && KINDS.has(kind) ? (kind as AttendanceExceptionKind) : null;
  // A `local_work_date`. Anything else is ignored rather than forwarded to the server.
  const validDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;

  return (
    <HrTimeShell title="Attendance exceptions">
      <Suspense fallback={<HrLoading variant="table" rows={8} />}>
        <ExceptionsQueue
          kind={validKind}
          employmentId={employment ?? null}
          day={validDay}
        />
      </Suspense>
    </HrTimeShell>
  );
}
