import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MyTimesheetContext } from "@/features/hr/me/MyTimesheetContext";

/**
 * Route 5 — `/hr/me/timesheet` (SPEC-UI-IA §3.1 row 5, SPEC-TIME §2.2).
 *
 * The employee's own current pay period: attest, attest with an exception, or ask for a
 * correction. Self-only by construction — a manager reviewing a report uses route 29.
 *
 * SPEC-TIME §2.2 writes the read as `hr.timesheet_get(self, current_period)`; the live door takes
 * two concrete uuids. `MyTimesheetContext` resolves both — the employment from the ONE
 * `hr_my_context` the `/hr` layout already resolved (the server's as-of spell, never
 * `current_employment_id`, per SPEC-EMPLOYEES §2.1), and the current period from
 * `hr_pay_period_list`.
 *
 * 🚨 SEARCH PARAMS STILL WIN. `?employment=…&period=…` is an explicit request — a manager
 * following a deep link, or anybody re-opening a specific period — and resolution is the fallback
 * for the bare route, never an override of what was asked for.
 */
export const metadata = { title: "My timesheet" };

export default async function MyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ employment?: string; period?: string }>;
}) {
  const { employment, period } = await searchParams;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">My timesheet</h1>
      </PageHeader>
      {/* `(core)` body law: h-full overflow-hidden, with the scroll owned inside. */}
      <div className="h-full overflow-y-auto overflow-x-hidden">
        <Suspense
          fallback={
            <div className="h-full animate-pulse bg-card/40" aria-label="Loading your timesheet" />
          }
        >
          <MyTimesheetContext
            employmentId={employment ?? null}
            payPeriodId={period ?? null}
          />
        </Suspense>
      </div>
    </>
  );
}
