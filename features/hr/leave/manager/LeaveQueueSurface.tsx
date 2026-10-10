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
 * not a toast. Copy selection includes every row; decision targets retain the flow's bulk rule.
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

import { useEffect, useState } from "react";
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

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextInputDialog } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";

import { HrPageState } from "@/features/hr/shared/HrStates";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { HrEmployerLabel, HrOrgFilter, useHrEmployerNames } from "@/features/hr/shared/hrScope";
import { HrRefusalNotice } from "@/features/hr/tasks/components/HrRefusalNotice";
import { bulkDecide } from "@/features/hr/tasks/service";
import { relativeDue } from "@/features/hr/tasks/urgency";
import {
  hrTaskStepEntityRef,
  buildHrTaskStepMenuSection,
} from "@/features/hr/tasks/task-step-actions";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
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
import { replaceAddressOrNavigate } from "@/lib/url-state/addressWithoutNavigating";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { readOf } from "@ai-matrx/design-system";
import { HrLaneTabs } from "@/features/hr/shared/HrLaneTabs";
import type { ListScopeKind } from "@/lib/list-scope/types";

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
    label: "My Orgs",
    sentence: "Every open time-off decision in this organization.",
  },
];

/** This door's scope keys, in the shell's lane words (the org-wide queue is My Orgs). */
const QUEUE_LANE: Record<HrInboxScope, ListScopeKind> = { mine: "mine", team: "team", queue: "orgs" };
const LANE_QUEUE_KEY: Partial<Record<ListScopeKind, HrInboxScope>> = { mine: "mine", team: "team", orgs: "queue" };

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
  const { orgRef, scope: hrScope } = useHrContext();
  const { spansEmployers, nameOf } = useHrEmployerNames();
  const router = useRouter();
  const params = useSearchParams();

  const scopeParam = params?.get("scope") ?? null;
  // A query string is user input, so it is VALIDATED rather than asserted.
  const scope: HrInboxScope = scopeParam && isScope(scopeParam) ? scopeParam : "mine";
  /**
   * 🚨 `?request=` IS THE DOOR THE SERVER ITSELF BUILDS. `hr.leave_calendar` returns
   * `href = '/hr/leave?request=<id>'` for a manager or an admin, and the §12 ledger's `usage`
   * rows point here too. So this route ANSWERS that parameter: it narrows to the request when
   * it is still waiting on a decision, and says so in words when it is not. Ignoring it would
   * turn every one of those links into a landing on an unrelated list — which is how a door
   * becomes a dead end without anything going red.
   */
  const requestParam = params?.get("request") ?? null;

  const queue = useLeaveQueue(scope, hrScope.orgFilter);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // A ticked row the filter has just hidden must not stay in a bulk decision.
  useEffect(() => {
    setSelectedIds([]);
  }, [hrScope.orgFilter]);
  const [decision, setDecision] = useState<{
    row: LeaveQueueRow;
    intent: "approve" | "reject" | "return";
  } | null>(null);
  const [reassign, setReassign] = useState<LeaveQueueRow | null>(null);
  const [bulkReasonOpen, setBulkReasonOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkOutcomes, setBulkOutcomes] = useState<HrBulkOutcome[] | null>(null);
  const [bulkRefusal, setBulkRefusal] = useState<HrRefusal | null>(null);
  const [contextRow, setContextRow] = useState<LeaveQueueRow | null>(null);
  const [othersContextRow, setOthersContextRow] = useState<LeaveQueueRow | null>(null);

  function menuRowFor(row: LeaveQueueRow) {
    return {
      stepId: row.step_id,
      label: row.subject_withheld
        ? "Withheld"
        : (row.subject_label ?? row.title ?? row.flow_key),
      deepLink: row.deep_link,
    };
  }

  /** The decision verbs already on the row's own buttons — right-click parity. */
  function decisionSection(row: LeaveQueueRow): ContextMenuExtraSection {
    const items: ContextMenuExtraItem[] = [
      {
        kind: "item",
        id: "leave-approve",
        label: "Approve",
        icon: Check,
        onSelect: () => setDecision({ row, intent: "approve" }),
      },
      {
        kind: "item",
        id: "leave-deny",
        label: "Deny",
        icon: X,
        onSelect: () => setDecision({ row, intent: "reject" }),
      },
      {
        kind: "item",
        id: "leave-return",
        label: "Send back for changes",
        icon: Undo2,
        onSelect: () => setDecision({ row, intent: "return" }),
      },
      // Reassigning lists one employer's people: the row's own employer.
      ...(row.organization_id
        ? [
            {
              kind: "item" as const,
              id: "leave-reassign",
              label: "Reassign",
              icon: UserCog,
              onSelect: () => setReassign(row),
            },
          ]
        : []),
    ];
    return { id: "leave-decision", label: "Decide", items };
  }

  const scopeMeta = SCOPES.find((s) => s.key === scope) ?? SCOPES[0];

  const focused = requestParam
    ? queue.mine.filter((row) => row.request?.id === requestParam)
    : queue.mine;
  // Copy selection is independent of the existing batch-decision rule.
  const currentSelectedIds = focused.filter((row) => selectedIds.includes(row.step_id)).map((row) => row.step_id);
  const bulkIds = focused.filter((row) => currentSelectedIds.includes(row.step_id) && row.allow_bulk_decide === true).map((row) => row.step_id);
  /** The link resolved to nothing decidable — a real answer, not an empty list. */
  const focusMissed = requestParam !== null && !queue.loading && focused.length === 0;
  const visibleScopes = SCOPES.filter(
    (s) => s.key !== "queue" || queue.meta?.can_view_queue === true,
  );

  function setScope(next: HrInboxScope) {
    setSelectedIds([]);
    replaceAddressOrNavigate(router, leaveQueueHref(orgRef, { scope: next }));
  }

  async function runBulk(intent: "approve" | "reject", reason?: string) {
    if (bulkIds.length === 0) return;
    setBulkBusy(true);
    setBulkRefusal(null);
    setBulkOutcomes(null);
    try {
      const envelope = await bulkDecide(
        bulkIds,
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
    ...(spansEmployers
      ? [
          {
            id: "employer",
            accessorFn: (row: LeaveQueueRow) => nameOf(row.organization_id) ?? "",
            header: "Organization",
            // Narrowing by organization is the page's own visible filter, not a column menu.
            filter: false as const,
            cell: (row: LeaveQueueRow) => {
              const name = nameOf(row.organization_id);
              return name ? (
                <HrEmployerLabel name={name} />
              ) : (
                <span className="text-muted-foreground">—</span>
              );
            },
          } satisfies MatrxColumnDef<LeaveQueueRow>,
        ]
      : []),
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
      accessorFn: (row) => row.request?.requestedHours ?? null,
      header: "Hours",
      sortable: true,
      filter: "number",
      cell: (row) => (
        <span className="tabular-nums text-foreground">
          {hoursLabel(row.request?.requestedHours)}
        </span>
      ),
    },
    {
      id: "balance",
      accessorFn: (row) => row.request?.conflictCheck?.projectedBalanceAtStart ?? null,
      header: "Balance on the start date",
      sortable: true,
      filter: "number",
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
      accessorFn: (row) => {
        const check = row.request?.conflictCheck;
        return check ? check.hard.length + check.advisory.length : null;
      },
      header: "What the checks found",
      sortable: true,
      filter: "number",
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
        employerScope="all"
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
              <HrLaneTabs
                lanes={visibleScopes.map((option) => QUEUE_LANE[option.key])}
                active={QUEUE_LANE[scope]}
                onChange={(lane) => setScope(LANE_QUEUE_KEY[lane] ?? "mine")}
              />
              <span className="ml-1 text-xs text-muted-foreground">
                {scopeMeta.sentence}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <HrOrgFilter />
            <Button
              icon={<RefreshCw />}
              type="button"
              variant="quiet"
              onClick={() => void queue.reload()}
            >
              Refresh
            </Button>
            </div>
          </div>

          {queue.refusal ? (
            <HrRefusalNotice refusal={queue.refusal} action="This view" />
          ) : null}

          {queue.partiallyHydrated ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Some rows below could not load their leave details — the dates, hours and checks
              are not readable to you for those people. The decision itself still works.
              <ErrorAlchemyMenu />
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

          {requestParam ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
              <p className="text-sm text-foreground">
                {focusMissed
                  ? "That time-off request is not waiting on a decision any more. It may already have been decided, cancelled, or handed to somebody else."
                  : "Showing one request you followed a link to."}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => replaceAddressOrNavigate(router, leaveQueueHref(orgRef, { scope }))}
              >
                Show everything waiting
              </Button>
            </div>
          ) : null}

          <NonEditableContextMenu
            sourceFeature="internal"
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={(target) => {
              const id = (target as HTMLElement | null)
                ?.closest("[data-row-id]")
                ?.getAttribute("data-row-id");
              const row = (id && focused.find((r) => r.step_id === id)) || null;
              setContextRow(row);
              if (!row) return null;
              return {
                [CONTEXT_MENU_ENTITY_KEY]: hrTaskStepEntityRef(menuRowFor(row)),
                content: [
                  row.subject_withheld ? "Withheld" : (row.subject_label ?? row.title ?? ""),
                  spanLabel(row),
                ]
                  .filter(Boolean)
                  .join("\n"),
              };
            }}
            extraSections={
              contextRow
                ? [
                    buildHrTaskStepMenuSection(menuRowFor(contextRow)),
                    decisionSection(contextRow),
                  ]
                : []
            }
          >
          <MatrxDataTable<LeaveQueueRow>
            data={focused}
            columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: (row) => (
              <>
                <Button
                  icon={<Check />}
                  type="button"
                  variant="quiet"
                  onClick={() => setDecision({ row, intent: "approve" })}
                >
                  Approve
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button icon={<MoreHorizontal />} type="button" variant="quiet" aria-label="More decisions" />
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
                    {row.organization_id ? (
                      <DropdownMenuItem onSelect={() => setReassign(row)}>
                        <UserCog className="mr-2 h-4 w-4" />
                        Reassign
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) }]}
            getRowId={(row) => row.step_id}
            isLoading={queue.loading}
            pageSize={25}
            read={readOf(queue, { what: "the time-off queue", onRetry: queue.reload })}
            emptyState={{
              title: "No time off is waiting on you",
              description:
                scope === "mine"
                  ? "When somebody who reports to you asks for time off, it lands here."
                  : "Nothing in this scope is waiting on a decision right now.",
            }}
            selection={{
              selectedIds: currentSelectedIds,
              onSelectedIdsChange: setSelectedIds,
              noun: "request",
              actions: () => (
                <div className="flex items-center gap-2">
                  <Button
                    icon={<Check />}
                    variant="primary"
                    type="button"
                    disabled={bulkBusy || bulkIds.length === 0}
                    onClick={() => void runBulk("approve")}
                  >
                    Approve {bulkIds.length}
                  </Button>
                  <Button
                    icon={<X />}
                    type="button"
                    variant="danger"
                    disabled={bulkBusy || bulkIds.length === 0}
                    onClick={() => setBulkReasonOpen(true)}
                  >
                    Deny {bulkIds.length}
                  </Button>
                </div>
              ),
            }}

          />
          </NonEditableContextMenu>

          {/* The other scopes' rows: waiting on somebody, not on me. Read-only, no actions. */}
          {queue.others.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">
                Waiting on somebody else
              </h2>
              <NonEditableContextMenu
                sourceFeature="internal"
                contentSource={{ type: "raw" }}
                contextData={{ content: "" }}
                resolveContextOnOpen={(target) => {
                  const id = (target as HTMLElement | null)
                    ?.closest("[data-row-id]")
                    ?.getAttribute("data-row-id");
                  const row =
                    (id && queue.others.find((r) => r.step_id === id)) || null;
                  setOthersContextRow(row);
                  if (!row) return null;
                  return {
                    [CONTEXT_MENU_ENTITY_KEY]: hrTaskStepEntityRef(menuRowFor(row)),
                    content: [
                      row.subject_withheld ? "Withheld" : (row.subject_label ?? row.title ?? ""),
                      spanLabel(row),
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  };
                }}
                extraSections={
                  othersContextRow
                    ? [buildHrTaskStepMenuSection(menuRowFor(othersContextRow))]
                    : []
                }
              >
              <MatrxDataTable<LeaveQueueRow>
                data={queue.others}
                columns={columns}
                getRowId={(row) => row.step_id}
                pageSize={10}
                read={readOf(queue, { what: "the time-off queue", onRetry: queue.reload })}
                emptyState={{ title: "Nothing else open in this scope" }}
              />
              </NonEditableContextMenu>
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
        organizationId={reassign?.organization_id ?? null}
        onClose={() => setReassign(null)}
        onDecided={() => void queue.reload(true)}
      />

      <TextInputDialog
        open={bulkReasonOpen}
        onOpenChange={setBulkReasonOpen}
        // read-gate-exempt: counts the requests the manager selected for this denial
        title={`Deny ${bulkIds.length} ${bulkIds.length === 1 ? "request" : "requests"}`}
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
