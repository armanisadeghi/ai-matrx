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

import { useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { StatusPill } from "@/features/scheduling/components/shared/StatusPill";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import {
  fetchRunsAdminPage,
  type AdminRunRow,
} from "@/lib/services/scheduling-admin-service";
import {
  serverTableInitialState,
  useServerTable,
} from "@/features/admin/shared/server-table/useServerTable";
import { adminScheduleHref } from "@/features/scheduling/constants/routes";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { RunStatus, Surface } from "@/features/scheduling/types";
import { SURFACE_VALUES } from "@/features/scheduling/constants/surfaces";
import { useAdminSchedulingScopeSlice } from "@/features/scheduling/lib/admin-scheduling-scope";
import { useScheduledRunMenuSection } from "@/features/scheduling/components/shared/scheduling-menu-sections";

const STATUSES: RunStatus[] = [
  "queued",
  "claimed",
  "running",
  "success",
  "failed",
  "cancelled",
  "skipped",
];

const INITIAL_STATE = serverTableInitialState({ id: "created_at", direction: "desc" });

export default function AdminRunsPage() {
  const [status, setStatus] = useState<"__all__" | RunStatus>("__all__");
  const [surface, setSurface] = useState<"__all__" | Surface>("__all__");

  // Search, column filters, sort and paging — and the two pickers below — are answered by the
  // database over EVERY run (fetchRunsAdminPage); the table holds one page and shows the server's total.
  const { rows, total, loading, reload, tableProps } = useServerTable<AdminRunRow>(
    (state) =>
      fetchRunsAdminPage(state, {
        status: status === "__all__" ? null : status,
        surface: surface === "__all__" ? null : surface,
      }),
    INITIAL_STATE,
    "runs",
    `${status}|${surface}`,
    "scheduling-runs",
  );
  const fetching = loading;
  const load = reload;

  // The pickers' "__all__" sentinel is emitted as "any" — the vocabulary the
  // manifest declares and the word the UI actually shows ("Any status").
  useAdminSchedulingScopeSlice("runs", () => ({
    run_status_filter: status === "__all__" ? "any" : status,
    run_surface_filter: surface === "__all__" ? "any" : surface,
    run_row_count: total,
  }));

  // ONE right-click menu for the whole pane, shared with orphan-leases (same
  // row shape — `useScheduledRunMenuSection` is the identity's ONE builder).
  const rowMenu = useScheduledRunMenuSection<AdminRunRow>({
    rows: () => rows,
    content: (r) =>
      [
        `Run: ${r.id}`,
        `Task: ${r.task_title ?? "(title unavailable)"} (${r.task_id})`,
        `Status: ${r.status}`,
        `Surface: ${r.surface ?? "—"}`,
      ].join("\n"),
    onMarkedFailed: () => load(),
  });

  const columns = useMemo((): MatrxColumnDef<AdminRunRow>[] => {
    return [
      {
        id: "status",
        accessorKey: "status",
        header: "Status",
        // The Status picker in the toolbar owns this filter (server-side); a second one would disagree.
        filter: false,
        width: 110,
        cell: (r) => <StatusPill status={r.status} />,
      },
      {
        id: "task_id",
        header: "Task",
        accessorFn: (r) => r.task_title ?? r.task_id,
        filter: "text",
        // Sorting by an embedded task's title is not offered by the query.
        sortable: false,
        width: 240,
        cell: (r) => (
          <EntityRef
            token="scheduled_task"
            id={r.task_id}
            name={r.task_title}
            href={adminScheduleHref(r.task_id)}
          />
        ),
      },
      {
        id: "surface",
        accessorKey: "surface",
        header: "Surface",
        // The Surface picker in the toolbar owns this filter (server-side).
        filter: false,
        width: 130,
        cell: (r) => <span className="text-xs">{r.surface ?? "—"}</span>,
      },
      {
        id: "started",
        header: "Started",
        accessorFn: (r) => r.started_at ?? r.claimed_at ?? r.created_at,
        // Falls back across three columns; the database sorts started_at and filters Queued / Finished.
        filter: false,
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
        filter: "date",
        cell: (r) => (
          <span className="text-xs">{humanizeRelative(r.finished_at)}</span>
        ),
        width: 120,
      },
      {
        id: "created_at",
        accessorKey: "created_at",
        header: "Queued",
        filter: "date",
        hidden: true,
        width: 120,
        cell: (r) => <span className="text-xs">{humanizeRelative(r.created_at)}</span>,
      },
      {
        id: "summary",
        header: "Summary",
        // The toolbar search matches summary and error text in the database.
        filter: false,
        sortable: false,
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
        filter: false,
        sortable: false,
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="min-h-0 flex-1" data-surface-value="run_row_count">
        <NonEditableContextMenu
          sourceFeature="scheduled"
          contentSource={{ type: "raw" }}
          getApplicationScope={rowMenu.getApplicationScope}
          resolveContextOnOpen={rowMenu.resolveContextOnOpen}
          extraSections={rowMenu.sections}
        >
        <MatrxDataTable
                    {...tableProps}
          columns={columns}
          getRowId={(r) => r.id}
          emptyState={{ title: "No runs match" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search task, summary, error or a run id…",
            facets: [
              {
                type: "custom",
                id: "server-filters",
                filter: {
                  active: status !== "__all__" || surface !== "__all__",
                  onReset: () => {
                    setStatus("__all__");
                    setSurface("__all__");
                  },
                },
                render: () => (
                  <div className="flex items-center gap-2">
                    <div data-surface-value="run_status_filter">
                      <Select
                        value={status}
                        onValueChange={(v) =>
                          setStatus(v as "__all__" | RunStatus)
                        }
                      >
                        <SelectTrigger className="w-36">
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
                    </div>
                    <div data-surface-value="run_surface_filter">
                      <Select
                        value={surface}
                        onValueChange={(v) =>
                          setSurface(v as "__all__" | Surface)
                        }
                      >
                        <SelectTrigger className="w-40">
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
                  </div>
                ),
              },
            ],
            actions: (
              <Button
                variant="outline"
                onClick={() => load()}
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
                href={adminScheduleHref(r.task_id)}
                alwaysShowActions
              />
            ),
          }}
        />
        </NonEditableContextMenu>
      </div>
    </div>
  );
}
