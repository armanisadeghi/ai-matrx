/**
 * features/hr/leave/policies/LeavePolicyListSurface.tsx — SPEC-LEAVE §2.1, UI-IA route 74.
 *
 * The policy list: name, kind, accrual-method summary, enrolled headcount (a DOOR), and
 * active/draft. Every policy name opens the editor; every headcount opens the enrolment
 * roster; the empty state opens the create door, because that is the moment somebody is most
 * likely to act.
 *
 * 🚨 WHAT IS DELIBERATELY NOT ON THIS SCREEN, AND WHY.
 * §2.1 also asks for a *"lawfulness state per operating jurisdiction"* and §2.6 for a red
 * **Unlawful in &lt;state&gt;** chip that is a door to the rejection dialog. That chip is driven
 * by `hr.compliance_exception` rows opened by the re-validation on hire and transfer —
 * and `hr_leave_policy_list` returns no compliance state at all (verified against the live
 * function body, 2026-08-27). Rendering a green "lawful" chip from its silence would be a
 * fabrication on the one screen whose job is to say when a policy is not lawful, and running
 * `hr_leave_policy_validate` per row from the browser would put the client's opinion where a
 * compliance record belongs. So the column is ABSENT until the door carries the state, and the
 * operating jurisdictions are named at the top so an admin can see which places are in scope.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe2, Plus, Users } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrSettingsShell } from "@/features/hr/settings/HrSettingsShell";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import { fetchLeavePolicies } from "../manager/api/service";
import type { LeavePolicy, LeavePolicyList } from "../manager/api/types";
import {
  LEAVE_POLICY_NEW,
  leavePolicyEnrollmentHref,
  leavePolicyHref,
} from "../manager/routes";
import { ACCRUAL_METHOD_LABEL, LEAVE_KIND_LABEL } from "./policy-form";

/**
 * The accrual summary cell. This is FORMATTING of values the server sent, not arithmetic:
 * nothing here computes a rate, and a policy whose rate the door did not send says the method
 * and stops rather than printing a zero.
 */
export function accrualSummary(policy: LeavePolicy): string {
  const method = policy.accrualMethod;
  if (method === "unlimited") return "Unlimited";
  if (method === "none") return "Granted by hand only";
  if (policy.accrualRate === null) {
    return method ? (ACCRUAL_METHOD_LABEL[method as never] ?? method) : "Not provided";
  }
  switch (method) {
    case "per_hours_worked":
      return policy.accrualPerUnits === null
        ? `${policy.accrualRate} h earned per hours worked`
        : `${policy.accrualRate} h per ${policy.accrualPerUnits} h worked`;
    case "per_pay_period":
      return `${policy.accrualRate} h each pay period`;
    case "per_month":
      return `${policy.accrualRate} h each month`;
    case "annual_lump":
      return `${policy.accrualRate} h each policy year`;
    case "anniversary_lump":
      return `${policy.accrualRate} h on each work anniversary`;
    default:
      return `${policy.accrualRate} h`;
  }
}

export function LeavePolicyListSurface() {
  const { active, orgRef } = useHrContext();
  const router = useRouter();
  const organizationId = active?.organization_id ?? null;

  const [list, setList] = useState<LeavePolicyList | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      const result = await fetchLeavePolicies(organizationId, {
        signal: controller.signal,
      });
      if (cancelled) return;
      if (result.ok) {
        setList(result.data);
        setError(null);
      } else {
        setError(result);
      }
      setLoadedFor(organizationId);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [organizationId, reloadToken]);

  const loading = organizationId !== null && loadedFor !== organizationId;
  const canWrite = list?.canWrite === true;

  const columns: MatrxColumnDef<LeavePolicy>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name ?? "",
      header: "Policy",
      sortable: true,
      filter: "text",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={leavePolicyHref(row.id, orgRef)}
            className="block truncate font-medium text-foreground hover:underline"
          >
            {row.name ?? "Untitled policy"}
          </Link>
          {row.statutoryBasisRuleClass ? (
            <span className="text-xs text-muted-foreground">
              Carries a legal minimum
            </span>
          ) : null}
        </div>
      ),
    },
    {
      id: "leave_kind",
      accessorFn: (row) =>
        row.leaveKind ? (LEAVE_KIND_LABEL[row.leaveKind] ?? row.leaveKind) : "",
      header: "Kind",
      sortable: true,
      filter: "select",
    },
    {
      id: "accrual",
      accessorFn: (row) => accrualSummary(row),
      header: "How time is earned",
      sortable: true,
      filter: "text",
    },
    {
      id: "enrolled",
      accessorFn: (row) => row.enrolledCount ?? -1,
      header: "Enrolled",
      sortable: true,
      filter: false,
      cell: (row) =>
        // §2.1: the enrolled headcount IS a door. A count the server did not send stays dark
        // rather than rendering a link to "0 people".
        row.enrolledCount === null ? (
          <span className="text-muted-foreground">Not provided</span>
        ) : (
          <Link
            href={leavePolicyEnrollmentHref(row.id, orgRef)}
            className="inline-flex items-center gap-1.5 text-foreground hover:underline"
          >
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="tabular-nums">{row.enrolledCount}</span>
          </Link>
        ),
    },
    {
      id: "status",
      accessorFn: (row) => (row.isActive ? "Active" : "Draft"),
      header: "Status",
      sortable: true,
      filter: "select",
      cell: (row) => (
        <Badge variant={row.isActive ? "secondary" : "outline"}>
          {row.isActive ? "Active" : "Draft"}
        </Badge>
      ),
    },
    {
      id: "version",
      accessorFn: (row) => row.version ?? -1,
      header: "Version",
      sortable: true,
      filter: false,
      mobileHidden: true,
      cell: (row) =>
        row.version === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums text-muted-foreground">v{row.version}</span>
        ),
    },
  ];

  return (
    <HrSettingsShell
      section="leave-policies"
      loading={loading}
      error={error}
      operation="This employer's leave policies"
      onRetry={() => setReloadToken((n) => n + 1)}
    >
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">
              Every rule that decides how time off is earned, capped, carried over and paid
              out. A policy takes effect for the people enrolled in it.
            </p>
            {list && list.operatingJurisdictions.length > 0 ? (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Globe2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Legal minimums are resolved for{" "}
                  {list.operatingJurisdictions
                    .map((j) => j.name ?? j.key)
                    .filter((name): name is string => Boolean(name))
                    .join(", ")}
                  , from where this employer has active establishments.
                </span>
              </p>
            ) : list ? (
              <p className="text-xs text-muted-foreground">
                This employer has no active establishments yet, so no legal minimums are
                resolved and nothing on a policy will be checked against one.
              </p>
            ) : null}
          </div>

          {/* ABSENT, not disabled, for a viewer who may not author (§4.2). */}
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              onClick={() => router.push(leavePolicyHref(LEAVE_POLICY_NEW, orgRef))}
            >
              <Plus className="mr-2 h-4 w-4" />
              New policy
            </Button>
          ) : null}
        </div>

        <MatrxDataTable<LeavePolicy>
          data={list?.policies ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={loading}
          pageSize={25}
          emptyState={{
            title: "No leave policies yet",
            description: canWrite
              ? "Nobody can request time off until at least one policy exists and somebody is enrolled in it."
              : "Leave policies are configured by whoever runs HR for this employer.",
            action: canWrite ? (
              <Button
                type="button"
                size="sm"
                onClick={() => router.push(leavePolicyHref(LEAVE_POLICY_NEW, orgRef))}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create the first policy
              </Button>
            ) : undefined,
          }}
          rowActions={(row) => (
            <Button asChild size="sm" variant="ghost">
              <Link href={leavePolicyHref(row.id, orgRef)}>Open</Link>
            </Button>
          )}
        />
      </div>
    </HrSettingsShell>
  );
}
