"use client";

/**
 * PayPeriodsRouteBody — SPEC-UI-IA route 32, `/hr/time/periods`.
 *
 * 🚨 OWNERSHIP, BECAUSE THIS FILE STRADDLES TWO LANES. Readiness U-5 resolves routes 32/33 as
 * **L3's mount of L13's component**. L3 (`lane-l3-time`) built the pay-period half — the state
 * machine, `PayPeriodsTable`, `PeriodStatePanel` — but never mounted the routes, so L13 mounts
 * them so its own export half is reachable. **L3 owns the period half of this page.** Replacing
 * the period section below, or moving this body into `features/hr/time/periods/`, needs no
 * agreement from L13 — the export section is a single `<ExportRunList>` and it moves with a cut
 * and a paste.
 *
 * L3's table is used AS IT IS, not re-implemented. `hrefFor` is `hrPayPeriodHref` — the builder,
 * never a template literal — so `?org=` travels and a click cannot land the reader in a different
 * employer's period.
 */

import { hrPayPeriodHref } from "@/features/hr/routes";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { usePayPeriods } from "@/features/hr/time/periods/hooks/usePayPeriods";
import { PayPeriodsTable } from "@/features/hr/time/periods/components/PayPeriodsTable";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HR_TIME_PERIODS_ASSIST_SURFACE } from "../hr-exports-assists-producer";
import { ExportRunList } from "./ExportRunList";

const NO_FILTERS = {} as const;

export function PayPeriodsRouteBody({ mockCase }: { mockCase?: HrFixtureCase }) {
  const hr = useHrContext();
  const periods = usePayPeriods(NO_FILTERS, undefined, mockCase);

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      <AssistStrip surfaceName={HR_TIME_PERIODS_ASSIST_SURFACE} />

      {/* ── L3's half: the pay-period state machine per pay group ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Pay periods</h2>
        <PayPeriodsTable
          rows={periods.page?.rows ?? []}
          isLoading={periods.isLoading}
          hrefFor={(row) => hrPayPeriodHref(row.id, hr.orgRef)}
        />
      </section>

      {/* ── L13's half: every recent payroll export in this employer ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Payroll exports
        </h2>
        <p className="max-w-3xl text-xs text-muted-foreground">
          Every file built for this employer, newest first. Open a pay period
          above to build a new one.
        </p>
        <ExportRunList payPeriodId={null} mockCase={mockCase} />
      </section>
    </div>
  );
}
