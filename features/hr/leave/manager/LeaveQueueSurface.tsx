/**
 * features/hr/leave/manager/LeaveQueueSurface.tsx — SPEC-LEAVE §4.4, UI-IA route 42.
 *
 * THE DECISION SURFACE. Scoped to the approver's reports, defaulting to pending.
 *
 * 🚨 THIS IS A PROJECTION, NOT A SECOND QUEUE. The rows come from `public.hr_wf_inbox` through
 * `features/hr/tasks/service.ts` (see `useLeaveQueue.ts`), and every action is
 * `public.hr_wf_decide` through the same service. What is different here is the COLUMNS: the
 * task inbox shows a step, and §4.4 wants the leave facts — employee, type, dates, hours, the
 * balance, the advisory findings, and whether a case is involved. Those columns are the whole
 * reason the route exists; they are not a second queue and they store nothing.
 *
 * 🚨 "PENDING" NEEDS NO FILTER. `hr.wf_pending` returns steps whose `state = 'active'` — a step
 * waiting on a decision IS pending, by definition. A "status" control here would be a filter
 * over a set that only ever holds one status.
 *
 * 🚨 BULK IS PER-STEP, NEVER ALL-OR-NOTHING. `hr_wf_bulk_decide` returns one outcome per step;
 * 47 successes and 3 typed conflicts is the CORRECT result of a bulk of 50, and this surface
 * renders each skip with its own reason rather than folding it into a count. A flow whose
 * definition forbids bulk refuses the whole batch (`WF_BULK_FORBIDDEN`) — also rendered, also
 * not a toast. The selection checkbox is ABSENT on a row whose flow forbids bulk.
 *
 * 🚨 THE BALANCE NUMBER ON A ROW IS THE SERVER'S, AND IT IS LABELLED FOR WHAT IT IS.
 * §4.4 asks for "balance after". `hr.leave_wf_validate` freezes `projected_balance_at_start`
 * onto the request and, when approving would go negative, writes the resulting balance INTO an
 * advisory sentence ("Approving this leaves a balance of −4 hours."). It does not return a
 * standing "balance after" figure. So the column shows the projected balance on the start date
 * — the server's own number, under the server's own meaning — and the resulting balance is
 * whatever the validator said in words. Subtracting the request from the balance here would be
 * a screen doing its own arithmetic on a balance, which §0 forbids in as many words.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  CircleAlert,
  Clock,
  EyeOff,
  MoreHorizontal,
  RefreshCw,
  Undo2,
  UserCog,
  X,
} from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrRefusalNotice } from "@/features/hr/tasks/components/HrRefusalNotice";
import { bulkDecide } from "@/features/hr/tasks/service";
import { relativeDue } from "@/features/hr/tasks/urgency";
import {
  HR_DECISION_VERB,
  isRefusal,
  type HrBulkOutcome,
  type HrInboxScope,
  type HrRefusal,
} from "@/features/hr/tasks/types";

import { LeaveDecisionDialog, LeaveReassignDialog } from "./LeaveDecisionDialogs";
import { LeaveDeskShell } from "./LeaveDeskShell";
import { leaveQueueHref } from "./routes";
import { useLeaveQueue, type LeaveQueueRow } from "./useLeaveQueue";

/** THE VIEW LAW: every list declares its scope in words. */
const SCOPES: { key: HrInboxScope; label: string; sentence: string }[] = [
  { key: "mine", label: "Mine", sentence: "Time off waiting on your decision." },
  {
    key: "team",
    label: "My team",
    sentence: "Time off waiting on somebody who reports to you.",
  },
  {
    key: "queue",
    label: "Organization",
    sentence: "Every open time-off decision in this organization.",
  },
];

function isScope(value: string): value is HrInboxScope {
  return value === "mine" || value === "team" || value === "queue";
}

/** Dates, formatted. Nothing here computes a duration. */
function spanLabel(row: LeaveQueueRow): string {
  const request = row.request;
  if (!request?.startsOn) return "Not provided";
  if (!request.endsOn || request.endsOn === request.startsOn) return request.startsOn;
  return `${request.startsOn} → ${request.endsOn}`;
}

function hoursLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not provided" : `${value} h`;
}

export function LeaveQueueSurface() {
  const { active, orgRef } = useHrContext();
  const router = useRouter();
  const params = useSearchParams();
  const organizationId = active?.organization_id ?? null;

  const scopeParam = params?.get("scope") ?? null;
  // A query string is user input, so it is VALIDATED rather than asserted.
  const scope: HrInboxScope = scopeParam && isScope(scopeParam) ? scopeParam : "mine";

  const queue = useLeaveQueue(scope);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decision, setDecision] = useState<{
    row: LeaveQueueRow;
    intent: "approve" | "reject" | "return";
  } | null>(null);
  const [reassign, setReassign] = useState<LeaveQueueRow | null>(null);
  const [bulkReasonOpen, setBulkReasonOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOutcomes, setBulkOutcomes] = useState<HrBulkOutcome[] | null>(null);
  const [bulkRefusal, setBulkRefusal] = useState<HrRefusal | null>(null);

  const scopeMeta = SCOPES.find((s) => s.key === scope) ?? SCOPES[0];
  const visibleScopes = SCOPES.filter(
    (s) => s.key !== "queue" || queue.meta?.can_view_queue === true,
  );

  function setScope(next: HrInboxScope) {
    setSelectedIds([]);
    router.replace(leaveQueueHref(orgRef, { scope: next }));
  }

  async function runBulk(intent: "approve" | "reject", reason?: string) {
    setBulkBusy(true);
    setBulkRefusal(null);
    setBulkOutcomes(null);
    try {
      const envelope = await bulkDecide(
        selectedIds,
        HR_DECISION_VERB[intent],
        reason ?? null,
      );
      if (isRefusal(envelope)) {
        setBulkRefusal(envelope);
        return;
      }
      setBulkOutcomes(envelope.data.results);
      setSelectedIds([]);
      toast.success(
        `${envelope.data.succeeded} decided${
          envelope.data.skipped ? `, ${envelope.data.skipped} not decided` : ""
        }`,
      );
      await queue.reload(true);
    } catch (cause) {
      setBulkRefusal({
        granted: false,
        reason: "transport_failed",
        detail:
          cause instanceof Error
            ? cause.message
            : "We could not reach the workflow engine. Nothing was decided.",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  const columns: MatrxColumnDef<LeaveQueueRow>[] = [
    {
      id: "employee",
      accessorFn: (row) => row.subject_label ?? row.title ?? "",
      header: "Employee",
      sortable: true,
      filter: "text",
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={row.deep_link}
            className="block truncate font-medium text-foreground hover:underline"
          >
            {row.subject_withheld
              ? "Withheld"
              : (row.subject_label ?? row.title ?? row.flow_key)}
          </Link>
          <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            {row.sensitivity_tier === "restricted" ? (
              <EyeOff className="h-3 w-3 shrink-0" aria-label="Restricted" />
            ) : null}
            {row.flow_key === "leave_cancellation"
              ? "Wants to cancel approved time off"
              : (row.step_label ?? "Time-off request")}
          </span>
        </div>
      ),
    },
    {
      id: "type",
      accessorFn: (row) => row.request?.policyName ?? "",
      header: "Type",
      sortable: true,
      filter: "select",
      cell: (row) =>
        row.request?.policyName ? (
          <span className="text-foreground">{row.request.policyName}</span>
        ) : (
          <span className="text-muted-foreground">Not provided</span>
        ),
    },
    {
      id: "dates",
      accessorFn: (row) => row.request?.startsOn ?? "",
      header: "Dates",
      sortable: true,
      filter: "text",
      cell: (row) => (
        <div className="min-w-0">
          <span className="block truncate text-foreground">{spanLabel(row)}</span>
          {row.request?.isPartialDay ? (
            <span className="text-xs text-muted-foreground">Part of a day</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "hours",
      accessorFn: (row) => row.request?.requestedHours ?? Number.NEGATIVE_INFINITY,
      header: "Hours",
      sortable: true,
      filter: false,
      cell: (row) => (
        <span className="tabular-nums text-foreground">
          {hoursLabel(row.request?.requestedHours)}
        </span>
      ),
    },
    {
      id: "balance",
      accessorFn: (row) =>
        row.request?.conflictCheck?.projectedBalanceAtStart ?? Number.NEGATIVE_INFINITY,
      header: "Balance on the start date",
      sortable: true,
      filter: false,
      mobileHidden: true,
      cell: (row) => {
        const projected = row.request?.conflictCheck?.projectedBalanceAtStart;
        if (projected === null || projected === undefined) {
          return <span className="text-muted-foreground">Not provided</span>;
        }
        return (
          <span
            className={
              projected < 0
                ? "tabular-nums text-destructive"
                : "tabular-nums text-foreground"
            }
          >
            {projected} h
          </span>
        );
      },
    },
    {
      id: "findings",
      accessorFn: (row) =>
        (row.request?.conflictCheck?.hard.length ?? 0) +
        (row.request?.conflictCheck?.advisory.length ?? 0),
      header: "What the checks found",
      sortable: true,
      filter: false,
      cell: (row) => {
        const check = row.request?.conflictCheck;
        if (!check) {
          return (
            <span className="text-xs text-muted-foreground">
              The checks for this request are not readable from here.
            </span>
          );
        }
        const findings = [...check.hard, ...check.advisory].filter((f) => f.message);
        if (findings.length === 0) {
          return <span className="text-xs text-muted-foreground">Nothing flagged.</span>;
        }
        return (
          <ul className="min-w-0 space-y-0.5">
            {/* VERBATIM. The validator's sentence, never a code, never a summary of it. */}
            {findings.map((finding, index) => (
              <li
                key={`${finding.code ?? "finding"}-${index}`}
                className="text-xs leading-snug text-muted-foreground"
              >
                {finding.message}
              </li>
            ))}
          </ul>
        );
      },
    },
    {
      id: "case",
      accessorFn: (row) => (row.request?.leaveCaseLinked ? "yes" : "no"),
      header: "Managed by HR",
      sortable: true,
      filter: "select",
      mobileHidden: true,
      cell: (row) =>
        // 🚨 §9.6 — AN EXISTENCE STATEMENT ONLY. No category, no certification state, no
        // entitlement, and no door to the case. A manager must know an absence exists to
        // route work around it, and must never know why.
        row.request?.leaveCaseLinked ? (
          <span className="text-xs leading-snug text-muted-foreground">
            This person has an approved leave. Details are held by HR.
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "due_at",
      accessorKey: "due_at",
      header: "Due",
      sortable: true,
      filter: "auto",
      mobileHidden: true,
      cell: (row) => (
        <span
          className={
            row.due_at && new Date(row.due_at) < new Date()
              ? "inline-flex items-center gap-1 text-destructive"
              : "inline-flex items-center gap-1 text-muted-foreground"
          }
        >
          {row.urgent ? <CircleAlert className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {relativeDue(row.due_at)}
        </span>
      ),
    },
  ];

  return (
    <LeaveDeskShell
      title="Time off"
      description="Decisions waiting on you, the balances behind them, and who is out."
    >
      <HrPageState
        loading={queue.loading}
        error={queue.error}
        operation="Time-off decisions"
        onRetry={() => void queue.reload()}
        variant="table"
      >
        <div className="space-y-4 p-4 sm:p-6">
          {/* THE VIEW LAW — the scope, in words, above the list it describes. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1">
              {visibleScopes.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={option.key === scope ? "secondary" : "ghost"}
                  className="h-8"
                  onClick={() => setScope(option.key)}
                >
                  {option.label}
                </Button>
              ))}
              <span className="ml-1 text-xs text-muted-foreground">
                {scopeMeta.sentence}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => void queue.reload()}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>

          {queue.refusal ? (
            <HrRefusalNotice refusal={queue.refusal} action="This view" />
          ) : null}

          {queue.partiallyHydrated ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Some rows below could not load their leave details — the dates, hours and checks
              are not readable to you for those people. The decision itself still works.
            </p>
          ) : null}

          {bulkRefusal ? (
            <HrRefusalNotice refusal={bulkRefusal} action="That batch" />
          ) : null}

          {/* Per-step outcomes. A skip is shown with its reason, never folded into a count. */}
          {bulkOutcomes && bulkOutcomes.some((o) => !o.granted) ? (
            <div className="space-y-1.5 rounded-md border border-border bg-card p-3">
              <p className="text-sm font-medium text-foreground">
                {bulkOutcomes.filter((o) => !o.granted).length} of {bulkOutcomes.length} were
                not decided
              </p>
              <ul className="space-y-1">
                {bulkOutcomes
                  .filter((o) => !o.granted)
                  .map((outcome) => (
                    <li key={outcome.step_id} className="text-xs text-muted-foreground">
                      {outcome.detail ??
                        "The engine refused this one and did not say why, which is itself a defect."}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <MatrxDataTable<LeaveQueueRow>
            data={queue.mine}
            columns={columns}
            getRowId={(row) => row.step_id}
            isLoading={queue.loading}
            pageSize={25}
            emptyState={{
              title: "No time off is waiting on you",
              description:
                scope === "mine"
                  ? "When somebody who reports to you asks for time off, it lands here."
                  : "Nothing in this scope is waiting on a decision right now.",
            }}
            selection={{
              selectedIds,
              onSelectedIdsChange: setSelectedIds,
              noun: "request",
              // ABSENT, not disabled, on a flow whose definition forbids bulk: a checkbox you
              // can tick and then be refused is worse than no checkbox.
              isRowSelectable: (row) => row.allow_bulk_decide === true,
              actions: () => (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={bulkBusy}
                    onClick={() => void runBulk("approve")}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Approve {selectedIds.length}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={bulkBusy}
                    onClick={() => setBulkReasonOpen(true)}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Deny {selectedIds.length}
                  </Button>
                </div>
              ),
            }}
            rowActions={(row) => (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDecision({ row, intent: "approve" })}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Approve
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="sm" variant="ghost" aria-label="More decisions">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => setDecision({ row, intent: "reject" })}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Deny
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDecision({ row, intent: "return" })}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Send back for changes
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setReassign(row)}>
                      <UserCog className="mr-2 h-4 w-4" />
                      Reassign
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          />

          {/* The other scopes' rows: waiting on somebody, not on me. Read-only, no actions. */}
          {queue.others.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                Waiting on somebody else
              </h2>
              <MatrxDataTable<LeaveQueueRow>
                data={queue.others}
                columns={columns}
                getRowId={(row) => row.step_id}
                pageSize={10}
                emptyState={{ title: "Nothing else open in this scope" }}
              />
            </section>
          ) : null}

          {queue.meta?.bulk_max ? (
            <p className="text-xs text-muted-foreground">
              Up to {queue.meta.bulk_max} requests can be decided at once. Each one is decided
              separately — some can go through while others come back with a reason.
            </p>
          ) : null}
        </div>
      </HrPageState>

      <LeaveDecisionDialog
        row={decision?.row ?? null}
        intent={decision?.intent ?? null}
        onClose={() => setDecision(null)}
        onDecided={() => void queue.reload(true)}
      />

      <LeaveReassignDialog
        row={reassign}
        organizationId={organizationId}
        onClose={() => setReassign(null)}
        onDecided={() => void queue.reload(true)}
      />

      <TextInputDialog
        open={bulkReasonOpen}
        onOpenChange={setBulkReasonOpen}
        title={`Deny ${selectedIds.length} ${selectedIds.length === 1 ? "request" : "requests"}`}
        description="Every person you deny reads this reason. The engine refuses a denial without one."
        multiline
        rows={3}
        confirmLabel="Deny them"
        busy={bulkBusy}
        onConfirm={async (reason) => {
          setBulkReasonOpen(false);
          await runBulk("reject", reason);
        }}
      />
    </LeaveDeskShell>
  );
}
