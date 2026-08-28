/**
 * features/hr/leave/manager/LeaveLedgerSurface.tsx — SPEC-LEAVE §12, UI-IA route 44a.
 *
 * `/hr/leave/balances/[employmentId]/[policyId]` — the ledger audit view for one person on one
 * policy. This is the screen that answers a wage claim, a payroll dispute, and "where did my
 * four hours go?".
 *
 * 🚨 IT WRAPS THE CANONICAL COMPONENT AND ADDS NOTHING. `LeaveLedgerView` is ONE component for
 * two routes: `/hr/me/time-off/[policyId]` renders it with `viewer="self"`, and this route
 * renders THE SAME component with `viewer="delegated"`. It owns the running-balance assertion,
 * the reversal pairing, the unexplained-entry chip, the as-of picker and the §5 figure block.
 * A second table here would be a second answer to a question that must have exactly one.
 *
 * 🚨 THE DOORS OUT ARE THIS ROUTE'S, WHICH IS WHY THE COMPONENT TAKES BUILDERS.
 * `LeaveLedgerView` knows no URLs on purpose. What is passed in:
 *  • `requestHref` → `/hr/leave?request=<id>`. That is the door `hr.leave_calendar` itself
 *    builds for a manager, and `LeaveQueueSurface` answers it in words when the request is no
 *    longer waiting on anybody — so it is a real door, not a link into an empty list.
 *  • `workweekHref` → **null, deliberately.** A `per_hours_worked` accrual entry names the
 *    `hr.workweek` it came from, and no route in this product opens a workweek by its id
 *    (`/hr/time/timesheets/[employmentId]` opens a PAY PERIOD's sheet, which is a different
 *    object). A door that lands on the wrong week is worse than a cell with no door, because
 *    the reader cannot tell it is wrong. When a workweek route exists, this is a one-line
 *    change.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import { fetchLeaveLedger } from "../api/service";
import type { LeaveLedgerView as LeaveLedger } from "../api/types";
import {
  LeaveLedgerView,
  type LeaveLedgerFilter,
} from "../components/LeaveLedgerView";
import { LeaveDeskShell } from "./LeaveDeskShell";
import { leaveBalancesHref, leaveLedgerHref, leaveQueueHref } from "./routes";

function isFilter(value: string | null): value is LeaveLedgerFilter {
  return value === "all" || value === "added" || value === "used";
}

export function LeaveLedgerSurface({
  employmentId,
  policyId,
}: {
  employmentId: string;
  policyId: string;
}) {
  const { orgRef } = useHrContext();
  const router = useRouter();
  const params = useSearchParams();

  const showParam = params?.get("show") ?? null;
  const filter: LeaveLedgerFilter = isFilter(showParam) ? showParam : "all";
  const asOfParam = params?.get("as_of") ?? null;

  const [ledger, setLedger] = useState<LeaveLedger | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      const result = await fetchLeaveLedger(
        { employmentId, leavePolicyId: policyId, asOf: asOfParam },
        { signal },
      );
      if (signal.aborted) return;
      if (result.ok) {
        setLedger(result.data);
        setError(null);
      } else {
        setError(result);
      }
      setLoading(false);
    },
    [employmentId, policyId, asOfParam],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  /**
   * The as-of re-reads SERVER-SIDE — `hr.leave_ledger_view(p_as_of)` truncates the entries and
   * recomputes the five figures with the same projector the request validator uses. Filtering
   * the already-fetched rows in the browser would be a second implementation of that
   * arithmetic, which §5 names as a defect outright.
   */
  function setAsOf(next: string | null) {
    router.replace(leaveLedgerHref(employmentId, policyId, orgRef, { asOf: next, show: filter }));
  }

  function setFilter(next: LeaveLedgerFilter) {
    router.replace(
      leaveLedgerHref(employmentId, policyId, orgRef, { asOf: asOfParam, show: next }),
    );
  }

  return (
    <LeaveDeskShell
      title="Time off"
      description="Decisions waiting on you, the balances behind them, and who is out."
    >
      <HrPageState
        loading={loading}
        error={error}
        operation="This leave ledger"
        onRetry={() => setReloadToken((n) => n + 1)}
        variant="table"
      >
        <div className="space-y-4 p-4 sm:p-6">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
            <Link href={leaveBalancesHref(orgRef)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              All balances
            </Link>
          </Button>

          {ledger ? (
            <LeaveLedgerView
              ledger={ledger}
              policyName={ledger.figures.policyName}
              viewer="delegated"
              filter={filter}
              onFilterChange={setFilter}
              asOf={ledger.asOf}
              onAsOfChange={setAsOf}
              requestHref={(leaveRequestId) =>
                leaveQueueHref(orgRef, { request: leaveRequestId })
              }
            />
          ) : null}
        </div>
      </HrPageState>
    </LeaveDeskShell>
  );
}
