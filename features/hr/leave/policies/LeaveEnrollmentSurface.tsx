/**
 * features/hr/leave/policies/LeaveEnrollmentSurface.tsx — SPEC-LEAVE §2.8, UI-IA route 74b.
 *
 * Who is on this policy: the scope rule, the resulting roster, and the effective date.
 *
 * 🚨 THE ROSTER IS `hr_leave_balances` FILTERED TO THIS POLICY, NOT A NEW DOOR.
 * `hr_leave_policy_list` returns only a headcount; `hr.leave_balances` walks
 * `hr.leave_enrollment` for the policy and returns one row per live enrolment with the
 * person's name — which is precisely the roster, and it arrives with the five figures already
 * on it. Adding a second "list the enrolments" door would be a second answer to one question.
 *
 * 🚨 THE CANDIDATE LIST IS THE DIRECTORY, FILTERED CLIENT-SIDE AGAINST THE ROSTER.
 * `hr_directory_list` is the module's one people list; there is no server-side
 * "not enrolled in policy X" filter, so the exclusion happens here. That is safe because both
 * sides are read in full for this employer — but it is why `readAllRows`-style completeness
 * matters: the directory door is offset-paged and counted, and this surface asks for a page
 * large enough to be the whole roster and SAYS SO when the count exceeds what it fetched,
 * rather than quietly enrolling from a truncated list.
 *
 * 🚨 D8 IS THE SERVER'S, AND IT SPEAKS FOR ITSELF. A contractor is never auto-enrolled;
 * `hr.leave_enroll` skips them with `contractor_not_auto_enrolled` and the result names every
 * skip with its reason. This surface renders those outcomes per person — 47 enrolled and 3
 * skipped is the correct result of a batch of 50, never all-or-nothing.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, UserPlus, Users } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrSettingsShell } from "@/features/hr/settings/HrSettingsShell";
import { fetchHrDirectory } from "@/features/hr/service";
import { hrEmployeeHref } from "@/features/hr/routes";
import { isHrDenied } from "@/features/hr/types";
import type { HrDenied, HrDirectoryRow, HrFailed } from "@/features/hr/types";

import {
  enrollInLeavePolicy,
  fetchLeaveBalances,
  fetchLeavePolicies,
} from "../manager/api/service";
import type {
  LeaveBalanceRow,
  LeaveEnrollSkip,
  LeavePolicy,
} from "../manager/api/types";
import {
  LeaveAfterPendingCell,
  LeaveAfterPendingHeader,
  LeaveBookableCell,
} from "../manager/balanceFigures";
import { leaveLedgerHrefFrom, leavePolicyHref } from "../manager/routes";

/** The one page size this surface asks for. Paired with the honest "there are more" notice. */
const DIRECTORY_PAGE = 500;

/** `hr.leave_enroll`'s three skip reasons, said in words. Codes never reach page text. */
const SKIP_SENTENCE: Record<string, string> = {
  contractor_not_auto_enrolled:
    "Not added — contractors are never enrolled automatically. Adding one is a deliberate exception with a reason.",
  outside_worker_class_scope:
    "Not added — this policy does not cover their worker class.",
  already_enrolled: "Already on this policy.",
};

function skipSentence(skip: LeaveEnrollSkip): string {
  if (skip.reason && SKIP_SENTENCE[skip.reason]) return SKIP_SENTENCE[skip.reason];
  return skip.detail ?? "Not added, and the server did not say why.";
}

export function LeaveEnrollmentSurface({ policyId }: { policyId: string }) {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [policy, setPolicy] = useState<LeavePolicy | null>(null);
  const [roster, setRoster] = useState<LeaveBalanceRow[]>([]);
  const [directory, setDirectory] = useState<HrDirectoryRow[]>([]);
  const [directoryTotal, setDirectoryTotal] = useState<number | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [skips, setSkips] = useState<LeaveEnrollSkip[] | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!organizationId) return;
      setLoading(true);

      const [policies, balances, people] = await Promise.all([
        fetchLeavePolicies(organizationId, { signal }),
        fetchLeaveBalances(
          { organizationId, scope: "organization", leavePolicyId: policyId },
          { signal },
        ),
        fetchHrDirectory({
          organizationId,
          filter: { status: ["active"] },
          limit: DIRECTORY_PAGE,
          offset: 0,
        }),
      ]);
      if (signal.aborted) return;

      if (policies.ok) {
        setPolicy(policies.data.policies.find((p) => p.id === policyId) ?? null);
        setCanWrite(policies.data.canWrite);
        setError(null);
      } else {
        setError(policies);
      }

      // The roster and the directory are supporting reads: a refusal on either leaves that
      // panel empty with its own sentence rather than taking the whole page down.
      setRoster(balances.ok ? balances.data.rows : []);
      if (people.ok) {
        setDirectory(people.data.rows);
        setDirectoryTotal(people.data.total);
      } else {
        setDirectory([]);
        setDirectoryTotal(null);
      }

      setLoading(false);
    },
    [organizationId, policyId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  const enrolledIds = useMemo(
    () => new Set(roster.map((row) => row.employmentId).filter((id): id is string => !!id)),
    [roster],
  );

  /**
   * Candidates: active people with a live spell who are not already on this policy.
   * Somebody with no `employment_id` (a prehire whose spell has not started) is excluded —
   * `hr.leave_enroll` takes employment ids, and enrolling a person who has none is not a
   * thing the door can do.
   *
   * 🚨 `!= null`, NOT `!== null`. Since `hr_l1_65` the directory door OMITS `employment_id`
   * entirely for a viewer below the working-record tier, so the absent case is `undefined`
   * and a strict `!== null` would have called it present. This surface always runs at
   * `leave_administrator` standing and so always receives the field — but a comparison that
   * is only correct because of who happens to open the screen is not a comparison.
   */
  const candidates = useMemo(
    () =>
      directory.filter(
        (row) => row.employment_id != null && !enrolledIds.has(row.employment_id),
      ),
    [directory, enrolledIds],
  );

  const truncated =
    directoryTotal !== null && directoryTotal > directory.length ? directoryTotal : null;

  async function enrol() {
    if (!policy || selectedIds.length === 0) return;
    setBusy(true);
    setWriteError(null);
    setSkips(null);

    const result = await enrollInLeavePolicy({
      leavePolicyId: policy.id,
      employmentIds: selectedIds,
      effectiveFrom: effectiveFrom.trim() || null,
    });
    setBusy(false);

    if (!result.ok) {
      setWriteError(
        isHrDenied(result)
          ? (result.detail ?? "Nobody was enrolled.")
          : result.message,
      );
      return;
    }

    const enrolled = result.data.enrolled ?? 0;
    setSkips(result.data.skipped);
    setSelectedIds([]);
    toast.success(
      result.data.skipped.length > 0
        ? `${enrolled} enrolled, ${result.data.skipped.length} not added`
        : `${enrolled} enrolled`,
    );
    setReloadToken((n) => n + 1);
  }

  const candidateColumns: MatrxColumnDef<HrDirectoryRow>[] = [
    {
      id: "name",
      accessorFn: (row) => row.display_name,
      header: "Person",
      sortable: true,
      filter: "text",
      cell: (row) => (
        <Link
          href={hrEmployeeHref(row.employee_id, null, { org: orgRef })}
          className="block truncate font-medium text-foreground hover:underline"
        >
          {row.display_name}
        </Link>
      ),
    },
    {
      id: "job_title",
      accessorFn: (row) => row.job_title ?? "",
      header: "Job title",
      sortable: true,
      filter: "select",
    },
    {
      id: "department",
      accessorFn: (row) => row.department ?? "",
      header: "Department",
      sortable: true,
      filter: "select",
    },
    {
      id: "location",
      accessorFn: (row) => row.location ?? "",
      header: "Location",
      sortable: true,
      filter: "select",
    },
    {
      id: "worker_class",
      accessorFn: (row) => row.worker_class ?? "",
      header: "Worker class",
      sortable: true,
      filter: "select",
      cell: (row) =>
        row.worker_class === "contractor" ? (
          <Badge variant="outline">contractor</Badge>
        ) : (
          <span className="text-muted-foreground">{row.worker_class ?? "—"}</span>
        ),
    },
  ];

  const rosterColumns: MatrxColumnDef<LeaveBalanceRow>[] = [
    {
      id: "name",
      accessorFn: (row) => row.employeeName ?? "",
      header: "Person",
      sortable: true,
      filter: "text",
      cell: (row) => {
        const href = leaveLedgerHrefFrom(row.ledgerHref, orgRef);
        if (!href) {
          return (
            <span className="font-medium text-foreground">
              {row.employeeName ?? "Not provided"}
            </span>
          );
        }
        return (
          <Link href={href} className="font-medium text-foreground hover:underline">
            {row.employeeName ?? "Not provided"}
          </Link>
        );
      },
    },
    /*
      🚨 THE THIRD SCREEN THE WORD "AVAILABLE" APPEARS ON, AND IT NOW MEANS THE SAME THING.

      This roster is `LeaveBalanceRow` — the same shape the balances desk and the employee's own
      tile render — and it was rendering `row.available`, §5's accounting identity, under the
      caption the other two use for `bookable_now`. It was also the least honest of the three: no
      rounding, and a negative identity would have printed as a plain `-24 h` in ordinary body
      text with nothing to mark it. Both cells are now the shared ones.
    */
    {
      id: "available",
      accessorFn: (row) => row.bookableNow ?? Number.NEGATIVE_INFINITY,
      header: "Available",
      sortable: true,
      filter: false,
      cell: (row) => <LeaveBookableCell row={row} />,
    },
    {
      id: "after-pending",
      accessorFn: (row) => row.available ?? Number.NEGATIVE_INFINITY,
      header: <LeaveAfterPendingHeader />,
      sortable: true,
      filter: false,
      cell: (row) => <LeaveAfterPendingCell row={row} />,
    },
  ];

  return (
    <HrSettingsShell
      section="leave-policies"
      loading={loading}
      error={error}
      operation="This policy's enrolment"
      onRetry={() => setReloadToken((n) => n + 1)}
    >
      <div className="space-y-4 p-4 sm:p-6">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
            <Link href={leavePolicyHref(policyId, orgRef)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to the policy
            </Link>
          </Button>
          <h1 className="text-base font-semibold text-foreground">
            Who is on {policy?.name ?? "this policy"}
          </h1>
          <p className="text-xs leading-relaxed text-muted-foreground">
            An enrolment is effective-dated and there is exactly one live enrolment per person
            per policy. The policy year is stamped when somebody is enrolled and never moves
            afterwards — moving it would re-cut a carry-over boundary that has already happened.
          </p>
        </div>

        {/* ── The roster ───────────────────────────────────────────────── */}

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="h-4 w-4 text-muted-foreground" />
            On this policy now
          </h2>
          <MatrxDataTable<LeaveBalanceRow>
            data={roster}
            columns={rosterColumns}
            getRowId={(row) => `${row.employmentId ?? "unknown"}-${row.policyId ?? policyId}`}
            isLoading={loading}
            pageSize={25}
            emptyState={{
              title: "Nobody is enrolled yet",
              description:
                "Until somebody is enrolled, this policy earns nobody anything and nobody can request against it.",
            }}
          />
        </section>

        {/* ── Adding people ────────────────────────────────────────────── */}

        {canWrite ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  Add people
                </h2>
                <p className="text-xs text-muted-foreground">
                  {policy && policy.workerClassScope.length > 0
                    ? `This policy covers ${policy.workerClassScope.join(", ")}. Anyone outside that is skipped, with a reason.`
                    : "This policy has no worker-class limit, so anyone can be added — except contractors, who are never enrolled automatically."}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="leave-enrol-from" className="text-xs">
                    Effective from
                  </Label>
                  <Input
                    id="leave-enrol-from"
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button
                  type="button"
                  disabled={busy || selectedIds.length === 0}
                  onClick={() => void enrol()}
                  className="min-h-11 sm:min-h-9"
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Enrol {selectedIds.length > 0 ? selectedIds.length : ""}
                </Button>
              </div>
            </div>

            {truncated ? (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                This employer has {truncated} active people and this list shows the first{" "}
                {directory.length}. Use the column filters to find somebody who is not here.
              </p>
            ) : null}

            {writeError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
              >
                <p className="text-sm text-destructive">{writeError}</p>
              </div>
            ) : null}

            {/* Per-person outcomes. Never folded into a count. */}
            {skips && skips.length > 0 ? (
              <div className="space-y-1.5 rounded-md border border-border bg-card p-3">
                <p className="text-sm font-medium text-foreground">
                  {skips.length} {skips.length === 1 ? "person was" : "people were"} not added
                </p>
                <ul className="space-y-1">
                  {skips.map((skip, index) => {
                    const person = directory.find(
                      (row) => row.employment_id === skip.employmentId,
                    );
                    return (
                      <li
                        key={`${skip.employmentId ?? "unknown"}-${index}`}
                        className="text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {person?.display_name ?? "Somebody on this list"}
                        </span>{" "}
                        — {skipSentence(skip)}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <MatrxDataTable<HrDirectoryRow>
              data={candidates}
              columns={candidateColumns}
              getRowId={(row) => row.employment_id ?? row.employee_id}
              isLoading={loading}
              pageSize={25}
              emptyState={{
                title: "Everyone active is already on this policy",
                description:
                  "People without a live spell are not listed — an enrolment needs one.",
              }}
              selection={{
                selectedIds,
                onSelectedIdsChange: setSelectedIds,
                noun: "person",
              }}
            />
          </section>
        ) : null}
      </div>
    </HrSettingsShell>
  );
}
