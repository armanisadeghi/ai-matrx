"use client";

// features/admin/applications/config/components/AppConfigHistoryPanel.tsx
//
// Version history for one app_config row. Reads public.app_config_history
// (admin-read RLS) directly via supabase-js into the canonical MatrxDataTable:
// each snapshot is a sortable/filterable row, opening a row diffs it against
// the CURRENT live row in the side panel, and "Restore" goes through the same
// admin_update_app_config RPC (creating a new history entry), never a direct
// table write.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { History, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { createClient } from "@/utils/supabase/client";
import { configSnapshotJson } from "@/features/admin/applications/config/schema";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import type {
  AppConfigHistoryRow,
  AppConfigRow,
} from "@/features/admin/applications/config/types";

interface AppConfigHistoryPanelProps {
  app: string;
  currentRow: AppConfigRow;
  /** Applies the snapshot via the RPC; the parent owns the write path.
   *  Resolves true on success, false on failure — never rejects. */
  onRestore: (entry: AppConfigHistoryRow) => Promise<boolean>;
  /** Bumped by the parent after every successful save to refetch history. */
  refreshKey: number;
}

export function AppConfigHistoryPanel({
  app,
  currentRow,
  onRestore,
  refreshKey,
}: AppConfigHistoryPanelProps) {
  const { toast } = useToast();
  const adminEmails = useAdminEmails();
  // Keyed by (app, refreshKey) so a key change shows the loading state
  // without a synchronous reset inside the effect.
  const loadKey = `${app}:${refreshKey}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    entries: AppConfigHistoryRow[];
  } | null>(null);
  const [restoreTarget, setRestoreTarget] =
    useState<AppConfigHistoryRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("app_config_history")
        .select("*")
        .eq("app", app)
        .order("changed_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast({
          title: "Failed to load history",
          description: error.message,
          variant: "destructive",
        });
        setLoaded({ key: loadKey, entries: [] });
        return;
      }
      setLoaded({ key: loadKey, entries: data ?? [] });
    })();
    return () => {
      cancelled = true;
    };
  }, [app, loadKey, toast]);

  const entries = loaded && loaded.key === loadKey ? loaded.entries : null;
  const currentJson = configSnapshotJson(currentRow);

  const whoLabel = useCallback(
    (changedBy: string | null): string => {
      if (!changedBy) return "—";
      return adminEmails[changedBy] ?? changedBy.slice(0, 8);
    },
    [adminEmails],
  );

  const columns = useMemo((): MatrxColumnDef<AppConfigHistoryRow>[] => {
    return [
      {
        id: "changed_at",
        accessorKey: "changed_at",
        header: "When",
        cell: (row) => (
          <span
            className="whitespace-nowrap text-sm font-medium"
            title={format(new Date(row.changed_at), "yyyy-MM-dd HH:mm:ss")}
          >
            {formatDistanceToNow(new Date(row.changed_at), {
              addSuffix: true,
            })}
          </span>
        ),
        width: 160,
      },
      {
        id: "timestamp",
        header: "Timestamp",
        accessorFn: (row) => row.changed_at,
        filter: false,
        cell: (row) => (
          <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
            {format(new Date(row.changed_at), "yyyy-MM-dd HH:mm:ss")}
          </span>
        ),
        width: 170,
      },
      {
        id: "schema_version",
        accessorKey: "schema_version",
        header: "Schema",
        filter: "select",
        cell: (row) => <Badge variant="outline">v{row.schema_version}</Badge>,
        width: 100,
      },
      {
        id: "min_supported_app_version",
        accessorKey: "min_supported_app_version",
        header: "Min version",
        filter: "select",
        cell: (row) => (
          <code className="font-mono text-xs">
            {row.min_supported_app_version}
          </code>
        ),
        width: 120,
      },
      {
        id: "changed_by",
        header: "Changed by",
        accessorFn: (row) => whoLabel(row.changed_by),
        filter: "select",
        cell: (row) => (
          <span
            className="text-xs text-muted-foreground"
            title={row.changed_by ?? undefined}
          >
            {whoLabel(row.changed_by)}
          </span>
        ),
        width: 220,
      },
    ];
  }, [whoLabel]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {entries === null
          ? "Loading version history…"
          : `${entries.length} snapshot${entries.length === 1 ? "" : "s"} — open a row to diff it against the CURRENT live row.`}
      </p>

      <MatrxDataTable
        urlState={{ id: "application-config-history" }}
        data={entries ?? []}
        columns={columns}
        getRowId={(row) => String(row.id)}
        isLoading={entries === null}
        pageSize={25}
        emptyState={{
          icon: <History className="h-5 w-5" />,
          title: "No history yet",
          description: "Snapshots are written on every save.",
        }}
        toolbar={{
          search: true,
          searchPlaceholder: "Search version, who…",
        }}
        detail={{
          title: (row) =>
            format(new Date(row.changed_at), "yyyy-MM-dd HH:mm:ss"),
          description: (row) =>
            `schema v${row.schema_version} · min ${row.min_supported_app_version} · ${whoLabel(row.changed_by)}`,
          defaultWidth: 720,
          render: (row) => (
            <div className="p-2">
              <DiffViewer
                original={configSnapshotJson(row)}
                modified={currentJson}
                engine="light"
                language="json"
                view="split"
                originalLabel="This snapshot"
                modifiedLabel="Current"
              />
            </div>
          ),
        }}
        copy={{
          label: "Configuration snapshot",
          listLabel: "Configuration history (this view)",
          location: `${APPLICATIONS_ADMIN_LOCATION}/configuration`,
          rowKind: "app_config_snapshot",
          listKind: "app_config_history",
          rowDescription: "One historical configuration snapshot.",
          listDescription: "Configuration snapshots currently visible.",
          humanRow: (row) =>
            [
              `${app} @ ${row.changed_at} by ${whoLabel(row.changed_by)}`,
              configSnapshotJson(row),
            ].join("\n"),
          rowAttributes: (row) => ({
            app,
            changed_at: row.changed_at,
            schema_version: row.schema_version,
          }),
          listAttributes: (visible, all) => ({
            app,
            visible: visible.length,
            total: all.length,
          }),
        }}
        rowActions={(row) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setRestoreTarget(row)}
          >
            <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Restore
          </Button>
        )}
      />

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && !restoring) setRestoreTarget(null);
        }}
        title="Restore this version?"
        description={
          restoreTarget
            ? `This overwrites the live "${app}" config with the snapshot from ${format(
                new Date(restoreTarget.changed_at),
                "yyyy-MM-dd HH:mm:ss",
              )}. Every installed client in the field picks it up on its next refresh. The current row is snapshotted to history first.`
            : undefined
        }
        contentClassName="sm:max-w-4xl"
        content={
          restoreTarget ? (
            <div className="max-h-[55dvh] overflow-y-auto rounded-md border border-border">
              <DiffViewer
                original={currentJson}
                modified={configSnapshotJson(restoreTarget)}
                engine="light"
                language="json"
                view="split"
                originalLabel="Current"
                modifiedLabel="After restore"
              />
            </div>
          ) : null
        }
        confirmLabel="Restore"
        variant="destructive"
        busy={restoring}
        onConfirm={async () => {
          if (!restoreTarget) return;
          setRestoring(true);
          try {
            const restored = await onRestore(restoreTarget);
            if (restored) setRestoreTarget(null);
          } finally {
            setRestoring(false);
          }
        }}
      />
    </div>
  );
}
