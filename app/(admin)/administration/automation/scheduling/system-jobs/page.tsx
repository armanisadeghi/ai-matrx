// Scheduling admin › System jobs — the recurring SERVER jobs (kind=tool) that
// aidream runs on a schedule, controllable from this console per Arman's
// 2026-08-28 ruling: view, edit interval/config, enable/disable — the ask to
// him is a URL where he flips the switch, and this page is that URL.
//
// 2026-08-29 (Arman: "we definitely agree that we need to have that"): the
// DATABASE's own scheduled jobs — pg_cron, SQL running inside Postgres — join
// this page as a second section with the same control surface (view, edit
// schedule, enable/disable). No run-now there on purpose: pg_cron has no
// run-once primitive and several jobs are destructive purges. The human
// register for what each DB job feeds: common-docs/operations/db-scheduled-jobs.md.
//
// Data path: the aidream `/scheduling/admin/system-tasks` admin endpoints
// (schedulerClient — same base URL + Supabase-JWT Bearer auth as every other
// aidream call in this console; the server side admin-gates the routes).
// These are NOT the viewer's own sch_task rows — they are platform system
// jobs, so nothing here goes through the Supabase-direct admin service.
//
// Two server-side facts the UI must surface loudly:
//   - handler_registered=false → the job exists but no code is registered to
//     run it; the server REFUSES enabling it, and that refusal is shown
//     verbatim.
//   - handler_gate_pending → the handler is waiting on an approval gate.

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Play,
  Power,
  RefreshCw,
} from "lucide-react";
import cronstrue from "cronstrue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  listDbJobs,
  listSystemTasks,
  patchDbJob,
  patchSystemTask,
  runSystemTaskNow,
} from "@/features/scheduling/service/schedulerClient";
import type {
  DbJobPatchRequest,
  DbJobResponse,
  SystemTaskPatchRequest,
  SystemTaskResponse,
} from "@/features/scheduling/service/schedulerApi.types";
import {
  humanizeRelative,
  humanizeTrigger,
} from "@/features/scheduling/utils/triggerHumanize";
import type { TriggerType } from "@/features/scheduling/types";
import {
  definedOnly,
  useAdminSchedulingScopeSlice,
} from "@/features/scheduling/lib/admin-scheduling-scope";

// The trigger types humanizeTrigger knows. A system trigger's `type` arrives
// as a plain string on this wire (defensive contract), so an unknown value
// renders as itself rather than crashing the humanizer's exhaustive switch.
const KNOWN_TRIGGER_TYPES: ReadonlySet<string> = new Set([
  "one-shot",
  "interval",
  "heartbeat",
  "cron",
  "context-match",
  "event",
  "manual",
  "dependency",
]);

function cadenceText(t: SystemTaskResponse): string {
  const trig = t.trigger;
  if (!trig) return "No trigger";
  if (!KNOWN_TRIGGER_TYPES.has(trig.type)) return trig.type;
  return humanizeTrigger(trig.type as TriggerType, trig.config ?? {});
}

/** Plain-English reading of a cron expression, or null when it can't be. */
function cronHint(expression: string): string | null {
  if (!expression.trim()) return null;
  try {
    return cronstrue.toString(expression, { verbose: false });
  } catch {
    return null;
  }
}

function lastRunTone(
  status: string | undefined,
): "secondary" | "destructive" | "outline" {
  if (!status) return "outline";
  if (status === "failed" || status === "cancelled") return "destructive";
  if (status === "success") return "secondary";
  return "outline";
}

export default function SystemJobsPage() {
  const [rows, setRows] = useState<SystemTaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Task ids with an in-flight mutation, so a row can't double-fire. */
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<SystemTaskResponse | null>(null);

  // ── Database jobs (pg_cron) — the second section ──────────────────────────
  const [dbRows, setDbRows] = useState<DbJobResponse[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [dbFetching, setDbFetching] = useState(false);
  const [dbLoadError, setDbLoadError] = useState<string | null>(null);
  const [dbBusy, setDbBusy] = useState<Set<number>>(new Set());
  const [editingDbJob, setEditingDbJob] = useState<DbJobResponse | null>(null);

  useAdminSchedulingScopeSlice("system_jobs", () =>
    definedOnly({
      system_job_count: loading ? undefined : rows.length,
      system_job_enabled_count: loading
        ? undefined
        : rows.filter((r) => r.enabled).length,
      system_jobs_load_error: loadError ?? undefined,
      db_job_count: dbLoading ? undefined : dbRows.length,
      db_job_active_count: dbLoading
        ? undefined
        : dbRows.filter((r) => r.active).length,
      db_jobs_load_error: dbLoadError ?? undefined,
    }),
  );

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const res = await listSystemTasks();
      // Defensive: the endpoint is being built in parallel — never assume the
      // envelope is complete.
      setRows(Array.isArray(res?.tasks) ? res.tasks : []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  const loadDb = useCallback(async () => {
    setDbFetching(true);
    try {
      const res = await listDbJobs();
      setDbRows(Array.isArray(res?.jobs) ? res.jobs : []);
      setDbLoadError(null);
    } catch (err) {
      setDbLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDbLoading(false);
      setDbFetching(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadDb();
  }, [load, loadDb]);

  const markBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const applyPatched = (updated: SystemTaskResponse) =>
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

  const toggleEnabled = async (t: SystemTaskResponse) => {
    if (busy.has(t.id)) return;
    if (!t.enabled) {
      // Enabling starts REAL recurring server work — always confirm.
      const ok = await confirm({
        title: `Enable "${t.title}"?`,
        description: `This starts real recurring server work (${t.tool_name}${
          t.trigger ? `, ${cadenceText(t).toLowerCase()}` : ""
        }). It will keep running on its schedule until disabled.`,
        confirmLabel: "Enable",
      });
      if (!ok) return;
    }
    markBusy(t.id, true);
    try {
      const updated = await patchSystemTask(t.id, { enabled: !t.enabled });
      applyPatched(updated);
      toast.success(
        updated.enabled ? `${updated.title} enabled` : `${updated.title} disabled`,
      );
    } catch (err) {
      // The server refuses enabling a task with no registered handler — its
      // message reaches the admin verbatim.
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(t.id, false);
    }
  };

  const runNow = async (t: SystemTaskResponse) => {
    if (busy.has(t.id)) return;
    markBusy(t.id, true);
    try {
      await runSystemTaskNow(t.id);
      toast.success(`${t.title} queued to run now`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(t.id, false);
    }
  };

  const saveEdit = async (taskId: string, body: SystemTaskPatchRequest) => {
    markBusy(taskId, true);
    try {
      const updated = await patchSystemTask(taskId, body);
      applyPatched(updated);
      setEditing(null);
      toast.success(`${updated.title} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      markBusy(taskId, false);
    }
  };

  // No useMemo: the React Compiler is on repo-wide, and these cells close over
  // live handlers (`busy`, toggleEnabled, runNow) that must stay fresh.
  const columns: MatrxColumnDef<SystemTaskResponse>[] = [
      {
        id: "title",
        accessorKey: "title",
        header: "Job",
        width: 240,
        cell: (r) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{r.title}</div>
            {r.description && (
              <div
                className="text-xs text-muted-foreground line-clamp-1"
                title={r.description}
              >
                {r.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "tool_name",
        accessorKey: "tool_name",
        header: "Tool",
        width: 200,
        cell: (r) => (
          <span className="font-mono text-xs truncate" title={r.tool_name ?? undefined}>
            {r.tool_name ?? "—"}
          </span>
        ),
      },
      {
        id: "state",
        header: "State",
        accessorFn: (r) => (r.enabled ? "Enabled" : "Disabled"),
        filter: "select",
        width: 150,
        cell: (r) => (
          <span className="flex flex-wrap items-center gap-1">
            <Badge
              variant={r.enabled ? "secondary" : "outline"}
              className="text-[10px]"
            >
              {r.enabled ? "Enabled" : "Disabled"}
            </Badge>
            {r.handler_registered === false && (
              <Badge
                variant="destructive"
                className="gap-0.5 text-[10px]"
                title="No handler is registered on the server for this tool — enabling will be refused."
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                handler missing
              </Badge>
            )}
            {r.handler_gate_pending && (
              <Badge
                variant="outline"
                className="border-warning/60 text-[10px]"
                title="The handler is registered but waiting on a pending approval gate."
              >
                gate pending
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: "cadence",
        header: "Cadence",
        accessorFn: (r) => cadenceText(r),
        width: 220,
        cell: (r) => {
          const trig = r.trigger;
          if (!trig) {
            return <span className="text-xs text-muted-foreground">No trigger</span>;
          }
          if (trig.type === "cron") {
            const expr = String(
              (trig.config as Record<string, unknown> | null)?.expression ?? "",
            );
            const hint = cronHint(expr);
            return (
              <div className="min-w-0">
                <span className="font-mono text-xs">{expr || "cron"}</span>
                {hint && (
                  <div
                    className="text-[11px] text-muted-foreground line-clamp-1"
                    title={hint}
                  >
                    {hint}
                  </div>
                )}
              </div>
            );
          }
          return (
            <span className="text-xs">
              {cadenceText(r)}
              {trig.enabled === false && (
                <span className="ml-1 text-muted-foreground">(trigger off)</span>
              )}
            </span>
          );
        },
      },
      {
        id: "next_due",
        header: "Next due",
        accessorFn: (r) => r.trigger?.next_due_at ?? "",
        width: 120,
        cell: (r) => (
          <span className="text-xs">
            {r.enabled && r.trigger?.next_due_at
              ? humanizeRelative(r.trigger.next_due_at)
              : "—"}
          </span>
        ),
      },
      {
        id: "last_run",
        header: "Last run",
        accessorFn: (r) => r.last_run?.status ?? "",
        width: 170,
        cell: (r) => {
          const run = r.last_run;
          if (!run?.status) {
            return <span className="text-xs text-muted-foreground">Never</span>;
          }
          const when = run.finished_at ?? run.started_at;
          return (
            <span
              className="flex items-center gap-1.5"
              title={run.error_message ?? undefined}
            >
              <Badge variant={lastRunTone(run.status)} className="text-[10px]">
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {when ? humanizeRelative(when) : ""}
              </span>
              {run.error_message && (
                <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
              )}
            </span>
          );
        },
      },
  ];

  // Rendered in the table's own trailing Actions column (`rowActions`) — a
  // second hand-made actions column would duplicate the header the table
  // already owns.
  const renderRowActions = (r: SystemTaskResponse) => {
    const isBusy = busy.has(r.id);
    return (
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          variant={r.enabled ? "outline" : "default"}
          className="h-7 px-2 text-xs"
          disabled={isBusy}
          onClick={() => void toggleEnabled(r)}
        >
          {isBusy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Power className="h-3 w-3" />
          )}
          {r.enabled ? "Disable" : "Enable"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={isBusy}
          onClick={() => setEditing(r)}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={isBusy || r.handler_registered === false}
          title={
            r.handler_registered === false
              ? "No handler registered — nothing would run."
              : undefined
          }
          onClick={() => void runNow(r)}
        >
          <Play className="h-3 w-3" />
          Run now
        </Button>
      </span>
    );
  };

  // ── Database jobs (pg_cron) handlers + columns ────────────────────────────

  const markDbBusy = (jobid: number, on: boolean) =>
    setDbBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(jobid);
      else next.delete(jobid);
      return next;
    });

  const applyDbPatched = (updated: DbJobResponse) =>
    setDbRows((prev) =>
      prev.map((r) =>
        r.jobid === updated.jobid
          ? // The PATCH wire does not echo last_run — keep the one we have.
            { ...updated, last_run: r.last_run }
          : r,
      ),
    );

  const toggleDbActive = async (j: DbJobResponse) => {
    if (dbBusy.has(j.jobid)) return;
    const name = j.jobname ?? `job ${j.jobid}`;
    // Both directions state their consequence: these are the database's own
    // maintenance jobs — pruning, refreshes, partition provisioning.
    const ok = await confirm({
      title: j.active ? `Disable "${name}"?` : `Enable "${name}"?`,
      description: j.active
        ? `This stops real database maintenance. "${name}" (${j.schedule}) will no longer run, and whatever it maintains — pruning, refreshes, partitions — stops with it until re-enabled.`
        : `This starts real recurring database work: "${name}" will run ${j.schedule} inside Postgres until disabled.`,
      confirmLabel: j.active ? "Disable" : "Enable",
    });
    if (!ok) return;
    markDbBusy(j.jobid, true);
    try {
      const updated = await patchDbJob(j.jobid, { active: !j.active });
      applyDbPatched(updated);
      toast.success(`${name} ${updated.active ? "enabled" : "disabled"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      markDbBusy(j.jobid, false);
    }
  };

  const saveDbEdit = async (jobid: number, body: DbJobPatchRequest) => {
    markDbBusy(jobid, true);
    try {
      const updated = await patchDbJob(jobid, body);
      applyDbPatched(updated);
      setEditingDbJob(null);
      toast.success(`${updated.jobname ?? `job ${jobid}`} updated`);
    } catch (err) {
      // cron.alter_job's own validation error reaches the admin verbatim.
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      markDbBusy(jobid, false);
    }
  };

  const dbColumns: MatrxColumnDef<DbJobResponse>[] = [
    {
      id: "jobname",
      accessorFn: (r) => r.jobname ?? String(r.jobid),
      header: "Job",
      width: 240,
      cell: (r) => (
        <span className="font-medium truncate" title={r.jobname ?? undefined}>
          {r.jobname ?? `job ${r.jobid}`}
        </span>
      ),
    },
    {
      id: "schedule",
      accessorKey: "schedule",
      header: "Schedule",
      width: 200,
      cell: (r) => {
        const hint = cronHint(r.schedule);
        return (
          <div className="min-w-0">
            <span className="font-mono text-xs">{r.schedule}</span>
            {hint && (
              <div
                className="text-[11px] text-muted-foreground line-clamp-1"
                title={hint}
              >
                {hint}
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "state",
      header: "State",
      accessorFn: (r) => (r.active ? "Active" : "Inactive"),
      filter: "select",
      width: 110,
      cell: (r) => (
        <Badge variant={r.active ? "secondary" : "outline"} className="text-[10px]">
          {r.active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      id: "last_run",
      header: "Last run",
      accessorFn: (r) => r.last_run?.status ?? "",
      width: 170,
      cell: (r) => {
        const run = r.last_run;
        if (!run?.status) {
          return <span className="text-xs text-muted-foreground">Never</span>;
        }
        const failed = run.status === "failed";
        const when = run.end_time ?? run.start_time;
        return (
          <span
            className="flex items-center gap-1.5"
            title={run.return_message ?? undefined}
          >
            <Badge
              variant={failed ? "destructive" : "secondary"}
              className="text-[10px]"
            >
              {run.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {when ? humanizeRelative(when) : ""}
            </span>
            {failed && (
              <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
            )}
          </span>
        );
      },
    },
    {
      id: "command",
      accessorKey: "command",
      header: "Command",
      width: 280,
      cell: (r) => (
        <span className="font-mono text-xs truncate block" title={r.command}>
          {r.command}
        </span>
      ),
    },
  ];

  const renderDbRowActions = (j: DbJobResponse) => {
    const isBusy = dbBusy.has(j.jobid);
    return (
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          variant={j.active ? "outline" : "default"}
          className="h-7 px-2 text-xs"
          disabled={isBusy}
          onClick={() => void toggleDbActive(j)}
        >
          {isBusy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Power className="h-3 w-3" />
          )}
          {j.active ? "Disable" : "Enable"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={isBusy}
          onClick={() => setEditingDbJob(j)}
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </span>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div
        className="min-h-0 flex-1 basis-3/5"
        data-surface-value="system_job_count"
      >
        <MatrxDataTable
          urlState={{ id: "scheduling-system-jobs" }}
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          rowActions={(r) => renderRowActions(r)}
          emptyState={{
            title: loadError
              ? "System jobs could not be loaded"
              : "No system jobs",
            description:
              loadError ??
              "The server has not registered any recurring system jobs (kind=tool) yet.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search title, tool…",
            actions: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void load()}
                disabled={fetching}
              >
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            ),
          }}
          copy={{
            label: "System job",
            listLabel: "System jobs (this view)",
            location: "/administration/automation/scheduling/system-jobs",
            rowKind: "system-job",
            listKind: "system-jobs",
            humanRow: (r) =>
              [
                `Title: ${r.title}`,
                `Tool: ${r.tool_name}`,
                `State: ${r.enabled ? "enabled" : "disabled"}`,
                `Cadence: ${cadenceText(r)}`,
                `Next due: ${humanizeRelative(r.trigger?.next_due_at ?? null)}`,
                `Last run: ${r.last_run?.status ?? "never"}`,
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id, enabled: r.enabled }),
          }}
        />
      </div>

      <div
        className="min-h-0 flex-1 basis-2/5"
        data-surface-value="db_job_count"
      >
        <div className="mb-1.5">
          <h2 className="text-sm font-medium">Database jobs (pg_cron)</h2>
          <p className="text-xs text-muted-foreground">
            SQL scheduled inside Postgres itself — pruning, refreshes,
            partition upkeep. Same controls; no Run now (several are
            destructive purges, and pg_cron has no run-once).
          </p>
        </div>
        <MatrxDataTable
          urlState={{ id: "scheduling-db-jobs" }}
          data={dbRows}
          columns={dbColumns}
          getRowId={(r) => String(r.jobid)}
          isLoading={dbLoading}
          isFetching={dbFetching}
          pageSize={25}
          rowActions={(r) => renderDbRowActions(r)}
          emptyState={{
            title: dbLoadError
              ? "Database jobs could not be loaded"
              : "No database jobs",
            description:
              dbLoadError ??
              "The database has no pg_cron jobs registered.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search job, command…",
            actions: (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadDb()}
                disabled={dbFetching}
              >
                {dbFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            ),
          }}
          copy={{
            label: "Database job",
            listLabel: "Database jobs (this view)",
            location: "/administration/automation/scheduling/system-jobs",
            rowKind: "db-job",
            listKind: "db-jobs",
            humanRow: (r) =>
              [
                `Job: ${r.jobname ?? r.jobid}`,
                `Schedule: ${r.schedule}`,
                `State: ${r.active ? "active" : "inactive"}`,
                `Last run: ${r.last_run?.status ?? "never"}`,
                `Command: ${r.command}`,
              ].join("\n"),
            rowAttributes: (r) => ({ jobid: r.jobid, active: r.active }),
          }}
        />
      </div>

      {editing && (
        <SystemJobEditDialog
          task={editing}
          saving={busy.has(editing.id)}
          onClose={() => setEditing(null)}
          onSave={(body) => void saveEdit(editing.id, body)}
        />
      )}

      {editingDbJob && (
        <DbJobEditDialog
          job={editingDbJob}
          saving={dbBusy.has(editingDbJob.jobid)}
          onClose={() => setEditingDbJob(null)}
          onSave={(body) => void saveDbEdit(editingDbJob.jobid, body)}
        />
      )}
    </div>
  );
}

// ── Edit dialog ──────────────────────────────────────────────────────────────
//
// Changes the trigger (interval seconds OR cron expression + tz) and the
// tool's variables_args. Sends ONLY what changed: `trigger` when the cadence
// was touched, `variables_args` when the args JSON was touched — the PATCH
// contract treats every field as optional.

function SystemJobEditDialog({
  task,
  saving,
  onClose,
  onSave,
}: {
  task: SystemTaskResponse;
  saving: boolean;
  onClose: () => void;
  onSave: (body: SystemTaskPatchRequest) => void;
}) {
  const initialConfig = (task.trigger?.config ?? {}) as Record<string, unknown>;
  const initialType =
    task.trigger?.type === "cron" ? ("cron" as const) : ("interval" as const);
  const [type, setType] = useState<"interval" | "cron">(initialType);
  const [everySeconds, setEverySeconds] = useState(() =>
    initialType === "interval" && initialConfig.every_seconds != null
      ? String(initialConfig.every_seconds)
      : "",
  );
  const [expression, setExpression] = useState(() =>
    initialType === "cron" && typeof initialConfig.expression === "string"
      ? initialConfig.expression
      : "",
  );
  const [tz, setTz] = useState(() =>
    initialType === "cron" && typeof initialConfig.tz === "string"
      ? initialConfig.tz
      : "",
  );
  const [argsText, setArgsText] = useState("");
  const [argsTouched, setArgsTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hint = type === "cron" ? cronHint(expression) : null;

  const submit = () => {
    setFormError(null);
    const body: SystemTaskPatchRequest = {};

    if (type === "interval") {
      const secs = Number(everySeconds);
      if (!Number.isFinite(secs) || secs <= 0 || !Number.isInteger(secs)) {
        setFormError("Interval must be a positive whole number of seconds.");
        return;
      }
      body.trigger = { type: "interval", config: { every_seconds: secs } };
    } else {
      if (!expression.trim()) {
        setFormError("Cron expression is required.");
        return;
      }
      if (!cronHint(expression)) {
        setFormError(
          "That cron expression does not parse (5 fields: minute hour day-of-month month day-of-week).",
        );
        return;
      }
      const config: Record<string, unknown> = {
        expression: expression.trim(),
      };
      if (tz.trim()) config.tz = tz.trim();
      body.trigger = { type: "cron", config };
    }

    if (argsTouched) {
      const text = argsText.trim();
      if (text) {
        try {
          const parsed: unknown = JSON.parse(text);
          if (
            parsed === null ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
          ) {
            setFormError("Args must be a JSON object.");
            return;
          }
          body.variables_args = parsed as Record<string, unknown>;
        } catch {
          setFormError("Args is not valid JSON.");
          return;
        }
      } else {
        body.variables_args = {};
      }
    }

    onSave(body);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {task.title}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{task.tool_name}</span> — change
            when it runs and what it runs with. Enable/disable lives on the row.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Trigger type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "interval" | "cron")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">Interval</SelectItem>
                <SelectItem value="cron">Cron</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "interval" ? (
            <div className="space-y-1.5">
              <Label htmlFor="system-job-every-seconds">Every (seconds)</Label>
              <Input
                id="system-job-every-seconds"
                inputMode="numeric"
                value={everySeconds}
                onChange={(e) => setEverySeconds(e.target.value)}
                placeholder="900"
              />
              {Number(everySeconds) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {humanizeTrigger("interval", {
                    every_seconds: Number(everySeconds),
                  })}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="system-job-cron">Cron expression</Label>
                <Input
                  id="system-job-cron"
                  className="font-mono"
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder="0 9 * * 1-5"
                />
                <p className="text-xs text-muted-foreground">
                  {hint ??
                    "5 fields: minute hour day-of-month month day-of-week."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="system-job-tz">Timezone (IANA, optional)</Label>
                <Input
                  id="system-job-tz"
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  placeholder="America/Los_Angeles"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="system-job-args">Args (JSON object)</Label>
            <Textarea
              id="system-job-args"
              className="font-mono text-xs"
              rows={4}
              value={argsText}
              onChange={(e) => {
                setArgsText(e.target.value);
                setArgsTouched(true);
              }}
              placeholder='Leave untouched to keep the current args. {} clears them.'
            />
            <p className="text-xs text-muted-foreground">
              Sent as <span className="font-mono">variables_args</span> only if
              you edit this field. The current server-side args are not echoed
              on this wire, so this replaces rather than merges.
            </p>
          </div>

          {formError && (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── DB job edit dialog ───────────────────────────────────────────────────────
//
// pg_cron takes either a 5-field cron expression (UTC) or an interval string
// like "30 seconds". cron.alter_job validates server-side and its refusal
// reaches the admin verbatim, so the client only pre-validates the obvious.

function DbJobEditDialog({
  job,
  saving,
  onClose,
  onSave,
}: {
  job: DbJobResponse;
  saving: boolean;
  onClose: () => void;
  onSave: (body: DbJobPatchRequest) => void;
}) {
  const [schedule, setSchedule] = useState(job.schedule);
  const [formError, setFormError] = useState<string | null>(null);

  const hint = cronHint(schedule);
  const looksLikeInterval = /^\s*\d+\s+seconds?\s*$/i.test(schedule);

  const submit = () => {
    setFormError(null);
    const next = schedule.trim();
    if (!next) {
      setFormError("Schedule is required.");
      return;
    }
    if (next === job.schedule) {
      onClose();
      return;
    }
    onSave({ schedule: next });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {job.jobname ?? `job ${job.jobid}`}</DialogTitle>
          <DialogDescription>
            Change when this database job runs. Active/inactive lives on the
            row.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="db-job-schedule">Schedule</Label>
            <Input
              id="db-job-schedule"
              className="font-mono"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 3 * * *  or  30 seconds"
            />
            <p className="text-xs text-muted-foreground">
              {hint ??
                (looksLikeInterval
                  ? `Every ${schedule.trim().toLowerCase()}`
                  : "5-field cron (minute hour day-of-month month day-of-week, UTC) or an interval like “30 seconds”.")}
            </p>
          </div>

          <div className="rounded-md bg-muted/50 p-2">
            <p className="font-mono text-[11px] break-all text-muted-foreground">
              {job.command}
            </p>
          </div>

          {formError && (
            <p className="text-xs text-destructive" role="alert">
              {formError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
