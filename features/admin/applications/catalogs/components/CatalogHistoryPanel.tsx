"use client";

// features/admin/applications/catalogs/components/CatalogHistoryPanel.tsx
//
// Version history for one catalog entry (app, kind, key). Reads
// public.catalog_entries_history (admin-read RLS) directly via supabase-js
// into the canonical MatrxDataTable: each snapshot is a sortable/filterable
// row, opening a row diffs it against the CURRENT entry in the side panel, and
// "Restore" goes through the same admin_upsert_catalog_entry RPC (creating a
// new history entry), never a direct table write. Mirrors
// AppConfigHistoryPanel.

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { History, Trash2, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useToast } from "@/components/ui/use-toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { createClient } from "@/utils/supabase/client";
import { APPLICATIONS_ADMIN_LOCATION } from "@/features/admin/applications/constants";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import {
  entrySnapshotJson,
  rowSnapshotJson,
} from "@/features/admin/applications/catalogs/schemas";
import type {
  CatalogEntryHistoryRow,
  CatalogEntryRow,
} from "@/features/admin/applications/catalogs/types";

interface CatalogHistoryPanelProps {
  app: string;
  kind: string;
  entryKey: string;
  currentRow: CatalogEntryRow;
  /** Applies the snapshot via the RPC; the parent owns the write path.
   *  Resolves true on success, false on failure — never rejects. */
  onRestore: (entry: CatalogEntryHistoryRow) => Promise<boolean>;
  /** Bumped by the parent after every successful save to refetch history. */
  refreshKey: number;
}

function historySnapshotJson(entry: CatalogEntryHistoryRow): string {
  return entrySnapshotJson(entry);
}

export function CatalogHistoryPanel({
  app,
  kind,
  entryKey,
  currentRow,
  onRestore,
  refreshKey,
}: CatalogHistoryPanelProps) {
  const { toast } = useToast();
  const adminEmails = useAdminEmails();
  const loadKey = `${app}:${kind}:${entryKey}:${refreshKey}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    entries: CatalogEntryHistoryRow[];
  } | null>(null);
  const [restoreTarget, setRestoreTarget] =
    useState<CatalogEntryHistoryRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      const { data, error } = await supabase
        .from("catalog_entries_history")
        .select("*")
        .eq("app", app)
        .eq("kind", kind)
        .eq("key", entryKey)
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
  }, [app, kind, entryKey, loadKey, toast]);

  const entries = loaded && loaded.key === loadKey ? loaded.entries : null;

  const currentJson = rowSnapshotJson(currentRow);

  const whoLabel = useCallback(
    (changedBy: string | null): string => {
      if (!changedBy) return "—";
      return adminEmails[changedBy] ?? changedBy.slice(0, 8);
    },
    [adminEmails],
  );

  const columns = useMemo((): MatrxColumnDef<CatalogEntryHistoryRow>[] => {
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
        id: "op",
        accessorKey: "op",
        header: "Operation",
        filter: "select",
        cell: (row) =>
          row.op === "delete" ? (
            <Badge
              variant="outline"
              className="border-destructive/50 text-destructive"
            >
              <Trash2 className="mr-1 h-3 w-3" /> delete
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              {row.op}
            </Badge>
          ),
        width: 110,
      },
      {
        id: "is_active",
        accessorKey: "is_active",
        header: "Active",
        filter: "boolean",
        align: "center",
        cell: (row) => (
          <span className="text-xs">{row.is_active ? "Yes" : "No"}</span>
        ),
        width: 80,
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
        width: 200,
      },
    ];
  }, [whoLabel]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {entries === null
          ? "Loading version history…"
          : `${entries.length} snapshot${entries.length === 1 ? "" : "s"} — open a row to diff it against the CURRENT live entry.`}
      </p>

      <MatrxDataTable
        data={entries ?? []}
        columns={columns}
        getRowId={(row) => String(row.id)}
        isLoading={entries === null}
        pageSize={25}
        emptyState={{
          icon: <History className="h-5 w-5" />,
          title: "No history yet",
          description: "Snapshots are written on every save and delete.",
        }}
        toolbar={{
          search: true,
          searchPlaceholder: "Search operation, who…",
        }}
        detail={{
          title: (row) =>
            format(new Date(row.changed_at), "yyyy-MM-dd HH:mm:ss"),
          description: (row) =>
            `${row.op} · schema v${row.schema_version} · ${row.is_active ? "active" : "inactive"} · ${whoLabel(row.changed_by)}`,
          defaultWidth: 720,
          render: (row) => (
            <div className="p-2">
              <DiffViewer
                original={historySnapshotJson(row)}
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
          label: "Catalog snapshot",
          listLabel: "Catalog entry history (this view)",
          location: `${APPLICATIONS_ADMIN_LOCATION}/catalogs`,
          rowKind: "catalog_entry_snapshot",
          listKind: "catalog_entries_history",
          rowDescription: "One historical catalog entry snapshot.",
          listDescription: "Catalog entry snapshots currently visible.",
          humanRow: (row) =>
            [
              `${app}/${kind}/${entryKey} @ ${row.changed_at} (${row.op}) by ${whoLabel(row.changed_by)}`,
              historySnapshotJson(row),
            ].join("\n"),
          rowAttributes: (row) => ({
            app,
            kind,
            key: entryKey,
            op: row.op,
            changed_at: row.changed_at,
          }),
          listAttributes: (visible, all) => ({
            app,
            kind,
            key: entryKey,
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
            ? `This overwrites the live ${app}/${kind}/${entryKey} entry with the snapshot from ${format(
                new Date(restoreTarget.changed_at),
                "yyyy-MM-dd HH:mm:ss",
              )}. Every installed client picks it up on its next catalog refresh. The current entry is snapshotted to history first.`
            : undefined
        }
        contentClassName="sm:max-w-4xl"
        content={
          restoreTarget ? (
            <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border">
              <DiffViewer
                original={currentJson}
                modified={historySnapshotJson(restoreTarget)}
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
