/**
 * features/hr/leave/components/MyLeaveLedgerSurface.tsx — `/hr/me/time-off/[policyId]`.
 *
 * SPEC-LEAVE §12's second route: *"the employee, for their own policy — **the same
 * component**, `viewer=self`."*
 *
 * 🚨 THIS FILE IS THE HOST, NOT THE VIEW. Everything visible is `LeaveLedgerView`, which the
 * manager/HR route `/hr/leave/balances/[employmentId]/[policyId]` mounts unchanged with
 * `viewer="delegated"`. What differs between the two viewers is the doors OUT — an employee's
 * request opens on their own page, a manager's does not — so those are passed in from here as
 * builders. A second ledger table for the other viewer would be the drift this prevents.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { MeSurfaceShell } from "@/features/hr/me/MeSurfaceShell";
import { hrMeTimeOffHref, hrMeTimesheetHref } from "@/features/hr/routes";
import { isHrDenied, type HrResult } from "@/features/hr/types";

import { fetchLeaveLedger } from "../api/service";
import type { LeaveLedgerView as LeaveLedger } from "../api/types";
import { LeaveLedgerView, type LeaveLedgerFilter } from "./LeaveLedgerView";

/** The `?show=` a §5 figure's door carries. Anything unrecognised falls back to everything. */
function readFilter(value: string | null): LeaveLedgerFilter {
  return value === "added" || value === "used_taken" || value === "approved_upcoming"
    ? value
    : "all";
}

export function MyLeaveLedgerSurface({ policyId }: { policyId: string }) {
  return (
    <MeSurfaceShell
      operation="Your time-off ledger"
      noAccessSentence="A leave ledger is only ever visible to the person and to those who hold their working record."
    >
      {({ employmentId }) => (
        <LedgerBody employmentId={employmentId} policyId={policyId} />
      )}
    </MeSurfaceShell>
  );
}

function LedgerBody({
  employmentId,
  policyId,
}: {
  employmentId: string;
  policyId: string;
}) {
  const { orgRef } = useHrContext();
  const searchParams = useSearchParams();

  /** The figure that sent the reader here (§5: every figure is a door). */
  const [filter, setFilter] = useState<LeaveLedgerFilter>(() =>
    readFilter(searchParams.get("show")),
  );
  const [asOf, setAsOf] = useState<string | null>(null);
  const [result, setResult] = useState<HrResult<LeaveLedger> | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * The read. It sets no state synchronously — `loading` starts true and is cleared when the
   * answer lands, so the effect below never triggers a cascading render. Changing the as-of
   * re-reads through the SERVER's projector; nothing is recomputed here.
   */
  const load = useCallback(async () => {
    const res = await fetchLeaveLedger({ employmentId, leavePolicyId: policyId, asOf });
    setResult(res);
    setLoading(false);
  }, [employmentId, policyId, asOf]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetchLeaveLedger({ employmentId, leavePolicyId: policyId, asOf });
      if (cancelled) return;
      setResult(res);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [employmentId, policyId, asOf]);

  /** Retry is a user event, so it may put the skeleton back before re-reading. */
  const retry = useCallback(() => {
    setResult(null);
    setLoading(true);
    void load();
  }, [load]);

  const data = result?.ok ? result.data : null;
  const timeOffHref = hrMeTimeOffHref(orgRef);

  return (
    <HrPageState
      loading={loading && result === null}
      error={result && !result.ok && !isHrDenied(result) ? result : null}
      granted={result && !result.ok && isHrDenied(result) ? false : undefined}
      operation="Your time-off ledger"
      variant="table"
      onRetry={retry}
      noAccessSentence={
        result && !result.ok && isHrDenied(result)
          ? (result.detail ??
            "A leave ledger is only ever visible to the person and to those who hold their working record.")
          : undefined
      }
    >
      {data ? (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
          <Link
            href={timeOffHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to your time off
          </Link>

          <LeaveLedgerView
            ledger={data}
            policyName={data.figures.policyName}
            viewer="self"
            filter={filter}
            onFilterChange={setFilter}
            asOf={asOf ?? data.asOf}
            onAsOfChange={setAsOf}
            /*
              An employee's own request opens on their own time-off page, where the request
              list renders it and `#request-<id>` scrolls to it.
            */
            requestHref={(id) => `${timeOffHref}#request-${id}`}
            /*
              A `per_hours_worked` accrual points at the week that earned it. The employee's
              timesheet is the surface that holds their worked weeks; there is no per-workweek
              route in the product, so this opens the timesheet rather than naming a week with
              nowhere to go.
            */
            workweekHref={() => hrMeTimesheetHref(orgRef)}
          />
        </div>
      ) : null}
    </HrPageState>
  );
}
