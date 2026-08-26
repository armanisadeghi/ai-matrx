"use client";

/**
 * features/hr/time/periods/components/PayPeriodsPage.tsx — route 32's client body.
 *
 * The employer comes from `useHrContext()`. HR is strictly single-employer: there is no
 * cross-employer pay-period view, in v1 or later, and filtering to "all my orgs" here would merge
 * two employers' payroll — a compliance defect, not a convenience.
 *
 * The `?case=` parameter selects which frozen fixture the mock lane answers with. It exists so the
 * error and edge states can be SEEN rather than described, and it is inert whenever
 * `NEXT_PUBLIC_HR_MOCK` is not `1` — it can never change what a real server returns.
 *
 * 🚨 EXPORT HISTORY IS PART OF ROUTE 32, NOT AN EXTRA. SPEC-UI-IA §3.4 row 32 is *"Pay-period state
 * machine per pay group **+ export history**"* — the org-wide list, beside the periods it came from,
 * so a payroll administrator can see what has actually left the building without opening every
 * period one at a time. It is L13's `<ExportRunList>` with `payPeriodId={null}`, which is that
 * component's own org-wide mode; this lane mounts it and owns no second copy.
 */

import { useSearchParams } from "next/navigation";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { ExportRunList } from "@/features/hr/exports/components/ExportRunList";
import { hrTimePeriodHref } from "@/features/hr/routes";
import { usePayPeriods } from "../hooks/usePayPeriods";
import { PayPeriodsTable } from "./PayPeriodsTable";

const CASES = new Set(["happy", "empty", "error", "edge", "edge2"]);

export function useMockCase(): HrFixtureCase | undefined {
  const params = useSearchParams();
  const raw = params.get("case");
  return raw && CASES.has(raw) ? (raw as HrFixtureCase) : undefined;
}

export function PayPeriodsPage() {
  const hr = useHrContext();
  const mockCase = useMockCase();
  const { page, isLoading, failure } = usePayPeriods({}, { page: 1, pageSize: 50 }, mockCase);

  return (
    <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-4">
          <h1 className="text-base font-semibold text-foreground">Pay periods</h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
            Every pay group&apos;s periods, and where each one is in its lifecycle. A period moves
            when somebody moves it — approving one person&apos;s timecard never moves the period they
            are in.
          </p>
        </header>

        {failure ? (
          // The server's sentence, verbatim.
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {failure.userMessage}
          </p>
        ) : null}

        <PayPeriodsTable
          rows={page?.rows ?? []}
          isLoading={isLoading}
          hrefFor={(row) => hrTimePeriodHref(row.id, hr.orgRef)}
        />

        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Export history</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
            Every payroll file this employer has produced, across all pay groups, with what payroll
            did with it. Exports go one way — hours and earnings out, never a paycheque back.
          </p>
          <div className="mt-3">
            {/* `null` is this component's org-wide mode: every export, not one period's. */}
            <ExportRunList payPeriodId={null} mockCase={mockCase} />
          </div>
        </section>
      </div>
    </div>
  );
}
