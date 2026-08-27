"use client";

/**
 * features/hr/time/periods/components/PeriodDetailPage.tsx — route 33's client body.
 *
 * The four things this page must make visible, all of which are laws rather than features:
 *   1. Two state machines, labelled distinctly — `PeriodStatePanel`.
 *   2. The boundary weeks, named and explained in words — `BoundaryWeeksPanel`.
 *   3. The payroll export, with the format registry read from the server and the supersede control
 *      unavailable-with-the-reason once acknowledged — L13's `ExportRunPanel` + `ExportRunList`.
 *   4. The post-lock adjustment lane as the only edit door after lock — `PostLockAdjustments`.
 *
 * 🚨 ROLE VARIATIONS (§2.7): manager read-only and only their own reports; HR admin every
 * transition EXCEPT export; payroll admin everything including export, acknowledge and fail. The
 * role is resolved from the caller's HR capabilities — never from a guess and never from the URL.
 *
 * 🚨 THE EXPORT SURFACES HERE ARE LANE L13's COMPONENTS, MOUNTED — NOT THIS LANE's.
 * `<ExportRunPanel>` and `<ExportRunList>` come from `features/hr/exports/`, which owns the
 * payroll-export engine seam (register item HRB-025). This lane briefly carried a second set at
 * `features/hr/time/exports/`; the coordinator ruled 2026-08-26 that L13's wins, and that fork was
 * DELETED rather than deprecated — no shim, no fallback, no twin ([no-legacy](/policies/no-legacy.md)).
 * Read `features/hr/exports/FEATURE.md` before changing anything about the export half of this page.
 */

import { useState } from "react";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import { ExportRunList } from "@/features/hr/exports/components/ExportRunList";
import { ExportRunPanel } from "@/features/hr/exports/components/ExportRunPanel";
import { usePayPeriod, useTimeAdjustments } from "../hooks/usePayPeriods";
import type { PeriodViewerRole } from "../periodStateMachine";
import { BoundaryWeeksPanel } from "./BoundaryWeeksPanel";
import { useMockCase } from "./PayPeriodsPage";
import { PeriodStatePanel } from "./PeriodStatePanel";
import { PostLockAdjustments } from "./PostLockAdjustments";

/**
 * 🚨 THE TWO CAPABILITY TOKENS THE SERVER ACTUALLY USES. `hr.pay_period_transition` decides in one
 * line — `case when p_to_state = 'exported' then 'payroll.export' else 'payroll.read' end` — so
 * every transition except export is gated on **`payroll.read`**, and nothing else.
 *
 * These are constants rather than inline strings because getting them wrong is invisible: a
 * capability token that does not exist is not a compile error and not a runtime error, it is
 * silently `false` forever.
 */
const CAP_EXPORT = "payroll.export";
const CAP_TRANSITION = "payroll.read";

/**
 * Resolve §2.7's three roles from the caller's capability list.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS FUNCTION WAS THE S4 BLOCKER: THE SUBMIT BUTTON WAS INERT.
 *
 * It used to test `time.approve_period` and `hr.admin`. **Neither capability exists** — the live
 * set in `hr.access_role` has 37 tokens and those are not among them, so the `hr_admin` branch
 * could never be reached and every viewer without `payroll.export` collapsed to `manager`, the
 * read-only role. Every transition control rendered DISABLED. A verifier clicked Submit, nothing
 * happened, and probing `hr_pay_period_transition` directly succeeded — because the door was fine
 * and only the client's idea of who may knock was wrong.
 *
 * The lesson worth keeping: an invented capability token fails CLOSED and SILENTLY. There is no
 * error anywhere — the string simply never matches, the button greys out, and the surface looks
 * like a considered permission decision instead of a typo. That is why the tokens are now
 * constants checked against the server's own rule, and why the mapper-style discipline
 * (verify against the live definition, never against a guess) applies to authority too.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Still deliberately narrowing: the DEFAULT is `manager`. A capability we cannot see resolves to
 * the least reach — but "cannot see" must now mean the capability is genuinely absent, not that we
 * were looking for a name nobody issues.
 */
export function resolvePeriodRole(capabilities: string[]): PeriodViewerRole {
  if (capabilities.includes(CAP_EXPORT)) return "payroll_admin";
  if (capabilities.includes(CAP_TRANSITION)) return "hr_admin";
  return "manager";
}

export function PeriodDetailPage({ payPeriodId }: { payPeriodId: string }) {
  const hr = useHrContext();
  const mockCase = useMockCase();
  const { period, isLoading, failure, reload } = usePayPeriod(payPeriodId, mockCase);
  const adjustments = useTimeAdjustments(payPeriodId, mockCase);

  // Bumped when a build is accepted, so the history beside the panel re-reads the truth from the
  // reader rather than trusting the 202 — the durable record is the `hr.payroll_export` row.
  const [exportToken, setExportToken] = useState(0);

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
              /*
               * 🚨 THE RESOLVED KNOB, not a client-side guess. `hr_pay_period_get` returns
               * `reopen_allowed` — the resolved `hr.time_and_attendance.allow_period_reopen`. This
               * used to be hard-coded `true`, which would have offered Reopen to an organization
               * that had switched it off. A cast was hiding the field's existence.
               */
              allowPeriodReopen={period.reopenAllowed}
              /* The server's own wording, verbatim, in preference to ours. */
              reopenNotice={period.reopenNotice}
              todayLocalDate={todayLocalDate}
              mockCase={mockCase}
              onTransitioned={reload}
            />

            <BoundaryWeeksPanel
              boundaryWorkweekIds={period.boundaryWorkweekIds}
              /* Server-authored sentence; the panel falls back to its own only when absent. */
              boundaryNote={period.boundaryNote}
            />

            {organizationId ? (
              <>
                {/*
                  Export is the PAYROLL ADMINISTRATOR's alone (§2.7): an HR admin performs every
                  period transition EXCEPT export. The build panel is therefore mounted only for
                  that role, while the history below stays visible to everyone who can read the
                  period — seeing what was sent is not the same authority as sending it.
                */}
                {role === "payroll_admin" ? (
                  <ExportRunPanel
                    payPeriodId={period.id}
                    mockCase={mockCase}
                    onGenerated={() => setExportToken((token) => token + 1)}
                  />
                ) : (
                  <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
                    Building, accepting and failing a payroll file is the payroll
                    administrator&apos;s. Every version and its state is below.
                  </p>
                )}
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold text-foreground">Export history</h3>
                  <ExportRunList
                    payPeriodId={period.id}
                    mockCase={mockCase}
                    refreshToken={exportToken}
                  />
                </div>
              </>
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
