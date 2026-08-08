// Scheduling admin › All tasks — canonical MatrxDataTable over sch.task rows.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import {
  fetchAllTasksAdmin,
  type AdminTaskRow,
} from "@/lib/services/scheduling-admin-service";
import { humanizeRelative, humanizeTrigger } from "@/features/scheduling/utils/triggerHumanize";

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
          <div>
            <div className="font-medium">{r.title}</div>
            {r.description && (
              <div className="text-xs text-muted-foreground line-clamp-1">
                {r.description}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (r) => r.user_email ?? r.user_id,
        cell: (r) => (
          <span className="font-mono text-xs">{r.user_email ?? r.user_id.slice(0, 8)}</span>
        ),
        width: 200,
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
      { id: "id", accessorKey: "id", header: "ID", cellKind: "uuid", width: 110 },
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
          detail={{ title: (r) => r.title, description: (r) => r.description ?? undefined }}
        />
      </div>
    </div>
  );
}
