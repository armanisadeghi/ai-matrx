import { Suspense } from "react";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { MyTimesheet } from "@/features/hr/time/timesheet/MyTimesheet";

/**
 * Route 5 — `/hr/me/timesheet` (SPEC-UI-IA §3.1 row 5, SPEC-TIME §2.2).
 *
 * The employee's own current pay period: attest, attest with an exception, or ask for a
 * correction. Self-only by construction — a manager reviewing a report uses route 29.
 *
 * The ids arrive as search params today. SPEC-TIME §2.2 writes the read as
 * `hr.timesheet_get(self, current_period)`, but the live contract takes two concrete uuids and no
 * self/current resolver is wired yet (see `MyTimesheet`'s `UnresolvedContext` for the full note).
 * Without them the surface says so instead of showing a blank grid.
 */
export const metadata = { title: "My timesheet" };

export default async function MyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ employmentId?: string; payPeriodId?: string }>;
}) {
  const { employmentId, payPeriodId } = await searchParams;

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
          <MyTimesheet
            employmentId={employmentId ?? null}
            payPeriodId={payPeriodId ?? null}
          />
        </Suspense>
      </div>
    </>
  );
}
