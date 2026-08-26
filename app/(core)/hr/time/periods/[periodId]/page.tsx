import { Suspense } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { PayPeriodRouteBody } from "@/features/hr/exports/components/PayPeriodRouteBody";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";

/**
 * Route 33 — `/hr/time/periods/[periodId]`: one pay period, its approval progress, and its export
 * runs (idempotent, versioned, with acknowledgement and failure records).
 *
 * 🚨 WHO OWNS WHAT. Readiness U-5 resolves this route as **L3's mount of L13's component**. L13
 * mounts it temporarily because L3 built the period components but no route file, leaving both
 * halves unreachable. **L3 owns the period half.** `PeriodStatePanel`, `PeriodTransitionBar`,
 * `BoundaryWeeksPanel` and `PostLockAdjustments` are deliberately NOT mounted by L13 — they take a
 * viewer `role` and a reopen permission, and a lane that does not own the permission model must
 * not guess one to make a page look finished. L3 drops them in above `<ExportRunPanel>`; nothing
 * below that line is theirs to touch.
 */
export const metadata = createRouteMetadata("/hr/time/periods", {
  titlePrefix: "Period",
  title: "Pay periods",
  description:
    "One pay period: approval progress, and every payroll file built from it.",
  letter: "PD",
});

export default async function HrPayPeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string }>;
  searchParams: Promise<{ case?: string }>;
}) {
  const { periodId } = await params;
  const { case: fixtureCase } = await searchParams;
  // `?case=` selects which §6.4 fixture the mock transport answers with, and it is read ONLY when
  // the mock flag is on — it can never change what a real server returns.
  const mockCase =
    HR_MOCK_ENABLED && fixtureCase
      ? (fixtureCase as HrFixtureCase)
      : undefined;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Pay period</h1>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <Suspense
          fallback={
            <div
              className="h-full animate-pulse bg-card/40"
              aria-label="Loading this pay period"
            />
          }
        >
          <PayPeriodRouteBody periodId={periodId} mockCase={mockCase} />
        </Suspense>
      </div>
    </>
  );
}
