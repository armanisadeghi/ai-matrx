"use client";

/**
 * Spend approvals — every agent, mandate and automation whose single run cost more than the
 * approval threshold, waiting ones first, on the canonical MatrxDataTable (views, KPIs, columns).
 * seat="admin": every organization (decides system-owned + all). seat="org": one organization's
 * own subjects (its admins decide them). Data + rules: ./spendApprovals.ts.
 *
 * Arman 2026-10-10: default columns in his order; every $ to the cent; points hidden by default;
 * colours from knobs (billing.run_approval/color_*); "Temporary" approvals with an expiry; "Reset
 * tracking" restarts the "since" stats; ?id=<approval> pages to and highlights that row (the table's focusRowId; nothing is filtered).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarClock, Check, History, Loader2, RefreshCw, RotateCcw, TimerReset, X } from "lucide-react";
import { Button, SegmentedControl } from "@ai-matrx/design-system/controls";
import { formatUsd } from "@ai-matrx/kit/format";
import { adminCostColumns } from "@/components/cost/adminCostColumns";
import { FirstPlusMore } from "@/components/official/first-plus-more/FirstPlusMore";
import { ApprovalStatusText } from "./RunApprovalCell";
import { ApprovalStatusSelect, dateInputValue, endOfLocalDayIso } from "./ApprovalStatusSelect";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import { toast } from "@/lib/toast";
import {
  APPROVAL_STATUS_LABEL,
  SUBJECT_KIND_LABEL,
  costTone,
  decideSpendApproval,
  decideSpendApprovalsBatch,
  expiryLabel,
  expiryTone,
  resetSpendApprovalTracking,
  startedByLabel,
  fetchSpendApprovalHistory,
  fetchSpendApprovals,
  firstRunHref,
  subjectHref,
  useApprovalColorKnobs,
  type ApprovalColorKnobs,
  type ApprovalDecision,
  type ApprovalSeat,
  type ApprovalStatus,
  type SpendApprovalEvent,
  type SpendApprovalRow,
} from "./spendApprovals";

type StatusFilter = ApprovalStatus | "all";
type Tone = "danger" | "warning" | null;

const TONE_CLASS: Record<"danger" | "warning", string> = {
  danger: "font-semibold text-destructive",
  warning: "font-medium text-warning",
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");
const whenDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
/** Every dollar figure on this board: to the cent. */
const cents = (usd: number | null | undefined) => (usd == null ? "—" : formatUsd(usd, { digits: 2 }));

const EVENT_LABEL: Record<string, string> = {
  created: "Opened",
  approved: "Approved",
  approved_temporarily: "Approved temporarily",
  rejected: "Rejected",
  reopened: "Reopened",
  details: "Details",
  withdrawn: "Withdrawn",
  expired: "Expired",
  reset: "Tracking reset",
};

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
  return { rows, setRows, loading, error, reload: () => setTick((t) => t + 1) };
}

function eventUntil(e: SpendApprovalEvent): string | null {
  const d = e.data as { expires_at?: string } | null;
  return d && typeof d.expires_at === "string" ? d.expires_at : null;
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
  if (error) return <div className="text-xs text-destructive">{error}<ErrorAlchemyMenu error={error} /></div>;
  if (!events) return <div className="h-12 animate-pulse rounded bg-muted/50" />;
  return (
    <ol className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs">
      {events.map((e) => {
        const until = e.action === "approved_temporarily" ? eventUntil(e) : null;
        return (
          <li key={e.id} className="flex min-w-0 gap-2">
            <span className="shrink-0 tabular-nums text-muted-foreground">{when(e.created_at)}</span>
            <span className="shrink-0 whitespace-nowrap font-medium">
              {until ? `Approved until ${whenDay(until)}` : (EVENT_LABEL[e.action] ?? e.action)}
            </span>
            <span className="min-w-0 truncate text-muted-foreground" title={e.note ?? undefined}>
              {[e.actor_email ?? "System", e.note].filter(Boolean).join(" · ")}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface Pending {
  row: SpendApprovalRow;
  decision: ApprovalDecision | "history" | "reset";
}

function DecisionDialog({
  pending,
  knobs,
  onClose,
  onDone,
}: {
  pending: Pending | null;
  knobs: ApprovalColorKnobs | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [expected, setExpected] = useState("");
  const [perMonth, setPerMonth] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNote("");
    setExpected(pending?.row.expected_result ?? "");
    setPerMonth(pending?.row.expected_runs_per_month != null ? String(pending.row.expected_runs_per_month) : "");
    setUntil(
      pending?.row.status === "temporary" && pending.row.expires_at
        ? dateInputValue(0, new Date(pending.row.expires_at))
        : dateInputValue(knobs?.temporaryDefaultDays ?? 7),
    );
  }, [pending, knobs]);
  if (!pending) return null;
  const { row, decision } = pending;
  const name = row.subject_name ?? row.subject_id;
  const runsPerMonth = perMonth.trim() === "" ? null : Number(perMonth);
  const perRun = row.avg_cost_since ?? row.first_run_cost;
  const monthly = (runsPerMonth ?? row.runs_30d) * perRun;
  const untilIso = decision === "approve_temporary" ? endOfLocalDayIso(until) : null;
  const untilValid = decision !== "approve_temporary" || (untilIso != null && Date.parse(untilIso) > Date.now());
  const titles: Record<Pending["decision"], string> = {
    approve: `Approve ${name}?`,
    approve_temporary: `Approve ${name} temporarily?`,
    reject: `Reject ${name}?`,
    reopen: `Reopen ${name}?`,
    details: name,
    history: `History — ${name}`,
    reset: `Reset tracking for ${name}?`,
  };
  const consequence: Record<Pending["decision"], string> = {
    approve: `About ${cents(perRun)} a run, ${cents(monthly)} a month.`,
    approve_temporary: untilIso
      ? `About ${cents(perRun)} a run. ${expiryLabel(untilIso)}, then Rejected.`
      : `About ${cents(perRun)} a run.`,
    reject: `About ${cents(perRun)} a run, ${cents(monthly)} a month. Automated runs stay held.`,
    reopen: "Back to waiting.",
    details: "",
    history: "",
    reset: "Runs since, avg, max and est./month restart from now. History is kept.",
  };
  const confirmLabel: Record<Pending["decision"], string> = {
    approve: "Approve",
    approve_temporary: "Approve until",
    reject: "Reject",
    reopen: "Reopen",
    details: "Save",
    history: "Close",
    reset: "Reset tracking",
  };
  const submit = async () => {
    if (decision === "history") return onClose();
    if (!untilValid) return;
    setBusy(true);
    try {
      if (decision === "reset") {
        await resetSpendApprovalTracking([row.id], note);
        toast.success(`Tracking reset: ${name}`);
      } else {
        await decideSpendApproval(row.id, decision, {
          note,
          expectedResult: expected,
          expectedRunsPerMonth: runsPerMonth != null && Number.isFinite(runsPerMonth) ? runsPerMonth : null,
          expiresAt: untilIso,
        });
        const next: ApprovalStatus =
          decision === "approve" ? "approved" : decision === "approve_temporary" ? "temporary" : decision === "reject" ? "rejected" : "waiting";
        toast.success(`${APPROVAL_STATUS_LABEL[next]}: ${name}`);
      }
      onDone();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const approving = decision === "approve" || decision === "approve_temporary";
  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={titles[decision]}
      description={consequence[decision] || undefined}
      variant={decision === "reject" ? "destructive" : "default"}
      confirmLabel={confirmLabel[decision]}
      cancelLabel={decision === "history" ? null : "Cancel"}
      busy={busy}
      onConfirm={submit}
      content={
        <div className="flex flex-col gap-3 text-sm">
          {decision === "approve_temporary" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Expires on</span>
              {/* ui-exception: a date value, not prose */}
              <input
                type="date"
                value={until}
                min={dateInputValue(0)}
                onChange={(e) => setUntil(e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-sm"
              />
            </label>
          )}
          {approving && (
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

/** A dollar column to the cent (currency format, 2 places), plus its points twin hidden by default. */
function usdColumns(
  id: string,
  header: string,
  value: (r: SpendApprovalRow) => number | null | undefined,
  width: number,
  extra: Pick<MatrxColumnDef<SpendApprovalRow>, "tone" | "kpi"> = {},
): MatrxColumnDef<SpendApprovalRow>[] {
  const [, points] = adminCostColumns<SpendApprovalRow>({ id, label: header, value });
  return [
    {
      id,
      header,
      accessorFn: value,
      filter: "number",
      defaultSortDirection: "desc",
      width,
      format: { id: "currency", options: { precision: 2 } },
      ...extra,
    },
    { ...points, hidden: true, width },
  ];
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
  const { rows, setRows, loading, error, reload } = useApprovals(orgId);
  const { format } = useCostDisplay();
  const knobs = useApprovalColorKnobs();
  const { prefs: viewPrefs, setPrefs: setViewPrefs } = useListViewPrefs(`spend-approvals-${seat}`);
  const params = useSearchParams();
  const focusId = params.get("id");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulk, setBulk] = useState<{ decision: "approve" | "reject" | "reset"; rows: SpendApprovalRow[] } | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const visible = rows.filter((r) => status === "all" || r.status === status);

  const perRunTone = (v: number | null | undefined): Tone => (knobs ? costTone(v, knobs.avgRedUsd, knobs.avgAmberUsd) : null);
  const monthlyTone = (v: number | null | undefined): Tone =>
    knobs ? costTone(v, knobs.monthlyRedUsd, knobs.monthlyAmberUsd) : null;
  const rowTone = (t: Tone) => t ?? undefined;

  const setRowStatus = (id: string, st: ApprovalStatus, expiresAt?: string | null) =>
    setRows((rs) => rs.map((x) => (x.id === id ? { ...x, status: st, expires_at: expiresAt ?? (st === "temporary" ? x.expires_at : null) } : x)));
  const decideInline = async (
    r: SpendApprovalRow,
    decision: ApprovalDecision,
    next: ApprovalStatus,
    note: string,
    expiresAt: string | null,
  ) => {
    const before = { status: r.status, expires_at: r.expires_at };
    setRowStatus(r.id, next, expiresAt);
    try {
      await decideSpendApproval(r.id, decision, { note, expiresAt });
      toast.success(`${APPROVAL_STATUS_LABEL[next]}: ${r.subject_name ?? r.subject_id}`);
    } catch (e: unknown) {
      setRowStatus(r.id, before.status, before.expires_at);
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const decideBulk = async () => {
    if (!bulk) return;
    const { decision, rows: targets } = bulk;
    setBulkBusy(true);
    if (decision === "reset") {
      try {
        const n = await resetSpendApprovalTracking(targets.map((t) => t.id), "Batch reset");
        toast.success(`Tracking reset: ${n}`);
        setSelectedIds([]);
        reload();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
      setBulkBusy(false);
      setBulk(null);
      return;
    }
    const next: ApprovalStatus = decision === "approve" ? "approved" : "rejected";
    const before = new Map(targets.map((t) => [t.id, t.status]));
    setRows((rs) => rs.map((x) => (before.has(x.id) ? { ...x, status: next, expires_at: null } : x)));
    const res = await decideSpendApprovalsBatch(targets.map((t) => t.id), decision);
    if (res.failed.length) {
      const failed = new Set(res.failed.map((f) => f.id));
      setRows((rs) => rs.map((x) => (failed.has(x.id) ? { ...x, status: before.get(x.id) ?? x.status } : x)));
      toast.error(`${res.failed.length} of ${targets.length} failed: ${res.failed[0].message}`);
    }
    if (res.ok.length) toast.success(`${APPROVAL_STATUS_LABEL[next]}: ${res.ok.length}`);
    setSelectedIds(res.failed.map((f) => f.id));
    setBulkBusy(false);
    setBulk(null);
  };
  const bulkTargets = (selected: SpendApprovalRow[], decision: "approve" | "reject" | "reset") =>
    selected.filter(
      (r) => r.can_decide && (decision === "reset" || r.status !== (decision === "approve" ? "approved" : "rejected")),
    );
  const bulkMonthly = bulk ? bulk.rows.reduce((s, r) => s + (r.est_monthly_cost ?? 0), 0) : 0;

  const columns: MatrxColumnDef<SpendApprovalRow>[] = [
    // ── the default columns, in Arman's order (2026-10-10) ──
    {
      id: "subject",
      header: "Subject",
      accessorFn: (r) => r.subject_name ?? r.subject_id,
      filter: "text",
      width: 240,
      frozen: true,
      cell: (r) => {
        const href = subjectHref(r, seat, orgSlug);
        const name = r.subject_name ?? r.subject_id;
        return href ? (
          <Link href={href} className="block truncate font-medium text-primary hover:underline" title={name}>
            {name}
          </Link>
        ) : (
          <span className="block truncate font-medium" title={name}>{name}</span>
        );
      },
    },
    {
      id: "subject_kind",
      header: "Type",
      accessorFn: (r) => SUBJECT_KIND_LABEL[r.subject_kind],
      filter: "select",
      width: 140,
      cell: (r) => <span className="whitespace-nowrap text-xs">{SUBJECT_KIND_LABEL[r.subject_kind]}</span>,
    },
    {
      id: "agent",
      header: "Agent",
      accessorFn: (r) => r.agent_id ?? "",
      filter: "text",
      width: 160,
      cell: (r) =>
        r.subject_kind !== "agent" && r.agent_id ? (
          <div className="min-w-0 truncate text-xs">
            <EntityRef token="agent" id={r.agent_id} name="Agent" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Approval status",
      accessorFn: (r) => r.status,
      filter: "select",
      filterOptions: [
        { value: "waiting", label: "Waiting" },
        { value: "approved", label: "Approved" },
        { value: "temporary", label: "Temporary" },
        { value: "rejected", label: "Rejected" },
      ],
      kpi: [
        { id: "waiting", op: "count", label: "Waiting", countWhere: (r) => r.status === "waiting", tone: (n) => (n > 0 ? "warning" : undefined) },
        { id: "rejected", op: "count", label: "Rejected", countWhere: (r) => r.status === "rejected" },
      ],
      width: 250,
      cell: (r) => {
        const tone = r.status === "temporary" && knobs ? expiryTone(r.expires_at, knobs.expiryWarnDays) : null;
        return (
          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            {r.can_decide ? (
              <ApprovalStatusSelect
                status={r.status}
                name={r.subject_name ?? r.subject_id}
                costPerRun={r.avg_cost_since ?? r.first_run_cost}
                estMonthly={r.est_monthly_cost}
                expiresAt={r.expires_at}
                onDecide={(decision, next, note, expiresAt) => decideInline(r, decision, next, note, expiresAt)}
              />
            ) : (
              <ApprovalStatusText status={r.status} />
            )}
            {r.status === "temporary" && r.expires_at && (
              <span className={`truncate text-xs ${tone ? TONE_CLASS[tone] : "text-muted-foreground"}`} title={when(r.expires_at)}>
                {expiryLabel(r.expires_at)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "automated_runs_30d",
      accessorKey: "automated_runs_30d",
      header: "Automated runs (30d)",
      filter: "number",
      align: "right",
      width: 130,
      cell: (r) => <span className="tabular-nums">{r.automated_runs_30d}</span>,
    },
    ...usdColumns("automated_cost_per_run", "Cost per automated run", (r) => r.automated_cost_per_run, 140, { tone: (r) => rowTone(perRunTone(r.automated_cost_per_run)) }),
    ...usdColumns("automated_cost_30d", "Automated cost (30d)", (r) => r.automated_cost_30d, 130, { tone: (r) => rowTone(monthlyTone(r.automated_cost_30d)) }),
    {
      id: "first_run_at",
      header: "First run at",
      accessorFn: (r) => r.first_run_at ?? "",
      filter: "date",
      width: 180,
      cell: (r) => {
        const href = firstRunHref(r, seat);
        return href ? (
          <Link href={href} className="block truncate text-xs text-primary hover:underline">{when(r.first_run_at)}</Link>
        ) : (
          <span className="block truncate text-xs text-muted-foreground" title="No saved run">{when(r.first_run_at)}</span>
        );
      },
    },
    ...usdColumns("est_monthly_cost", "Est./month", (r) => r.est_monthly_cost, 110, {
      tone: (r) => rowTone(monthlyTone(r.est_monthly_cost)),
      kpi: [
        { id: "waiting_monthly", op: "sum", label: "Waiting est./month", where: (r) => r.status === "waiting", tone: (v) => rowTone(monthlyTone(v)) },
        { id: "approved_monthly", op: "sum", label: "Approved est./month", where: (r) => r.status === "approved" || r.status === "temporary" },
      ],
    }),
    ...usdColumns("max_cost_since", "Max cost since", (r) => r.max_cost_since, 120, { tone: (r) => rowTone(perRunTone(r.max_cost_since)) }),
    {
      id: "runs_since",
      accessorKey: "runs_since",
      header: "Runs since",
      filter: "number",
      align: "right",
      width: 100,
      cell: (r) => <span className="tabular-nums">{r.runs_since}</span>,
    },
    ...usdColumns("avg_cost_since", "Avg cost since", (r) => r.avg_cost_since, 120, {
      tone: (r) => rowTone(perRunTone(r.avg_cost_since)),
      kpi: { id: "over_red", op: "count", label: "Avg over red line", countWhere: (r) => perRunTone(r.avg_cost_since) === "danger", tone: (n) => (n > 0 ? "danger" : undefined) },
    }),
    // ── available in Columns, hidden by default ──
    ...usdColumns("first_run_cost", "First run cost", (r) => r.first_run_cost, 120, { tone: (r) => rowTone(perRunTone(r.first_run_cost)) }).map((c) => ({ ...c, hidden: true })),
    {
      id: "expires_at",
      header: "Expires at",
      accessorFn: (r) => r.expires_at ?? "",
      filter: "date",
      width: 170,
      hidden: true,
      kpi: {
        id: "expiring",
        op: "count",
        label: "Temporary expiring",
        countWhere: (r) => Boolean(knobs) && r.status === "temporary" && expiryTone(r.expires_at, knobs!.expiryWarnDays) != null,
        tone: (n) => (n > 0 ? "danger" : undefined),
      },
      cell: (r) => <span className="block truncate text-xs">{r.status === "temporary" ? when(r.expires_at) : "—"}</span>,
    },
    {
      id: "since_at",
      header: "Since",
      accessorFn: (r) => r.since_at ?? "",
      filter: "date",
      width: 170,
      hidden: true,
      cell: (r) => <span className="block truncate text-xs">{when(r.since_at)}</span>,
    },
    {
      id: "reset_at",
      header: "Reset at",
      accessorFn: (r) => r.reset_at ?? "",
      filter: "date",
      width: 170,
      hidden: true,
      cell: (r) => (
        <span className="block truncate text-xs" title={[r.reset_by_email, r.reset_note].filter(Boolean).join(" · ") || undefined}>
          {when(r.reset_at)}
        </span>
      ),
    },
    {
      id: "seeded",
      header: "Before rule",
      accessorFn: (r) => (r.seeded ? "Yes" : "No"),
      filter: "select",
      width: 120,
      hidden: true,
      cell: (r) => <span className="text-xs">{r.seeded ? "Yes" : "No"}</span>,
    },
    {
      id: "first_run_turns",
      header: "First run turns",
      accessorFn: (r) => r.first_run_turns,
      filter: "number",
      align: "right",
      width: 110,
      hidden: true,
      cell: (r) => <span className="tabular-nums">{r.first_run_turns}</span>,
    },
    {
      id: "first_run_model",
      header: "First run model",
      accessorFn: (r) => r.first_run_models.join(", "),
      filter: "text",
      width: 170,
      hidden: true,
      cell: (r) => (
        <FirstPlusMore items={r.first_run_models} getKey={(m) => m} label="models" render={(m) => <span title={m}>{m}</span>} />
      ),
    },
    {
      id: "blocked_runs",
      accessorKey: "blocked_runs",
      header: "Held runs",
      filter: "number",
      align: "right",
      width: 100,
      hidden: true,
      cell: (r) => (
        <span className={`tabular-nums ${r.blocked_runs > 0 ? "font-semibold text-warning" : "text-muted-foreground"}`} title={r.last_blocked_at ? `Last held ${when(r.last_blocked_at)}` : undefined}>
          {r.blocked_runs}
        </span>
      ),
    },
    {
      id: "started_by",
      header: "Started by",
      accessorFn: (r) => startedByLabel(r.started_by),
      filter: "text",
      width: 200,
      hidden: true,
      cell: (r) => <span className="block truncate text-xs" title={startedByLabel(r.started_by)}>{startedByLabel(r.started_by)}</span>,
    },
    {
      id: "who",
      header: "Run by",
      accessorFn: (r) => r.first_run_person_email ?? "",
      filter: "text",
      width: 200,
      hidden: true,
      cell: (r) => <span className="block truncate text-xs" title={r.first_run_person_email ?? undefined}>{r.first_run_person_email ?? "Unknown person"}</span>,
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (r) => r.organization_name ?? "",
      filter: "text",
      width: 180,
      hidden: true,
      cell: (r) =>
        seat === "admin" ? (
          <div className="min-w-0 truncate text-xs">
            <EntityRef token="organization" id={r.organization_id} name={r.organization_name ?? "Organization"} />
          </div>
        ) : (
          <span className="block truncate text-xs">{r.organization_name ?? "—"}</span>
        ),
    },
    {
      id: "decided_by",
      header: "Decided by",
      accessorFn: (r) => r.decided_by_email ?? "",
      filter: "text",
      width: 180,
      hidden: true,
      cell: (r) => <span className={`block truncate text-xs ${r.decided_by_email ? "" : "text-muted-foreground"}`}>{r.decided_by_email ?? "—"}</span>,
    },
    {
      id: "decided_at",
      header: "Decided at",
      accessorFn: (r) => r.decided_at ?? "",
      filter: "date",
      width: 170,
      hidden: true,
      cell: (r) => <span className={`block truncate text-xs ${r.decided_at ? "" : "text-muted-foreground"}`}>{when(r.decided_at)}</span>,
    },
    {
      id: "expected_result",
      header: "Expected result",
      accessorFn: (r) => r.expected_result ?? "",
      filter: "text",
      width: 220,
      hidden: true,
      cell: (r) => <span className="block truncate text-xs" title={r.expected_result ?? undefined}>{r.expected_result ?? "—"}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      customActions: (r) => (
        <div className="flex items-center gap-1">
          {r.can_decide && r.status !== "approved" && (
            <Button variant="outline" onClick={() => setPending({ row: r, decision: "approve" })} aria-label="Approve">
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          {r.can_decide && (
            <Button variant="quiet" onClick={() => setPending({ row: r, decision: "approve_temporary" })} aria-label="Approve temporarily" title="Approve temporarily">
              <CalendarClock className="h-4 w-4" />
            </Button>
          )}
          {r.can_decide && r.status !== "rejected" && (
            <Button variant="outline" onClick={() => setPending({ row: r, decision: "reject" })} aria-label="Reject" title="Reject">
              <X className="h-4 w-4" />
            </Button>
          )}
          {r.can_decide && r.status !== "waiting" && (
            <Button variant="quiet" onClick={() => setPending({ row: r, decision: "reopen" })} aria-label="Reopen" title="Reopen">
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {r.can_decide && (
            <Button variant="quiet" onClick={() => setPending({ row: r, decision: "reset" })} aria-label="Reset tracking" title="Reset tracking">
              <TimerReset className="h-4 w-4" />
            </Button>
          )}
          <Button variant="quiet" onClick={() => setPending({ row: r, decision: "history" })} aria-label="History" title="History">
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
          tableId={`spend-approvals-${seat}`}
          viewTabsStore={{
            views: viewPrefs.savedViews ?? [],
            onChange: (savedViews) => setViewPrefs({ savedViews }),
          }}
          focusRowId={focusId}
          headerWrap="two-lines"
          emptyState={{ title: "No spend approvals" }}
          selection={{
            selectedIds,
            onSelectedIdsChange: setSelectedIds,
            scopeKey: orgId ?? "all",
            isRowSelectable: (r) => r.can_decide,
            noun: "approval",
            actions: (selected) => (
              <>
                <Button variant="outline" disabled={bulkBusy || !bulkTargets(selected, "approve").length} onClick={() => setBulk({ decision: "approve", rows: bulkTargets(selected, "approve") })}>
                  <Check className="h-4 w-4" /> Approve selected
                </Button>
                <Button variant="outline" disabled={bulkBusy || !bulkTargets(selected, "reject").length} onClick={() => setBulk({ decision: "reject", rows: bulkTargets(selected, "reject") })}>
                  <X className="h-4 w-4" /> Reject selected
                </Button>
                <Button variant="outline" disabled={bulkBusy || !bulkTargets(selected, "reset").length} onClick={() => setBulk({ decision: "reset", rows: bulkTargets(selected, "reset") })}>
                  <TimerReset className="h-4 w-4" /> Reset tracking
                </Button>
              </>
            ),
          }}
          toolbar={{
            title: "People's own chats are never held. Agent and automated runs are.",
            search: true,
            searchPlaceholder: "Search agents, mandates, automations…",
            actions: (
              <div className="flex items-center gap-2">
                <SegmentedControl<StatusFilter>
                  aria-label="Status"
                  value={status}
                  onValueChange={setStatus}
                  data={[
                    { value: "all", label: "All" },
                    { value: "waiting", label: "Waiting" },
                    { value: "approved", label: "Approved" },
                    { value: "temporary", label: "Temporary" },
                    { value: "rejected", label: "Rejected" },
                  ]}
                />
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
                `Status: ${APPROVAL_STATUS_LABEL[r.status]}${r.status === "temporary" && r.expires_at ? ` (${expiryLabel(r.expires_at)})` : ""}`,
                `First run: ${format(r.first_run_cost)} on ${when(r.first_run_at)}`,
                `Since ${when(r.since_at)}: ${r.runs_since} runs, avg ${cents(r.avg_cost_since)}, max ${cents(r.max_cost_since)}`,
                `Est. monthly: ${cents(r.est_monthly_cost)}`,
                r.reset_at ? `Tracking reset ${when(r.reset_at)}${r.reset_by_email ? ` by ${r.reset_by_email}` : ""}` : "",
                `Organization: ${r.organization_name ?? r.organization_id}`,
              ]
                .filter(Boolean)
                .join("\n"),
          }}
        />
      </div>
      {bulk && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && !bulkBusy && setBulk(null)}
          title={
            bulk.decision === "reset"
              ? `Reset tracking for ${bulk.rows.length} ${bulk.rows.length === 1 ? "approval" : "approvals"}?`
              : `${bulk.decision === "approve" ? "Approve" : "Reject"} ${bulk.rows.length} ${bulk.rows.length === 1 ? "approval" : "approvals"}?`
          }
          description={
            bulk.decision === "reset"
              ? "Runs since, avg, max and est./month restart from now. History is kept."
              : `${cents(bulkMonthly)} a month combined.`
          }
          variant={bulk.decision === "reject" ? "destructive" : "default"}
          confirmLabel={bulk.decision === "approve" ? "Approve" : bulk.decision === "reject" ? "Reject" : "Reset tracking"}
          cancelLabel="Cancel"
          busy={bulkBusy}
          onConfirm={decideBulk}
        />
      )}
      <DecisionDialog pending={pending} knobs={knobs} onClose={() => setPending(null)} onDone={reload} />
    </div>
  );
}
