// Scheduling admin › All tasks — canonical MatrxDataTable over scheduler.sch_task
// rows.
//
// THE DOOR LAW: these are SCHEDULED tasks, and their record route is
// `/schedules/<id>` (features/scheduling). They are NOT workspace `task` rows —
// the `task` entity token's `/tasks/<id>` would open a different record
// entirely, so every door here is wired explicitly.
//
// SCOPE CAVEAT: `scheduler.sch_task` / `sch_run` carry only the canonical
// std_select/std_update/std_delete policies — there is NO admin clause live
// (the old `migrations/sch_admin_rls.sql` targeted these tables back when they
// lived in the `public` schema, and was superseded by the RLS
// canonicalization). So this console shows the VIEWER'S OWN schedules, not the
// fleet. See FOUND_DEFECTS D140.
//
// The schema name above is deliberately spelled out in prose rather than as a
// qualified table reference: `pnpm check:dead-relations` scans comments too, so
// writing the pre-reorg name inline made this file report a dead relation on
// every run even though every query here goes through
// `.schema("scheduler").from(...)`. A guard that cries wolf gets ignored.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  fetchAllTasksAdmin,
  type AdminTaskRow,
} from "@/lib/services/scheduling-admin-service";
import { humanizeRelative, humanizeTrigger } from "@/features/scheduling/utils/triggerHumanize";
import { scheduleHref } from "@/features/scheduling/constants/routes";

function triggerText(r: AdminTaskRow): string {
  return r.trigger
    ? humanizeTrigger(r.trigger.type, r.trigger.config as Record<string, unknown>)
    : "—";
}

export default function AdminTasksPage() {
  const [rows, setRows] = useState<AdminTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      setRows(await fetchAllTasksAdmin({ limit: 200 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo((): MatrxColumnDef<AdminTaskRow>[] => {
    return [
      {
        id: "title",
        accessorKey: "title",
        header: "Title",
        width: 260,
        cell: (r) => (
          <div className="min-w-0">
            <EntityRef
              token="scheduled_task"
              id={r.id}
              name={r.title}
              href={scheduleHref(r.id)}
              className="font-medium"
            />
            {r.description && (
              <div className="text-xs text-muted-foreground line-clamp-1">
                {r.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "agent",
        header: "Agent",
        // The row already carries the agent it runs — rendering it without a
        // door would be knowing the answer and withholding it.
        accessorFn: (r) => r.agent?.agent_id ?? "",
        cellKind: "uuid",
        fk: { token: "agent", label: "Agent" },
        width: 130,
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (r) => r.user_email ?? r.user_id,
        // No `user` entity token and no `/users/<id>` route exist — the id
        // stays copyable rather than pointing at a route that isn't there.
        cell: (r) => (
          <span className="flex min-w-0 items-center gap-1.5">
            {r.user_email ? (
              <span className="min-w-0 truncate text-xs" title={r.user_email}>
                {r.user_email}
              </span>
            ) : null}
            <MatrxUuidCell value={r.user_id} label="Owner user id" />
          </span>
        ),
        width: 240,
      },
      {
        id: "trigger",
        header: "Trigger",
        accessorFn: triggerText,
        cell: (r) => <span className="text-xs">{triggerText(r)}</span>,
        width: 200,
      },
      {
        id: "next_due_at",
        accessorKey: "next_due_at",
        header: "Next",
        cell: (r) => <span className="text-xs">{humanizeRelative(r.next_due_at)}</span>,
        width: 120,
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Updated",
        cell: (r) => <span className="text-xs">{humanizeRelative(r.updated_at)}</span>,
        width: 120,
      },
      {
        id: "state",
        header: "State",
        accessorFn: (r) => (r.enabled ? "Enabled" : "Paused"),
        filter: "select",
        width: 100,
        cell: (r) => (
          <Badge variant={r.enabled ? "secondary" : "outline"} className="text-[10px]">
            {r.enabled ? "Enabled" : "Paused"}
          </Badge>
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        fk: { label: "Scheduled task", href: (id) => scheduleHref(id) },
        width: 110,
      },
    ];
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          emptyState={{ title: "No tasks match" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search title, owner, trigger…",
            actions: (
              <Button size="sm" variant="outline" onClick={() => void load()} disabled={fetching}>
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            ),
          }}
          copy={{
            label: "Scheduled task",
            listLabel: "Scheduled tasks (this view)",
            location: "/administration/automation/scheduling/tasks",
            rowKind: "scheduled-task",
            listKind: "scheduled-tasks",
            humanRow: (r) =>
              [
                `Title: ${r.title}`,
                `Owner: ${r.user_email ?? r.user_id}`,
                `Trigger: ${triggerText(r)}`,
                `Next: ${humanizeRelative(r.next_due_at)}`,
                `State: ${r.enabled ? "enabled" : "paused"}`,
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id, enabled: r.enabled }),
          }}
          detail={{
            // The panel names the record, so the panel opens it too.
            title: (r) => (
              <EntityRef
                token="scheduled_task"
                id={r.id}
                name={r.title}
                href={scheduleHref(r.id)}
                alwaysShowActions
              />
            ),
            description: (r) => r.description ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
