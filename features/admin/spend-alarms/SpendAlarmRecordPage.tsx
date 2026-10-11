"use client";

// The ONE page for one spend alarm (Arman, 2026-10-10): what happened, what was blocked (each id
// opens its exact record), whose it is, the cost, the rule, every occurrence, and actions that act
// on the blocked thing through existing doors. Every alarm surface links here.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellOff,
  Bot,
  Check,
  CheckCircle2,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Scale,
  X,
} from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { readOf } from "@ai-matrx/design-system";
import { RecordPageHeader, type RecordPageAction } from "@/features/shell/components/header/templates/RecordPageHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProTextarea } from "@/components/official/ProTextarea";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { KpiTile } from "@/components/official/kpi/KpiTile";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { toast } from "@/lib/toast";
import { formatAdminUsd } from "@/components/cost/formatAdminCost";
import { fetchUserDisplayNames } from "@/features/mandates/notes";
import { adminScheduleHref } from "@/features/scheduling/constants/routes";
import { patchSystemTask, runSystemTaskNow } from "@/features/scheduling/service/schedulerClient";
import { decideSpendApproval } from "@/features/admin/spend-approvals/spendApprovals";
import { supabase } from "@/utils/supabase/client";
import {
  SPEND_ALARMS_PATH,
  alarmActions,
  alarmAgentData,
  alarmHeadline,
  fetchSpendAlarm,
  LEVEL_LABEL,
  fetchSpendAlarmOccurrences,
  fetchTaskState,
  refHref,
  refLinks,
  setSpendAlarmStatus,
  spendAlarmHref,
  type AlarmActionId,
  type AlarmLevel,
  type SpendAlarmOccurrence,
  type SpendAlarmRecord,
} from "./spendAlarms";

const LEVEL_TONE: Record<AlarmLevel, "destructive" | "warning" | "info"> = {
  critical: "destructive",
  warning: "warning",
  info: "info",
};

type Pending =
  | { kind: "resolve" }
  | { kind: "run_now" }
  | { kind: "pause" }
  | { kind: "approve" }
  | { kind: "reject" }
  | null;

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function RefList({ record, names }: { record: SpendAlarmRecord; names: ReadonlyMap<string, string> }) {
  const links = refLinks(record.refs);
  if (links.length === 0) return <p className="text-sm text-muted-foreground">No ids recorded</p>;
  return (
    <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
      {links.map((l) => {
        const shown = l.key === "user_id" ? names.get(l.value) ?? l.value : l.value;
        return (
          <div key={l.key} className="contents">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className="min-w-0 truncate font-mono text-xs leading-5">
              {l.href ? (
                <Link href={l.href} className="text-primary hover:underline">
                  {shown}
                </Link>
              ) : (
                shown
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function SpendAlarmRecordPage({ id }: { id: string }) {
  const router = useRouter();
  const [record, setRecord] = useState<SpendAlarmRecord | null>(null);
  const [occurrences, setOccurrences] = useState<SpendAlarmOccurrence[]>([]);
  const [task, setTask] = useState<{ enabled: boolean; title: string; user_id: string } | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const rec = await fetchSpendAlarm(id);
        const occ = rec ? await fetchSpendAlarmOccurrences(id) : [];
        const t = rec?.refs.task_id ? await fetchTaskState(rec.refs.task_id).catch(() => null) : null;
        let approval: string | null = null;
        if (rec?.refs.approval_id) {
          const { data } = await supabase
            .schema("billing")
            .from("run_approval")
            .select("status")
            .eq("id", rec.refs.approval_id)
            .maybeSingle();
          approval = (data as { status?: string } | null)?.status ?? null;
        }
        const people = [rec?.refs.user_id, rec?.resolved_by, t?.user_id].filter((v): v is string => !!v);
        const resolved = people.length ? await fetchUserDisplayNames(people).catch(() => new Map<string, string>()) : new Map<string, string>();
        if (!alive) return;
        setRecord(rec);
        setOccurrences(occ);
        setTask(t);
        setApprovalStatus(approval);
        setNames(resolved);
        setError(rec ? null : "This alarm does not exist");
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, version]);

  const reload = () => setVersion((v) => v + 1);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      setPending(null);
      setNote("");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const actions = record ? alarmActions(record, { task, approvalStatus }) : [];
  const has = (a: AlarmActionId) => actions.includes(a);
  const refs = record?.refs ?? {};
  const taskName = task?.title ?? "this automation";

  const runNow = () =>
    act(async () => {
      const { run_id } = await runSystemTaskNow(refs.task_id as string);
      router.push(`${adminScheduleHref(refs.task_id as string)}?run=${encodeURIComponent(run_id)}`);
    }, "Run started");

  const headerActions: RecordPageAction[] = [];
  if (record) {
    if (has("open_agent") && refs.agent_id)
      headerActions.push({ label: "Open agent", icon: Bot, href: refHref("agent_id", refs.agent_id) ?? undefined, showLabel: true });
    if (has("open_mandate") && refs.mandate_key)
      headerActions.push({ label: "Open mandate", icon: Scale, href: refHref("mandate_key", refs.mandate_key) ?? undefined, showLabel: true });
    if (has("open_source") && refs.source_id)
      headerActions.push({ label: "Open source", icon: FileText, href: refHref("source_id", refs.source_id, refs) ?? undefined, showLabel: true });
    if (has("pause")) headerActions.push({ label: "Pause automation", icon: Pause, onPress: () => setPending({ kind: "pause" }), showLabel: true });
    if (has("resume"))
      headerActions.push({
        label: "Resume automation",
        icon: Play,
        disabled: busy,
        showLabel: true,
        onPress: () => act(() => patchSystemTask(refs.task_id as string, { enabled: true }), "Automation resumed"),
      });
    if (has("run_now")) headerActions.push({ label: "Run once now", icon: Play, onPress: () => setPending({ kind: "run_now" }), showLabel: true });
    if (has("reject")) headerActions.push({ label: "Reject", icon: X, onPress: () => setPending({ kind: "reject" }), showLabel: true });
    if (has("approve")) headerActions.push({ label: "Approve", icon: Check, onPress: () => setPending({ kind: "approve" }), showLabel: true });
    if (record.status === "resolved") {
      headerActions.push({ label: "Reopen", icon: RotateCcw, showLabel: true, onPress: () => act(() => setSpendAlarmStatus(id, "open"), "Alarm reopened") });
    } else {
      headerActions.push({
        label: "Snooze 24h",
        icon: BellOff,
        showLabel: true,
        disabled: busy,
        onPress: () => act(() => setSpendAlarmStatus(id, "snoozed", { snoozeHours: 24 }), "Snoozed for 24 hours"),
      });
      headerActions.push({ label: "Resolve", icon: CheckCircle2, primary: true, onPress: () => setPending({ kind: "resolve" }) });
    }
  }

  const statusLabel = record
    ? record.status === "open"
      ? LEVEL_LABEL[record.level]
      : record.status === "snoozed"
        ? `Snoozed until ${when(record.snoozed_until)}`
        : "Resolved"
    : "";

  const agentPayload = () => ({
    kind: "spend-alarm",
    location: spendAlarmHref(id),
    description: "One spend alarm with its ids and occurrences.",
    attributes: { level: record?.level ?? "", status: record?.status ?? "", count: String(record?.occurrence_count ?? 0) },
    data: record ? alarmAgentData(record, occurrences, typeof window === "undefined" ? "" : window.location.origin) : null,
  });

  const columns: MatrxColumnDef<SpendAlarmOccurrence>[] = [
    { id: "occurred_at", accessorKey: "occurred_at", header: "When", cell: (o) => when(o.occurred_at), sortValue: (o) => o.occurred_at },
    { id: "repeat_count", accessorKey: "repeat_count", header: "Times", kpi: { op: "sum", label: "Occurrences" } },
    {
      id: "run",
      header: "Run",
      accessorFn: (o) => o.run_id ?? o.refs.workflow_run_id ?? o.execution_id ?? "",
      cell: (o) => {
        const key = o.run_id ? "run_id" : o.refs.workflow_run_id ? "workflow_run_id" : o.execution_id ? "execution_id" : null;
        if (!key) return <span className="text-muted-foreground">—</span>;
        const value = (key === "run_id" ? o.run_id : key === "execution_id" ? o.execution_id : o.refs.workflow_run_id) as string;
        const href = refHref(key, value, { ...record?.refs, ...o.refs });
        return href ? (
          <Link href={href} className="font-mono text-xs text-primary hover:underline">
            {value.slice(0, 8)}
          </Link>
        ) : (
          <span className="font-mono text-xs">{value.slice(0, 8)}</span>
        );
      },
    },
    {
      id: "served",
      header: "Served item",
      accessorFn: (o) => [o.refs.source_kind, o.refs.source_id].filter(Boolean).join(" "),
      cell: (o) => {
        if (!o.refs.source_id) return <span className="text-muted-foreground">—</span>;
        const href = refHref("source_id", o.refs.source_id, o.refs);
        const text = `${o.refs.source_kind ?? "source"} ${o.refs.source_id.slice(0, 8)}`;
        return href ? (
          <Link href={href} className="text-primary hover:underline">
            {text}
          </Link>
        ) : (
          text
        );
      },
    },
    { id: "handler", header: "Handler", accessorFn: (o) => o.refs.handler ?? "" },
    { id: "request", header: "Request", accessorFn: (o) => o.refs.request_id ?? "", cellKind: "uuid" },
    { id: "cost_usd", accessorKey: "cost_usd", header: "Cost", cell: (o) => (o.cost_usd == null ? "—" : formatAdminUsd(o.cost_usd)) },
  ];

  const consequence: Record<Exclude<NonNullable<Pending>["kind"], "resolve">, string> = {
    run_now: `Runs ${taskName} once now, as you, and spends what one run costs. You land on its page to watch.`,
    pause: `Stops ${taskName} from firing until someone resumes it. Runs already going finish.`,
    approve: "Lets this subject run again without asking, at its current cost.",
    reject: "Holds every automated run of this subject until someone approves it.",
  };

  return (
    <>
      <RecordPageHeader
        backHref={SPEND_ALARMS_PATH}
        parents={[
          { label: "Billing", href: "/administration/billing" },
          { label: "Alarms", href: SPEND_ALARMS_PATH },
        ]}
        record={{ name: record ? alarmHeadline(record.title, record.subject_id, record.subject_name) : loading ? "Alarm" : "Alarm not found" }}
        status={record ? { label: statusLabel, tone: record.status === "open" ? LEVEL_TONE[record.level] : "neutral" } : undefined}
        actions={headerActions}
      />
      <div className="h-full overflow-y-auto px-4 pb-16 pt-4 sm:px-6" data-testid="spend-alarm-record">
        {error ? (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        ) : null}
        {record ? (
          <div className="mx-auto flex max-w-6xl flex-col gap-4">
            <section className="group/x relative rounded-lg border border-border bg-card p-4">
              <CopyButtons
                size="icon"
                label="Spend alarm"
                className="absolute right-2 top-2"
                human={() => `${record.title}\n${record.detail}\nRule: ${record.rule ?? "—"}\n${window.location.origin}${spendAlarmHref(id)}`}
                agent={agentPayload}
              />
              <p className="pr-20 text-sm font-medium text-foreground">{record.detail}</p>
              {record.fix ? <p className="mt-1 text-sm text-muted-foreground">{record.fix}</p> : null}
              <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Rule</dt>
                <dd>{record.rule ?? "—"}</dd>
                <dt className="text-muted-foreground">Whose</dt>
                <dd>
                  {record.refs.user_id ? (
                    <Link href={refHref("user_id", record.refs.user_id) ?? "#"} className="text-primary hover:underline">
                      {names.get(record.refs.user_id) ?? record.refs.user_id}
                    </Link>
                  ) : (
                    record.subject_name ?? `${record.subject_type} ${record.subject_id}`
                  )}
                </dd>
                {record.status === "resolved" ? (
                  <>
                    <dt className="text-muted-foreground">Resolved</dt>
                    <dd>
                      {`${when(record.resolved_at)}${record.resolved_by ? ` by ${names.get(record.resolved_by) ?? record.resolved_by}` : ""}${record.resolution_note ? ` — ${record.resolution_note}` : ""}`}
                    </dd>
                  </>
                ) : null}
              </dl>
            </section>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiTile label="Times" value={record.occurrence_count.toLocaleString()} tone={record.level === "critical" ? "bad" : "neutral"} hint={`Reopened ${record.reopened_count}x`} />
              <KpiTile label="First seen" value={when(record.first_seen_at)} />
              <KpiTile label="Last seen" value={when(record.last_seen_at)} />
              <KpiTile
                label={record.cost_avoided_usd != null ? "Cost avoided" : "Cost"}
                value={record.cost_avoided_usd != null ? formatAdminUsd(record.cost_avoided_usd) : record.cost_usd != null ? formatAdminUsd(record.cost_usd) : null}
                title="Spent by the occurrences, or kept from being spent by the refusal; dash when not measured"
              />
            </div>

            <section className="group/x relative rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 text-sm font-semibold">What was blocked</h2>
              <CopyButtons
                size="xs"
                label="Blocked ids"
                className="absolute right-2 top-2"
                human={() => refLinks(record.refs).map((l) => `${l.label}: ${l.value}`).join("\n")}
                agent={agentPayload}
              />
              <RefList record={record} names={names} />
              {task ? (
                <p className="mt-2 text-sm">
                  <Link href={adminScheduleHref(record.refs.task_id as string)} className="text-primary hover:underline">
                    {task.title}
                  </Link>
                  <span className="text-muted-foreground">{task.enabled ? " — enabled" : " — paused"}</span>
                </p>
              ) : null}
            </section>

            <div className="h-[28rem] min-h-0">
              <MatrxDataTable
                data={occurrences}
                columns={columns}
                getRowId={(o) => o.id}
                isLoading={loading}
                tableId="spend-alarm-occurrences"
                read={readOf({ loading, error }, { what: "occurrences" })}
                emptyState={{ title: "No occurrences recorded" }}
                toolbar={{ title: "Occurrences", search: true }}
                copy={{
                  label: "Occurrence",
                  listLabel: "Alarm occurrences",
                  location: spendAlarmHref(id),
                  rowKind: "spend-alarm-occurrence",
                  listKind: "spend-alarm-occurrences",
                  humanRow: (o) => `${when(o.occurred_at)} · x${o.repeat_count} · ${o.run_id ?? o.execution_id ?? o.refs.source_id ?? ""}`,
                  agentRow: (o) => ({ ...o, links: refLinks({ ...record.refs, ...o.refs }).filter((l) => l.href) }),
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={pending?.kind === "resolve"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Resolve this alarm"
        description="Marks it resolved for everyone; it reopens if it happens again."
        confirmLabel="Resolve"
        busy={busy}
        onConfirm={() => act(() => setSpendAlarmStatus(id, "resolved", { note }), "Alarm resolved")}
        content={
          <ProTextarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" surfaceName="spend-alarm-resolve" />
        }
      />
      <ConfirmDialog
        open={!!pending && pending.kind !== "resolve"}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          pending?.kind === "run_now"
            ? "Run once now"
            : pending?.kind === "pause"
              ? "Pause automation"
              : pending?.kind === "approve"
                ? "Approve"
                : "Reject"
        }
        description={pending && pending.kind !== "resolve" ? consequence[pending.kind] : undefined}
        variant={pending?.kind === "pause" || pending?.kind === "reject" ? "destructive" : "default"}
        confirmLabel={pending?.kind === "run_now" ? "Run and watch" : pending?.kind === "pause" ? "Pause" : pending?.kind === "approve" ? "Approve" : "Reject"}
        busy={busy}
        onConfirm={() => {
          if (pending?.kind === "run_now") return void runNow();
          if (pending?.kind === "pause")
            return void act(() => patchSystemTask(refs.task_id as string, { enabled: false }), "Automation paused");
          if (pending?.kind === "approve")
            return void act(() => decideSpendApproval(refs.approval_id as string, "approve"), "Approved");
          if (pending?.kind === "reject") return void act(() => decideSpendApproval(refs.approval_id as string, "reject"), "Rejected");
        }}
      />
    </>
  );
}
