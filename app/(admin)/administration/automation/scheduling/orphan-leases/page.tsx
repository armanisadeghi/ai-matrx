// Scheduling admin › Orphan leases — canonical MatrxDataTable over expired
// claimed/running scheduler.sch_run rows, with the force-fail action per row.
//
// THE DOOR LAW: `sch_run.task_id` is a SCHEDULED task (`/schedules/<id>`), not a
// workspace `task` — the Task column names the schedule (title embedded off
// `sch_run_task_id_fkey`) and links it explicitly, never via the `<token>_id`
// guess. The destructive confirm carries that same door, so an admin can look
// at what they are about to force-fail without losing the dialog.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { StatusPill } from "@/features/scheduling/components/shared/StatusPill";
import { humanizeRelative } from "@/features/scheduling/utils/triggerHumanize";
import {
  fetchOrphanLeases,
  markRunFailedAdmin,
  type AdminRunRow,
} from "@/lib/services/scheduling-admin-service";
import { scheduleHref } from "@/features/scheduling/constants/routes";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useAdminSchedulingScopeSlice } from "@/features/scheduling/lib/admin-scheduling-scope";

export default function OrphanLeasesPage() {
  const [rows, setRows] = useState<AdminRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Read-only evidence. Force-failing a run is an operator gesture with
  // production blast radius, so it is a row button and never a write target.
  useAdminSchedulingScopeSlice("orphan_leases", () => ({
    orphan_lease_row_count: rows.length,
  }));

  const load = useCallback(async () => {
    setFetching(true);
    try {
      setRows(await fetchOrphanLeases());
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

  const handleKill = useCallback(
    async (run: AdminRunRow) => {
      const ok = await confirm({
        title: "Mark run as failed",
        description: (
          <span className="flex flex-col gap-1">
            <span>
              Force-fail run{" "}
              <code className="font-mono text-xs">{run.id.slice(0, 8)}…</code>?
              The scanner will re-enqueue on the next tick for recurring
              triggers.
            </span>
            {/* The dialog names the schedule, so it opens the schedule — in a
                new tab, because losing this dialog to answer "which one?" is
                the dead end. */}
            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              Schedule:
              <EntityRef
                token="scheduled_task"
                id={run.task_id}
                href={scheduleHref(run.task_id)}
                alwaysShowActions
              />
            </span>
          </span>
        ),
        confirmLabel: "Mark failed",
        variant: "destructive",
      });
      if (!ok) return;
      setBusyId(run.id);
      try {
        await markRunFailedAdmin(
          run.id,
          "Marked failed by admin (orphan lease)",
        );
        toast.success("Run marked failed");
        await load();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed");
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

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
        id: "claimed_at",
        accessorKey: "claimed_at",
        header: "Claimed",
        cell: (r) => (
          <span className="text-xs">{humanizeRelative(r.claimed_at)}</span>
        ),
        width: 120,
      },
      {
        id: "claim_expires_at",
        accessorKey: "claim_expires_at",
        header: "Expired",
        cell: (r) => (
          <span className="text-xs">
            {humanizeRelative(r.claim_expires_at)}
          </span>
        ),
        width: 120,
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
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>
          Runs in <code>claimed</code> or <code>running</code> state whose{" "}
          <code>claim_expires_at</code> is in the past. The scanner normally
          re-claims these on the next tick — if a row stays here for more than a
          few minutes, something's wrong upstream.
        </span>
      </p>
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          urlState={{ id: "scheduling-orphan-leases" }}
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          isLoading={loading}
          isFetching={fetching}
          pageSize={50}
          emptyState={{
            title: "No orphan leases",
            description: "System is healthy.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search orphan leases…",
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
            label: "Orphan lease",
            listLabel: "Orphan leases (this view)",
            location: "/administration/automation/scheduling/orphan-leases",
            rowKind: "orphan-lease",
            listKind: "orphan-leases",
            humanRow: (r) =>
              [
                `Run: ${r.id}`,
                `Task: ${r.task_title ?? "(title unavailable)"} (${r.task_id})`,
                `Status: ${r.status}`,
                `Claimed: ${humanizeRelative(r.claimed_at)}`,
                `Expired: ${humanizeRelative(r.claim_expires_at)}`,
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
          rowActions={(r) => (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleKill(r);
              }}
              disabled={busyId === r.id}
              className="text-destructive"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Mark failed
            </Button>
          )}
        />
      </div>
    </div>
  );
}
