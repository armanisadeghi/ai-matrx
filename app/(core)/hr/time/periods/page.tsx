import { Suspense } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { PayPeriodsRouteBody } from "@/features/hr/exports/components/PayPeriodsRouteBody";
import { HR_MOCK_ENABLED, type HrFixtureCase } from "@/features/hr/mock/transport";

/**
 * Route 32 — `/hr/time/periods`: the pay-period state machine per pay group, plus the employer's
 * export history (SPEC-UI-IA §3.4 row 32).
 *
 * 🚨 WHO OWNS WHAT. Readiness U-5 resolves routes 32/33 as **L3's mount of L13's component**. L3
 * built the pay-period half — the state machine and `PayPeriodsTable` — but never mounted a route
 * file, leaving both halves unreachable; L13 mounts them so the export half can actually be opened
 * and reviewed. **L3 owns the period half.** Moving `PayPeriodsRouteBody` into
 * `features/hr/time/periods/` needs no agreement from L13: the export half is one
 * `<ExportRunList payPeriodId={null}>` and it travels with a cut and a paste.
 */
export const metadata = createRouteMetadata("/hr/time/periods", {
  titlePrefix: "Periods",
  title: "Pay periods",
  description:
    "Pay periods for this employer, and every payroll file built from them.",
  letter: "PP",
});

export default async function HrPayPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string }>;
}) {
  const { case: fixtureCase } = await searchParams;
  // `?case=` selects which §6.4 fixture the mock transport answers with, and it is read ONLY when
  // the mock flag is on — it can never change what a real server returns.
  const mockCase =
    HR_MOCK_ENABLED && fixtureCase ? (fixtureCase as HrFixtureCase) : undefined;

  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold">Pay periods</h1>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <Suspense
          fallback={
            <div
              className="h-full animate-pulse bg-card/40"
              aria-label="Loading pay periods"
            />
          }
        >
          <PayPeriodsRouteBody mockCase={mockCase} />
        </Suspense>
      </div>
    </>
  );
}
