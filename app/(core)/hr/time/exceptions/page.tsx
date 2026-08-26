import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { ExceptionsQueue } from "@/features/hr/time/exceptions/ExceptionsQueue";
import type { AttendanceExceptionKind } from "@/features/hr/time/api/types";

/**
 * Route 31 — `/hr/time/exceptions` (SPEC-UI-IA §3.4 row 31, SPEC-TIME §2.6).
 *
 * The queue that makes the scheduled-vs-actual join real. `?kind=` is how the exceptions strip on
 * routes 28 and 29 hands over pre-filtered.
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
  searchParams: Promise<{ kind?: string; employmentId?: string }>;
}) {
  const { kind, employmentId } = await searchParams;
  const validKind =
    kind && KINDS.has(kind) ? (kind as AttendanceExceptionKind) : null;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Attendance exceptions</h1>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <Suspense
          fallback={
            <div className="h-full animate-pulse bg-card/40" aria-label="Loading the queue" />
          }
        >
          <ExceptionsQueue kind={validKind} employmentId={employmentId ?? null} />
        </Suspense>
      </div>
    </>
  );
}
