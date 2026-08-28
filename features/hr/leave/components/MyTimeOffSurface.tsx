/**
 * features/hr/leave/components/MyTimeOffSurface.tsx — `/hr/me/time-off` (UI-IA route 8).
 *
 * *"The employee's whole relationship with leave in one page: what they have, what they can
 * take, asking for it, and what happened to what they asked for."* — SPEC-LEAVE §4.1
 *
 * ONE read serves all of it: `hr_my_time_off` returns the enrolled active policies with their
 * §5 figures, the request history, and `can_request`. The surface adds no second read of the
 * same facts and computes none of them.
 *
 * 🚨 THE SHELL IS INHERITED, NOT RE-DERIVED. `MeSurfaceShell` carries the persona resolution,
 * the employer context, and — the one that matters here — `employment_id` resolved through
 * the server's AS-OF resolution, never through `hr.employee.current_employment_id`. Every
 * number on this page is entitlement, so it resolves as of the date of the fact.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { MeSurfaceShell } from "@/features/hr/me/MeSurfaceShell";
import { hrTasksHref } from "@/features/hr/routes";
import { isHrDenied, type HrResult } from "@/features/hr/types";

import { fetchLeaveReasonCategories, fetchMyTimeOff } from "../api/service";
import type { LeaveReasonCategory, MyTimeOff } from "../api/types";
import { hrMeTimeOffPolicyHref } from "../hrefs";
import { LeaveBalanceBlock } from "./LeaveBalanceBlock";
import { LeaveRequestForm } from "./LeaveRequestForm";
import { LeaveRequestList } from "./LeaveRequestList";

export function MyTimeOffSurface() {
  return (
    <MeSurfaceShell
      operation="Your time off"
      noAccessSentence="Your time off is only ever shown to you and to the people who hold your working record."
    >
      {({ employmentId }) => <TimeOffBody employmentId={employmentId} />}
    </MeSurfaceShell>
  );
}

function TimeOffBody({ employmentId }: { employmentId: string }) {
  const { orgRef } = useHrContext();
  const [result, setResult] = useState<HrResult<MyTimeOff> | null>(null);
  const [reasons, setReasons] = useState<LeaveReasonCategory[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * The read. It sets no state synchronously — `loading` starts true and is cleared when the
   * answer lands, so the effect below never triggers a cascading render.
   */
  const load = useCallback(async () => {
    const res = await fetchMyTimeOff({ employmentId });
    setResult(res);
    setLoading(false);
  }, [employmentId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchMyTimeOff({ employmentId });
      if (cancelled) return;
      setResult(res);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [employmentId]);

  /** Retry is a user event, so it may put the skeleton back before re-reading. */
  const retry = useCallback(() => {
    setResult(null);
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    /*
      The reason menu is a `platform.categories` read, not an `hr_*` door. A failure here must
      not take the page down — the balances and the history are still true — so it fails to an
      EMPTY menu, and the form's reason select simply has nothing in it, which is visible.
    */
    void fetchLeaveReasonCategories()
      .then(setReasons)
      .catch(() => setReasons([]));
  }, []);

  const data = result?.ok ? result.data : null;

  return (
    <HrPageState
      loading={loading && result === null}
      error={result && !result.ok && !isHrDenied(result) ? result : null}
      granted={result && !result.ok && isHrDenied(result) ? false : undefined}
      operation="Your time off"
      variant="cards"
      onRetry={retry}
      noAccessSentence={
        result && !result.ok && isHrDenied(result)
          ? (result.detail ??
            "Your time off is only ever shown to you and to the people who hold your working record.")
          : undefined
      }
    >
      {data ? (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
          <section className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Your balances</h2>
              {data.asOf ? (
                <span className="text-xs text-muted-foreground">As of {data.asOf}</span>
              ) : null}
            </div>

            {data.policies.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                You are not on any leave policy at this employer yet. Your HR team adds you to
                one when your time off starts to build up.
              </p>
            ) : null}

            {data.policies.map((policy) => {
              /*
                The server hands back `ledger_href` alongside the figures it explains. The
                POLICY ID is taken from it via the policy row and the employer is re-attached —
                see `hrefs.ts` for why the raw path is not linked to directly.
              */
              const ledgerHref = policy.policyId
                ? hrMeTimeOffPolicyHref(policy.policyId, orgRef)
                : null;

              return (
                <div
                  key={policy.enrollmentId ?? policy.policyId ?? policy.policyName}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <LeaveBalanceBlock
                    figures={policy}
                    sentence={policy.sentence}
                    ledgerHref={ledgerHref}
                    pendingHref="#your-requests"
                    title={policy.policyName}
                  />
                  {ledgerHref ? (
                    <Link
                      href={ledgerHref}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-2"
                    >
                      See every change to this balance
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </section>

          {/*
            🚨 ABSENCE, NOT DISABLEMENT. `can_request` is `viewer_rung === 'self'`, and
            `hr.leave_request_submit` refuses anything else with `not_self`. Somebody looking at
            this page who is not its subject gets NO FORM IN THE DOM, not a greyed one.
          */}
          {data.canRequest ? (
            <LeaveRequestForm
              employmentId={data.employmentId ?? employmentId}
              policies={data.policies}
              reasonCategories={reasons}
              onSubmitted={() => void load()}
            />
          ) : null}

          <div id="your-requests" className="scroll-mt-4">
            <LeaveRequestList requests={data.requests} onChanged={() => void load()} />
          </div>

          {/*
            ONE inbox. Leave approvals are workflow steps and the engine projects them into
            /hr/tasks; this feature builds no second queue. The link is here so the person who
            approves as well as requests has somewhere to go.
          */}
          <Link
            href={hrTasksHref(orgRef)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2"
          >
            <Inbox className="h-4 w-4" aria-hidden />
            Anything waiting on you is in your tasks
          </Link>
        </div>
      ) : null}
    </HrPageState>
  );
}
