"use client";

/**
 * PayPeriodRouteBody — SPEC-UI-IA route 33, `/hr/time/periods/[periodId]`.
 *
 * 🚨 OWNERSHIP. Readiness U-5: routes 32/33 are **L3's mount of L13's component**. L3 built the
 * period half and never mounted the routes; L13 mounts them so the export half is reachable.
 * **L3 owns everything above the export sections.** In particular `PeriodStatePanel`,
 * `PeriodTransitionBar`, `BoundaryWeeksPanel` and `PostLockAdjustments` are NOT mounted here, and
 * that is deliberate rather than an oversight: they need `role`, `allowPeriodReopen` and
 * `todayLocalDate`, and a viewer role guessed by the wrong lane is a permission decision made by
 * someone who does not own the permission model. Guessing `role: "admin"` to make a page look
 * complete would hand a transition control to whoever opened the URL. L3 drops those in above
 * `<ExportRunPanel>` and touches nothing below it.
 *
 * What IS rendered from L3's side is the period's own identity — its pay group, dates and state —
 * read through their `usePayPeriod` hook. A page about a pay period that cannot name which pay
 * period it is about is worse than a page with a section missing.
 */

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { usePayPeriod } from "@/features/hr/time/periods/hooks/usePayPeriods";
import { StateBadge } from "@/features/hr/time/periods/components/StateBadge";
import { formatLocalDate } from "@/features/hr/time/shared/format";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HR_TIME_PERIODS_ASSIST_SURFACE } from "../hr-exports-assists-producer";
import { useExportHistory } from "../hooks/useExportHistory";
import { ExportRunList } from "./ExportRunList";
import { ExportRunPanel } from "./ExportRunPanel";

export function PayPeriodRouteBody({
  periodId,
  mockCase,
}: {
  periodId: string;
  mockCase?: HrFixtureCase;
}) {
  const { period, isLoading, failure } = usePayPeriod(periodId, mockCase);
  // One shared read, so the panel's "built it" and the list below agree without a second query.
  const history = useExportHistory(periodId, { mockCase });

  return (
    <div className="h-full space-y-6 overflow-y-auto p-4">
      <AssistStrip surfaceName={HR_TIME_PERIODS_ASSIST_SURFACE} />

      {/* ── Which period is this? (L3's read, rendered so the page is not anonymous) ── */}
      {isLoading ? (
        <div
          className="h-16 animate-pulse rounded-lg bg-card/40"
          aria-label="Loading this pay period"
        />
      ) : failure ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <AlertTitle>This pay period could not be loaded</AlertTitle>
          {/* The server's own sentence, verbatim — never paraphrased into a generic one. */}
          <AlertDescription>{failure.userMessage}</AlertDescription>
        </Alert>
      ) : period ? (
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              {period.payGroupName}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatLocalDate(period.periodStartOn, { year: true })} –{" "}
              {formatLocalDate(period.periodEndOn, { year: true })}
            </p>
          </div>
          <StateBadge machine="period" state={period.state} />
        </header>
      ) : null}

      {/*
        L3 MOUNTS THE APPROVAL PROGRESS HERE — `<PeriodStatePanel>`, `<PeriodTransitionBar>`,
        `<BoundaryWeeksPanel>`, `<PostLockAdjustments>`. They already exist in
        `features/hr/time/periods/components/`. Everything below this comment is L13's.
      */}

      <ExportRunPanel
        payPeriodId={periodId}
        mockCase={mockCase}
        onGenerated={history.reload}
      />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Files built for this period
        </h2>
        <ExportRunList payPeriodId={periodId} mockCase={mockCase} />
      </section>
    </div>
  );
}
