"use client";

/**
 * Spend approvals — every agent, mandate and automation whose single run cost more than the
 * approval threshold, waiting ones first, with the first run's cost and link, what it cost
 * since, the monthly estimate, who decided and Approve / Reject with a confirm.
 * seat="admin": every organization (decides system-owned + all). seat="org": one organization's
 * own subjects (its admins decide them). Data + rules: ./spendApprovals.ts.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, History, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";
import { Badge, Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Cost } from "@/components/cost/Cost";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { toast } from "@/lib/toast";
import {
  APPROVAL_STATUS_LABEL,
  SUBJECT_KIND_LABEL,
  decideSpendApproval,
  fetchSpendApprovalHistory,
  fetchSpendApprovals,
  firstRunHref,
  subjectHref,
  type ApprovalDecision,
  type ApprovalSeat,
  type ApprovalStatus,
  type SpendApprovalEvent,
  type SpendApprovalRow,
} from "./spendApprovals";

type StatusFilter = ApprovalStatus | "all";

const STATUS_TONE: Record<ApprovalStatus, "warning" | "success" | "destructive"> = {
  waiting: "warning",
  approved: "success",
  rejected: "destructive",
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{APPROVAL_STATUS_LABEL[status]}</Badge>;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function useApprovals(orgId: string | null) {
  const [rows, setRows] = useState<SpendApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchSpendApprovals(orgId)
      .then((r) => live && setRows(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [orgId, tick]);
  return { rows, loading, error, reload: () => setTick((t) => t + 1) };
}

function HistoryList({ id }: { id: string }) {
  const [events, setEvents] = useState<SpendApprovalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetchSpendApprovalHistory(id)
      .then((e) => live && setEvents(e))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [id]);
  if (error) return <div className="text-xs text-destructive">{error}</div>;
  if (!events) return <div className="h-12 animate-pulse rounded bg-muted/50" />;
  return (
    <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
      {events.map((e) => (
        <li key={e.id} className="flex gap-2">
          <span className="shrink-0 tabular-nums text-muted-foreground">{when(e.created_at)}</span>
          <span className="font-medium">{e.action}</span>
          <span className="truncate text-muted-foreground" title={e.note ?? undefined}>
            {[e.actor_email ?? "System", e.note].filter(Boolean).join(" · ")}
          </span>
        </li>
      ))}
    </ol>
  );
}

interface Pending {
  row: SpendApprovalRow;
  decision: ApprovalDecision | "history";
}

function DecisionDialog({
  pending,
  onClose,
  onDone,
}: {
  pending: Pending | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { format } = useCostDisplay();
  const [note, setNote] = useState("");
  const [expected, setExpected] = useState("");
  const [perMonth, setPerMonth] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote("");
    setExpected(pending?.row.expected_result ?? "");
    setPerMonth(pending?.row.expected_runs_per_month != null ? String(pending.row.expected_runs_per_month) : "");
  }, [pending]);
  if (!pending) return null;
  const { row, decision } = pending;
  const name = row.subject_name ?? row.subject_id;
  const runsPerMonth = perMonth.trim() === "" ? null : Number(perMonth);
  const monthly = (runsPerMonth ?? row.runs_30d) * (row.avg_cost_since ?? row.first_run_cost);
  const titles: Record<Pending["decision"], string> = {
    approve: `Approve ${name}?`,
    reject: `Reject ${name}?`,
    reopen: `Reopen ${name}?`,
    details: name,
    history: `History — ${name}`,
  };
  const consequence: Record<Pending["decision"], string> = {
    approve: `About ${format(row.avg_cost_since ?? row.first_run_cost)} a run, ${format(monthly)} a month.`,
    reject: "Automated runs stay held.",
    reopen: "Back to waiting.",
    details: "",
    history: "",
  };
  const submit = async () => {
    if (decision === "history") return onClose();
    setBusy(true);
    try {
      await decideSpendApproval(row.id, decision, {
        note,
        expectedResult: expected,
        expectedRunsPerMonth: runsPerMonth != null && Number.isFinite(runsPerMonth) ? runsPerMonth : null,
      });
      toast.success(`${APPROVAL_STATUS_LABEL[decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "waiting"]}: ${name}`);
      onDone();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={titles[decision]}
      description={consequence[decision] || undefined}
      variant={decision === "reject" ? "destructive" : "default"}
      confirmLabel={decision === "history" ? "Close" : decision === "approve" ? "Approve" : decision === "reject" ? "Reject" : "Reopen"}
      cancelLabel={decision === "history" ? null : "Cancel"}
      busy={busy}
      onConfirm={submit}
      content={
        <div className="flex flex-col gap-3 text-sm">
          {decision === "approve" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Expected result</span>
                <ProTextarea
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  rows={2}
                  surfaceName="admin-billing-approvals"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Expected runs a month</span>
                {/* ui-exception: a raw number, not prose */}
                <input
                  inputMode="decimal"
                  value={perMonth}
                  onChange={(e) => setPerMonth(e.target.value)}
                  placeholder={String(row.runs_30d)}
                  className="h-7 rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
            </>
          )}
          {decision !== "history" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Note</span>
              <ProTextarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} surfaceName="admin-billing-approvals" />
            </label>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">History</span>
            <HistoryList id={row.id} />
          </div>
        </div>
      }
    />
  );
}

export function SpendApprovalsBoard({
  orgId,
  seat,
  orgSlug,
}: {
  orgId: string | null;
  seat: ApprovalSeat;
  orgSlug?: string;
}) {
  const { rows, loading, error, reload } = useApprovals(orgId);
  const { format } = useCostDisplay();
  const params = useSearchParams();
  const focusId = params.get("id");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pending, setPending] = useState<Pending | null>(null);

  const visible = rows.filter((r) => (focusId ? r.id === focusId : status === "all" || r.status === status));
  const waiting = rows.filter((r) => r.status === "waiting");
  const waitingMonthly = waiting.reduce((s, r) => s + r.est_monthly_cost, 0);

  const columns: MatrxColumnDef<SpendApprovalRow>[] = [
    {
      id: "subject",
      header: "Agent / mandate / automation",
      accessorFn: (r) => `${r.subject_name ?? ""} ${r.subject_id}`,
      filter: "text",
      width: 280,
      cell: (r) => {
        const href = subjectHref(r, seat, orgSlug);
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            {href ? (
              <Link href={href} className="truncate font-medium text-primary hover:underline" title={r.subject_name ?? r.subject_id}>
                {r.subject_name ?? r.subject_id}
              </Link>
            ) : (
              <span className="truncate font-medium">{r.subject_name ?? r.subject_id}</span>
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>{SUBJECT_KIND_LABEL[r.subject_kind]}</span>
              {r.seeded && <Badge tone="neutral" title="Predates the rule">Before rule</Badge>}
            </div>
            {r.subject_kind !== "agent" && r.agent_id && (
              <EntityRef token="agent" id={r.agent_id} name="Agent" />
            )}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (r) => r.status,
      filter: "select",
      filterOptions: [
        { value: "waiting", label: "Waiting" },
        { value: "approved", label: "Approved" },
        { value: "rejected", label: "Rejected" },
      ],
      width: 100,
      cell: (r) => <ApprovalStatusBadge status={r.status} />,
    },
    {
      id: "first_run_cost",
      accessorKey: "first_run_cost",
      header: "First run",
      filter: "number",
      width: 150,
      cell: (r) => {
        const href = firstRunHref(r, seat);
        return (
          <div className="flex flex-col text-xs">
            <Cost usd={r.first_run_cost} className="font-semibold tabular-nums text-red-600" />
            {href ? (
              <Link href={href} className="text-primary hover:underline">
                {when(r.first_run_at)}
              </Link>
            ) : (
              <span className="text-muted-foreground" title="No saved run">
                {when(r.first_run_at)}
              </span>
            )}
            <span className="truncate text-muted-foreground" title={r.first_run_models.join(", ")}>
              {[`${r.first_run_turns} turns`, r.first_run_models[0]].filter(Boolean).join(" · ")}
            </span>
          </div>
        );
      },
    },
    {
      id: "runs_since",
      accessorKey: "runs_since",
      header: "Runs since",
      filter: "number",
      width: 90,
      cell: (r) => <span className="tabular-nums text-xs">{r.runs_since}</span>,
    },
    {
      id: "avg_cost_since",
      accessorFn: (r) => r.avg_cost_since ?? 0,
      header: "Avg since",
      filter: "number",
      width: 100,
      cell: (r) => (r.avg_cost_since == null ? <span className="text-xs text-muted-foreground">—</span> : <Cost usd={r.avg_cost_since} className="tabular-nums text-xs" />),
    },
    {
      id: "max_cost_since",
      accessorFn: (r) => r.max_cost_since ?? 0,
      header: "Max since",
      filter: "number",
      width: 100,
      cell: (r) => (r.max_cost_since == null ? <span className="text-xs text-muted-foreground">—</span> : <Cost usd={r.max_cost_since} className="tabular-nums text-xs" />),
    },
    {
      id: "est_monthly_cost",
      accessorKey: "est_monthly_cost",
      header: "Est. / month",
      filter: "number",
      width: 110,
      cell: (r) => (
        <span title={r.expected_runs_per_month != null ? `${r.expected_runs_per_month} runs a month (expected)` : `${r.runs_30d} runs in 30 days`}>
          <Cost usd={r.est_monthly_cost} className="tabular-nums text-xs font-medium" />
        </span>
      ),
    },
    {
      id: "blocked_runs",
      accessorKey: "blocked_runs",
      header: "Held",
      filter: "number",
      width: 70,
      cell: (r) => (
        <span className={`tabular-nums text-xs ${r.blocked_runs > 0 ? "font-semibold text-amber-600" : "text-muted-foreground"}`} title={r.last_blocked_at ? `Last held ${when(r.last_blocked_at)}` : undefined}>
          {r.blocked_runs}
        </span>
      ),
    },
    {
      id: "who",
      header: "Who / org",
      accessorFn: (r) => `${r.first_run_person_email ?? ""} ${r.organization_name ?? ""}`,
      filter: "text",
      width: 200,
      cell: (r) => (
        <div className="flex min-w-0 flex-col text-xs">
          <span className="truncate">{r.first_run_person_email ?? "Unknown person"}</span>
          {seat === "admin" ? (
            <EntityRef token="organization" id={r.organization_id} name={r.organization_name ?? "Organization"} />
          ) : (
            <span className="truncate text-muted-foreground">{r.organization_name}</span>
          )}
        </div>
      ),
    },
    {
      id: "decided",
      header: "Decided",
      accessorFn: (r) => r.decided_at ?? "",
      filter: "text",
      width: 180,
      cell: (r) =>
        r.decided_at ? (
          <div className="flex min-w-0 flex-col text-xs">
            <span className="truncate">{r.decided_by_email ?? "—"}</span>
            <span className="text-muted-foreground">{when(r.decided_at)}</span>
            {r.expected_result && <span className="truncate text-muted-foreground" title={r.expected_result}>{r.expected_result}</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      accessorFn: () => "",
      width: 200,
      cell: (r) => (
        <div className="flex items-center gap-1">
          {r.can_decide && r.status !== "approved" && (
            <Button variant="outline" onClick={() => setPending({ row: r, decision: "approve" })} aria-label="Approve">
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          {r.can_decide && r.status !== "rejected" && (
            <Button variant="outline" onClick={() => setPending({ row: r, decision: "reject" })} aria-label="Reject">
              <X className="h-4 w-4" />
            </Button>
          )}
          {r.can_decide && r.status !== "waiting" && (
            <Button variant="quiet" onClick={() => setPending({ row: r, decision: "reopen" })} aria-label="Reopen">
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button variant="quiet" onClick={() => setPending({ row: r, decision: "history" })} aria-label="History">
            <History className="h-4 w-4" />
          </Button>
          {!r.can_decide && <span className="text-[10px] text-muted-foreground">Platform decides</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      )}
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={visible}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          emptyState={{ title: focusId ? "That approval is not in this view" : "No spend approvals" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search agents, mandates, automations…",
            actions: (
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {`${waiting.length} waiting · ${format(waitingMonthly)}/mo`}
                </span>
                {focusId ? (
                  <Button variant="outline" asChild>
                    <Link href="?">Show all</Link>
                  </Button>
                ) : (
                  <SegmentedControl<StatusFilter>
                    aria-label="Status"
                    value={status}
                    onValueChange={setStatus}
                    data={[
                      { value: "all", label: "All" },
                      { value: "waiting", label: "Waiting" },
                      { value: "approved", label: "Approved" },
                      { value: "rejected", label: "Rejected" },
                    ]}
                  />
                )}
                <Button variant="outline" onClick={reload} disabled={loading} aria-label="Refresh">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Spend approval",
            listLabel: "Spend approvals (this view)",
            location: seat === "admin" ? "/administration/billing/approvals" : "/organizations/admin/spend-approvals",
            rowKind: "spend-approval",
            listKind: "spend-approval",
            humanRow: (r) =>
              [
                `${SUBJECT_KIND_LABEL[r.subject_kind]}: ${r.subject_name ?? r.subject_id}`,
                `Status: ${APPROVAL_STATUS_LABEL[r.status]}`,
                `First run: ${format(r.first_run_cost)} on ${when(r.first_run_at)}`,
                `Since: ${r.runs_since} runs, avg ${r.avg_cost_since == null ? "—" : format(r.avg_cost_since)}, max ${r.max_cost_since == null ? "—" : format(r.max_cost_since)}`,
                `Est. monthly: ${format(r.est_monthly_cost)}`,
                `Organization: ${r.organization_name ?? r.organization_id}`,
              ].join("\n"),
          }}
        />
      </div>
      <DecisionDialog pending={pending} onClose={() => setPending(null)} onDone={reload} />
    </div>
  );
}
