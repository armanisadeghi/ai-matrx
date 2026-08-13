// Scheduling admin › All runs — canonical MatrxDataTable over scheduler.sch_run
// rows. Status/surface stay server-side (the 200-row window must narrow at the
// query, not the client); every fetched column still sorts + filters locally.
//
// THE DOOR LAW: `sch_run.task_id` points at a SCHEDULED task (`/schedules/<id>`,
// FK `sch_run_task_id_fkey` → `scheduler.sch_task`), NOT at a workspace `task`
// whose registry route is `/tasks/<id>` — a door onto a different record is
// worse than none, so the Task column never takes the `<token>_id` guess: it
// names the schedule (title embedded off the FK) and links it explicitly.
// A run's OWN id opens nothing (no per-run route exists) — it stays copy-only.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { StatusPill } from "@/features/scheduling/components/shared/StatusPill";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import {
  fetchAllRunsAdmin,
  type AdminRunRow,
} from "@/lib/services/scheduling-admin-service";
import { scheduleHref } from "@/features/scheduling/constants/routes";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { RunStatus, Surface } from "@/features/scheduling/types";
import { SURFACE_VALUES } from "@/features/scheduling/constants/surfaces";
import { useAdminSchedulingScopeSlice } from "@/features/scheduling/lib/admin-scheduling-scope";

const STATUSES: RunStatus[] = [
  "queued",
  "claimed",
  "running",
  "success",
  "failed",
  "cancelled",
  "skipped",
];

export default function AdminRunsPage() {
  const [rows, setRows] = useState<AdminRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [status, setStatus] = useState<"__all__" | RunStatus>("__all__");
  const [surface, setSurface] = useState<"__all__" | Surface>("__all__");

  // The pickers' "__all__" sentinel is emitted as "any" — the vocabulary the
  // manifest declares and the word the UI actually shows ("Any status").
  useAdminSchedulingScopeSlice("runs", () => ({
    run_status_filter: status === "__all__" ? "any" : status,
    run_surface_filter: surface === "__all__" ? "any" : surface,
    run_row_count: rows.length,
  }));

  const load = useCallback(async () => {
    setFetching(true);
    try {
      setRows(
        await fetchAllRunsAdmin({
          status: status === "__all__" ? null : status,
          surface: surface === "__all__" ? null : surface,
          limit: 200,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [status, surface]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo((): MatrxColumnDef<AdminRunRow>[] => {
    return [
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        filter: "select",
        width: 110,
        cell: (r) => <StatusPill status={r.status} />,
      },
      {
        id: "task_id",
        header: "Task",
        accessorFn: (r) => r.task_title ?? r.task_id,
        width: 240,
        cell: (r) => (
          <EntityRef
            token="scheduled_task"
            id={r.task_id}
            name={r.task_title}
            href={scheduleHref(r.task_id)}
          />
        ),
      },
      {
        id: "surface",
        accessorKey: "surface",
        header: "Surface",
        filter: "select",
        width: 130,
        cell: (r) => <span className="text-xs">{r.surface ?? "—"}</span>,
      },
      {
        id: "started",
        header: "Started",
        accessorFn: (r) => r.started_at ?? r.claimed_at ?? r.created_at,
        cell: (r) => (
          <span className="text-xs">
            {humanizeRelative(r.started_at ?? r.claimed_at ?? r.created_at)}
          </span>
        ),
        width: 120,
      },
      {
        id: "finished_at",
        accessorKey: "finished_at",
        header: "Finished",
        cell: (r) => (
          <span className="text-xs">{humanizeRelative(r.finished_at)}</span>
        ),
        width: 120,
      },
      {
        id: "summary",
        header: "Summary",
        accessorFn: (r) => r.result_summary ?? r.error_message ?? "",
        cell: (r) => (
          <span className="block max-w-[24rem] truncate text-xs">
            {r.result_summary ?? r.error_message ?? "—"}
          </span>
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          urlState={{ id: "scheduling-runs" }}
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          emptyState={{ title: "No runs match" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search runs…",
            facets: [
              {
                type: "custom",
                id: "server-filters",
                render: () => (
                  <div className="flex items-center gap-2">
                    <Select
                      value={status}
                      onValueChange={(v) =>
                        setStatus(v as "__all__" | RunStatus)
                      }
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Any status</SelectItem>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={surface}
                      onValueChange={(v) =>
                        setSurface(v as "__all__" | Surface)
                      }
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Any surface</SelectItem>
                        {SURFACE_VALUES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ),
              },
            ],
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
            label: "Scheduled run",
            listLabel: "Scheduled runs (this view)",
            location: "/administration/automation/scheduling/runs",
            rowKind: "scheduled-run",
            listKind: "scheduled-runs",
            humanRow: (r) =>
              [
                `Run: ${r.id}`,
                `Task: ${r.task_title ?? "(title unavailable)"} (${r.task_id})`,
                `Status: ${r.status}`,
                `Surface: ${r.surface ?? "—"}`,
                `Summary: ${r.result_summary ?? r.error_message ?? "—"}`,
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id, status: r.status }),
          }}
          detail={{
            title: (r) => `Run ${r.id.slice(0, 8)}…`,
            description: (r) => (
              <EntityRef
                token="scheduled_task"
                id={r.task_id}
                name={r.task_title}
                href={scheduleHref(r.task_id)}
                alwaysShowActions
              />
            ),
          }}
        />
      </div>
    </div>
  );
}
