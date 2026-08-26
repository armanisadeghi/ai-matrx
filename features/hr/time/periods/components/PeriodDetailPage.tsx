"use client";

/**
 * features/hr/time/periods/components/PeriodDetailPage.tsx — route 33's client body.
 *
 * The four things this page must make visible, all of which are laws rather than features:
 *   1. Two state machines, labelled distinctly — `PeriodStatePanel`.
 *   2. The boundary weeks, named and explained in words — `BoundaryWeeksPanel`.
 *   3. The payroll export, with the format registry read from the server and the supersede control
 *      absent once acknowledged — `ExportPanel`.
 *   4. The post-lock adjustment lane as the only edit door after lock — `PostLockAdjustments`.
 *
 * 🚨 ROLE VARIATIONS (§2.7): manager read-only and only their own reports; HR admin every
 * transition EXCEPT export; payroll admin everything including export, acknowledge and fail. The
 * role is resolved from the caller's HR capabilities — never from a guess and never from the URL.
 */

import { useHrContext } from "@/features/hr/shared/useHrContext";
import { ExportPanel } from "../../exports/components/ExportPanel";
import { usePayPeriod, useTimeAdjustments } from "../hooks/usePayPeriods";
import type { PeriodViewerRole } from "../periodStateMachine";
import { BoundaryWeeksPanel } from "./BoundaryWeeksPanel";
import { useMockCase } from "./PayPeriodsPage";
import { PeriodStatePanel } from "./PeriodStatePanel";
import { PostLockAdjustments } from "./PostLockAdjustments";

/**
 * Resolve §2.7's three roles from the caller's capability list.
 *
 * Deliberately narrowing: the DEFAULT is `manager`, the read-only role. A capability we cannot see
 * resolves to the least reach, never the most — over-tightening is visible and fixable, while
 * accidentally offering a payroll administrator's controls to a manager is neither.
 */
export function resolvePeriodRole(capabilities: string[]): PeriodViewerRole {
  if (capabilities.includes("payroll.export")) return "payroll_admin";
  if (capabilities.includes("time.approve_period") || capabilities.includes("hr.admin")) {
    return "hr_admin";
  }
  return "manager";
}

export function PeriodDetailPage({ payPeriodId }: { payPeriodId: string }) {
  const hr = useHrContext();
  const mockCase = useMockCase();
  const { period, isLoading, failure, reload } = usePayPeriod(payPeriodId, mockCase);
  const adjustments = useTimeAdjustments(payPeriodId, mockCase);

  const role = resolvePeriodRole(hr.capabilities);
  const organizationId = hr.active?.organization_id ?? null;
  const todayLocalDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-[1200px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {failure ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {failure.userMessage}
          </p>
        ) : null}

        {isLoading && !period ? (
          <div className="rounded-lg border border-border bg-card p-4 text-[12px] text-muted-foreground">
            Loading this pay period…
          </div>
        ) : null}

        {period ? (
          <>
            <PeriodStatePanel
              period={period}
              role={role}
              // The knob is the server's to resolve; `true` here is the platform default and is
              // superseded the moment the resolved value is available on the period read.
              allowPeriodReopen
              todayLocalDate={todayLocalDate}
              mockCase={mockCase}
              onTransitioned={reload}
            />

            <BoundaryWeeksPanel boundaryWorkweekIds={period.boundaryWorkweekIds} />

            {organizationId ? (
              <ExportPanel
                period={period}
                organizationId={organizationId}
                canExport={role === "payroll_admin"}
                mockCase={mockCase}
              />
            ) : (
              <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
                Choose an employer to see this period&apos;s payroll exports.
              </p>
            )}

            <PostLockAdjustments
              period={period}
              rows={adjustments.page?.rows ?? []}
              isLoading={adjustments.isLoading}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
