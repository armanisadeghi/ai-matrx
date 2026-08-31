/**
 * features/hr/leave/manager/LeaveBalancesSurface.tsx — SPEC-LEAVE §5.1, UI-IA route 44.
 *
 * 🚨 THE VIEW LAW. `hr.leave_balances` CLAMPS the scope server-side — asking for
 * `organization` as a manager returns `team`, and as an employee returns `mine` — and hands
 * back `scope_label` in words. That label is rendered exactly as it arrives. A list that shows
 * a scope selector the server then quietly overrides is a list that lies about what it is
 * showing.
 *
 * 🚨 THE FIVE FIGURES ARE THE SERVER'S, AND `null` IS NOT `0`. Each column reads one figure
 * from `hr.leave_figures`; an unlimited policy carries none of them and renders the WORD, never
 * a zero and never a bar. A figure the server did not send says so.
 *
 * ── THE FIVE STATES (§5.1) ──────────────────────────────────────────────────
 * `loaded`, `empty`, `filtered-empty` and `negative-flagged` are all here. The fifth,
 * **`unlawful-config blocked`**, is NOT — and that is a data gap, not an omission of taste:
 * the red "Unlawful in &lt;state&gt;" chip is driven by `hr.compliance_exception` rows, and
 * `hr_leave_balances` returns no compliance state on a row (verified against the live function
 * body, 2026-08-27). Painting rows green by its silence would be a fabrication on the exact
 * screen §5.1 wants the warning on. The state ships when the door carries it.
 *
 * ── THE FILTERS THAT EXIST, AND THE ONES THAT DO NOT ────────────────────────
 * The live door reads exactly two keys out of `p_filters`: `leave_policy_id` and
 * `negative_only`. §5.1 also lists department, location, manager, capped-out and
 * expiring-carryover. Those controls are ABSENT rather than wired to keys the server ignores —
 * a filter chip that returns the unfiltered list is worse than no chip. The policy options are
 * derived from the rows themselves rather than from `hr_leave_policy_list`, which refuses a
 * caller with no HR role: the filter therefore works for a manager exactly as it does for HR.
 *
 * ── EXPORT ──────────────────────────────────────────────────────────────────
 * §5.1's audited export needs a door that writes the `hr.access_audit` row with its
 * `row_count`. There is none for balances. An unaudited client-side CSV of everybody's balances
 * is precisely the export that must not exist, so there is no export control.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Pencil, RefreshCw, TriangleAlert } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  hrPersonEntityRef,
  hrPersonMenuSection,
  leaveBalanceRowTarget,
} from "@/features/hr/people/hr-person-menu";

import {
  LeaveAfterPendingCell,
  LeaveAfterPendingHeader,
  LeaveBookableCell,
  LeaveFigureCell,
} from "./balanceFigures";
import { fetchLeaveBalances } from "./api/service";
import type { LeaveBalanceList, LeaveBalanceRow } from "./api/types";
import { LeaveAdjustDialog } from "./LeaveAdjustDialog";
import { hrPageRefusalProps } from "./refusal";
import { LeaveDeskShell } from "./LeaveDeskShell";
import { leaveBalancesHref, leaveLedgerHrefFrom } from "./routes";

type Scope = "mine" | "team" | "organization";

function isScope(value: string | null): value is Scope {
  return value === "mine" || value === "team" || value === "organization";
}

/** Formatting of server values. No arithmetic. */
function accrualSummary(row: LeaveBalanceRow): string {
  if (row.unlimited === true) return "Unlimited";
  if (row.accrualMethod === "none") return "Granted by hand only";
  if (row.accrualRate === null) return row.accrualMethod ?? "Not provided";
  switch (row.accrualMethod) {
    case "per_hours_worked":
      return row.accrualPerUnits === null
        ? `${row.accrualRate} h per hours worked`
        : `${row.accrualRate} h per ${row.accrualPerUnits} h worked`;
    case "per_pay_period":
      return `${row.accrualRate} h each pay period`;
    case "per_month":
      return `${row.accrualRate} h each month`;
    case "annual_lump":
      return `${row.accrualRate} h each policy year`;
    case "anniversary_lump":
      return `${row.accrualRate} h each anniversary`;
    default:
      return `${row.accrualRate} h`;
  }
}

export function LeaveBalancesSurface() {
  const { active, orgRef } = useHrContext();
  const router = useRouter();
  const params = useSearchParams();
  const organizationId = active?.organization_id ?? null;

  const scopeParam = params?.get("scope") ?? null;
  const scope: Scope = isScope(scopeParam) ? scopeParam : "organization";
  const policyParam = params?.get("policy") ?? null;
  const negativeOnly = params?.get("negative") === "1";

  const [list, setList] = useState<LeaveBalanceList | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [adjusting, setAdjusting] = useState<LeaveBalanceRow | null>(null);
  const [contextRow, setContextRow] = useState<LeaveBalanceRow | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!organizationId) return;
      setLoading(true);
      const result = await fetchLeaveBalances(
        { organizationId, scope, leavePolicyId: policyParam, negativeOnly },
        { signal },
      );
      if (signal.aborted) return;
      if (result.ok) {
        setList(result.data);
        setError(null);
      } else {
        setError(result);
      }
      setLoading(false);
    },
    [organizationId, scope, policyParam, negativeOnly],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadToken]);

  const rows = list?.rows ?? [];

  /**
   * Policy options, derived from the rows the caller can actually see. Deliberately NOT from
   * `hr_leave_policy_list`, which refuses anyone with no HR role — a manager would get an
   * empty policy menu on a list full of policies.
   */
  const policyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (row.policyId) seen.set(row.policyId, row.policyName ?? row.policyId);
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [rows]);

  const negativeCount = rows.filter(
    (row) => row.ledgerBalance !== null && row.ledgerBalance < 0,
  ).length;

  const filtersActive = policyParam !== null || negativeOnly;

  function navigate(next: { scope?: Scope; policy?: string | null; negative?: boolean }) {
    router.replace(
      leaveBalancesHref(orgRef, {
        scope: next.scope ?? scope,
        policy: next.policy === undefined ? policyParam : next.policy,
        negative: next.negative === undefined ? negativeOnly : next.negative,
      }),
    );
  }

  const columns: MatrxColumnDef<LeaveBalanceRow>[] = [
    {
      id: "employee",
      accessorFn: (row) => row.employeeName ?? "",
      header: "Employee",
      sortable: true,
      filter: "text",
      cell: (row) => {
        const href = leaveLedgerHrefFrom(row.ledgerHref, orgRef);
        return (
          <div className="min-w-0">
            {href ? (
              <Link
                href={href}
                className="block truncate font-medium text-foreground hover:underline"
              >
                {row.employeeName ?? "Not provided"}
              </Link>
            ) : (
              <span className="block truncate font-medium text-foreground">
                {row.employeeName ?? "Not provided"}
              </span>
            )}
            {/* The server's sentence, verbatim. Never composed here. */}
            {row.sentence ? (
              <span className="block text-xs leading-snug text-muted-foreground">
                {row.sentence}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "policy",
      accessorFn: (row) => row.policyName ?? "",
      header: "Policy",
      sortable: true,
      filter: "select",
    },
    {
      id: "accrued",
      accessorFn: (row) => row.accruedToDate ?? Number.NEGATIVE_INFINITY,
      header: "Accrued to date",
      sortable: true,
      filter: false,
      cell: (row) => <LeaveFigureCell row={row} value={row.accruedToDate} />,
    },
    {
      id: "used",
      accessorFn: (row) => row.usedTaken ?? Number.NEGATIVE_INFINITY,
      header: "Used (taken)",
      sortable: true,
      filter: false,
      cell: (row) => <LeaveFigureCell row={row} value={row.usedTaken} />,
    },
    {
      id: "upcoming",
      accessorFn: (row) => row.approvedUpcoming ?? Number.NEGATIVE_INFINITY,
      header: "Approved upcoming",
      sortable: true,
      filter: false,
      cell: (row) => <LeaveFigureCell row={row} value={row.approvedUpcoming} />,
    },
    {
      id: "pending",
      accessorFn: (row) => row.pendingApproval ?? Number.NEGATIVE_INFINITY,
      header: "Pending approval",
      sortable: true,
      filter: false,
      cell: (row) => <LeaveFigureCell row={row} value={row.pendingApproval} />,
    },
    /*
      🚨 "AVAILABLE" MEANS HERE WHAT IT MEANS ON THE EMPLOYEE'S OWN TILE, AND NOTHING ELSE.

      This column used to read `row.available` — §5's accounting identity — under the same word
      `/hr/me/time-off` uses for `bookable_now`. Round 42 clamped the employee's tile and left this
      one alone, which did not remove the negative number, it moved it onto the HR admin's screen:
      the same person read **Available 0 h** on their phone while their administrator read
      **Available −24 h** in red, with no sub-caption on either to say the two words meant two
      different quantities. The identity did not need hiding — it needed its own name, which is the
      column immediately after this one.
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
    {
      id: "accrual",
      accessorFn: (row) => accrualSummary(row),
      header: "How it is earned",
      sortable: true,
      filter: "select",
      mobileHidden: true,
    },
    {
      id: "cap",
      accessorFn: (row) => row.balanceCap ?? Number.NEGATIVE_INFINITY,
      header: "Holding cap",
      sortable: true,
      filter: false,
      mobileHidden: true,
      cell: (row) =>
        row.unlimited === true ? (
          <span className="text-muted-foreground">—</span>
        ) : row.balanceCap === null ? (
          <span className="text-muted-foreground">No cap</span>
        ) : (
          <span className="tabular-nums text-muted-foreground">{row.balanceCap} h</span>
        ),
    },
    {
      id: "flags",
      accessorFn: (row) =>
        [
          row.ledgerBalance !== null && row.ledgerBalance < 0 ? "negative" : "",
          (row.pendingBeyondBalance ?? 0) > 0 ? "overhang" : "",
          row.identityHolds === false ? "identity" : "",
        ]
          .filter(Boolean)
          .join(" "),
      header: "Flags",
      sortable: true,
      filter: "select",
      cell: (row) => {
        // The BANK itself is overdrawn — they have taken more than they earned.
        const negative = row.ledgerBalance !== null && row.ledgerBalance < 0;
        /*
          A different fact, and the one that used to reach this screen as a bare red number under
          "Available": they have ASKED for more than they hold. The bank is still positive, so
          `negative` above does not fire and the Flags column said "—" on the very row whose
          headline figure was red. Same server field the sub-captions read.
        */
        const overhang = (row.pendingBeyondBalance ?? 0) > 0;
        // The server's own verdict on §5's identity. Fires ONLY on an explicit false.
        const identityBroken = row.identityHolds === false;
        if (!negative && !overhang && !identityBroken) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {negative ? <Badge variant="destructive">Negative</Badge> : null}
            {overhang ? <Badge variant="outline">Asked beyond balance</Badge> : null}
            {identityBroken ? (
              <Badge variant="destructive">Figures do not add up</Badge>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <LeaveDeskShell
      title="Time off"
      description="Decisions waiting on you, the balances behind them, and who is out."
    >
      <HrPageState
        loading={loading}
        {...hrPageRefusalProps(error)}
        operation="Leave balances"
        onRetry={() => setReloadToken((n) => n + 1)}
        variant="table"
      >
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {/*
                THE VIEW LAW, rendered in the server's own words. The buttons ASK for a scope;
                the label states what the server actually returned.
              */}
              {(["mine", "team", "organization"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={option === scope ? "secondary" : "ghost"}
                  className="h-8"
                  onClick={() => navigate({ scope: option })}
                >
                  {option === "mine" ? "Mine" : option === "team" ? "My team" : "Organization"}
                </Button>
              ))}
              {list?.scopeLabel ? (
                <span className="text-xs text-muted-foreground">
                  Showing: {list.scopeLabel}
                </span>
              ) : null}
            </div>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setReloadToken((n) => n + 1)}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="leave-balances-policy" className="text-xs">
                Policy
              </Label>
              <Select
                value={policyParam ?? "__all__"}
                onValueChange={(value) =>
                  navigate({ policy: value === "__all__" ? null : value })
                }
              >
                <SelectTrigger id="leave-balances-policy" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Every policy</SelectItem>
                  {policyOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 pb-2 text-xs text-foreground">
              <Checkbox
                checked={negativeOnly}
                onCheckedChange={(checked) => navigate({ negative: checked === true })}
              />
              Only negative balances
            </label>
          </div>

          {negativeCount > 0 && !negativeOnly ? (
            <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-500">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              {negativeCount} {negativeCount === 1 ? "person is" : "people are"} carrying a
              negative balance.
            </p>
          ) : null}

          <NonEditableContextMenu
            sourceFeature="internal"
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={(target) => {
              const id = (target as HTMLElement | null)
                ?.closest("[data-row-id]")
                ?.getAttribute("data-row-id");
              const row =
                (id &&
                  rows.find(
                    (r) =>
                      `${r.employmentId ?? "unknown"}-${r.policyId ?? "unknown"}` ===
                      id,
                  )) ||
                null;
              setContextRow(row);
              if (!row) return null;
              const menuTarget = leaveBalanceRowTarget(row, orgRef);
              return {
                [CONTEXT_MENU_ENTITY_KEY]: hrPersonEntityRef(menuTarget),
                content: [
                  menuTarget.name,
                  row.policyName ?? "",
                  row.sentence ?? "",
                ]
                  .filter(Boolean)
                  .join("\n"),
              };
            }}
            extraSections={
              contextRow
                ? [
                    hrPersonMenuSection(
                      leaveBalanceRowTarget(contextRow, orgRef),
                      {
                        onAdjustBalance: list?.canAdjust
                          ? () => setAdjusting(contextRow)
                          : undefined,
                      },
                    ),
                  ]
                : []
            }
          >
          <MatrxDataTable<LeaveBalanceRow>
            data={rows}
            columns={columns}
            getRowId={(row) => `${row.employmentId ?? "unknown"}-${row.policyId ?? "unknown"}`}
            isLoading={loading}
            pageSize={25}
            emptyState={
              filtersActive
                ? {
                    title: "Nothing matches these filters",
                    description:
                      "Clear the policy filter or the negative-only tick to see the full list.",
                    action: (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => navigate({ policy: null, negative: false })}
                      >
                        Clear the filters
                      </Button>
                    ),
                  }
                : {
                    title: "No balances to show",
                    description:
                      "A balance exists once somebody is enrolled in a leave policy. Nobody in this scope is.",
                  }
            }
            rowActions={(row) =>
              // ABSENT, not disabled: a manager never adjusts a balance, so there is no
              // control for one to click and be refused.
              list?.canAdjust ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAdjusting(row)}
                >
                  <Pencil className="mr-1.5 h-4 w-4" />
                  Adjust
                </Button>
              ) : null
            }
          />
          </NonEditableContextMenu>
        </div>
      </HrPageState>

      <LeaveAdjustDialog
        row={adjusting}
        ledgerHref={leaveLedgerHrefFrom(adjusting?.ledgerHref ?? null, orgRef)}
        onClose={() => setAdjusting(null)}
        onAdjusted={() => setReloadToken((n) => n + 1)}
      />
    </LeaveDeskShell>
  );
}
