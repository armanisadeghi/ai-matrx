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

import { useState } from "react";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
import { useSearchParams } from "next/navigation";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { ExportRunList } from "@/features/hr/exports/components/ExportRunList";
import { GeneratePeriodsPanel } from "./GeneratePeriodsPanel";
import { hrTimePeriodHref } from "@/features/hr/routes";
import { usePayPeriods } from "../hooks/usePayPeriods";
import { PayPeriodsTable } from "./PayPeriodsTable";
import { readOf } from "@ai-matrx/design-system";

const CASES = new Set(["happy", "empty", "error", "edge", "edge2"]);

export function useMockCase(): HrFixtureCase | undefined {
  const params = useSearchParams();
  const raw = params.get("case");
  return raw && CASES.has(raw) ? (raw as HrFixtureCase) : undefined;
}

export function PayPeriodsPage() {
  const hr = useHrContext();
  const mockCase = useMockCase();
  const [query, setQuery] = useState<MatrxDataTableQueryState>({ page: 1, pageSize: 50, search: "", anyOf: "", columnFilters: {}, sort: null });
  const employerId = hr.active?.organization_id ?? null;
  const [queryScope, setQueryScope] = useState(employerId);
  if (queryScope !== employerId) {
    setQueryScope(employerId);
    setQuery((current) => ({ ...current, page: 1, search: "", anyOf: "", columnFilters: {}, sort: null }));
  }
  const { page, isLoading, failure, reload } = usePayPeriods({ organizationId: employerId }, { page: query.page, pageSize: query.pageSize }, mockCase, employerId);

  return (
    <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-4">
          <h1 title="Every pay group's periods, and where each one is in its lifecycle." className="text-base font-semibold text-foreground">Pay periods</h1>
        </header>

        {/*
          The calendar generator. It sits ABOVE the table because an empty table is the single most
          common reason somebody opens this page, and the door that fixes that should not be below
          the emptiness it explains.
        */}
        <div className="mb-4">
          <GeneratePeriodsPanel
            organizationId={hr.active?.organization_id ?? null}
            mockCase={mockCase}
            onGenerated={reload}
          />
        </div>

        <PayPeriodsTable
          rows={page?.rows ?? []}
          sourceTotal={page?.totalRows}
          query={{ mode: "controlled", state: query, onStateChange: setQuery, totalItems: page?.totalRows ?? 0, sourceProcessing: { search: "local", sort: "local", columnFilters: "local" } }}
          isLoading={isLoading}
          // The server's sentence, verbatim — said once, by the table.
          read={readOf({ isLoading, error: failure?.userMessage ?? null }, { what: "the pay periods", onRetry: reload })}
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
