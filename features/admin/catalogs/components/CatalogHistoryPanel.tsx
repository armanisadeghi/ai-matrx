"use client";

// features/admin/catalogs/components/CatalogHistoryPanel.tsx
//
// Version history for one catalog entry (app, kind, key). Reads
// public.catalog_entries_history (admin-read RLS) directly via supabase-js,
// renders each snapshot with an expandable diff against the CURRENT row, and
// offers "Restore this version" — which goes through the same
// admin_upsert_catalog_entry RPC (creating a new history entry), never a
// direct table write. Mirrors AppConfigHistoryPanel.

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Trash2,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { useAdminEmails } from "@/features/admin/shared/useAdminEmails";
import {
  entrySnapshotJson,
  rowSnapshotJson,
} from "@/features/admin/catalogs/schemas";
import type {
  CatalogEntryHistoryRow,
  CatalogEntryRow,
} from "@/features/admin/catalogs/types";

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
  const [expandedId, setExpandedId] = useState<number | null>(null);
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

  if (entries === null) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading version history…
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <History className="h-4 w-4" /> No history yet — snapshots are written
        on every save and delete.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {entries.length} snapshot{entries.length === 1 ? "" : "s"} — each diff
        compares the snapshot against the CURRENT live entry.
      </p>

      {entries.map((entry) => {
        const expanded = expandedId === entry.id;
        const changedAt = new Date(entry.changed_at);
        return (
          <div
            key={entry.id}
            className="rounded-md border border-border bg-card"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => setExpandedId(expanded ? null : entry.id)}
              >
                {expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">
                  {formatDistanceToNow(changedAt, { addSuffix: true })}
                </span>
                {entry.op === "delete" ? (
                  <Badge
                    variant="outline"
                    className="border-destructive/50 text-destructive"
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> delete
                  </Badge>
                ) : null}
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {format(changedAt, "yyyy-MM-dd HH:mm:ss")}
                </span>
                <span className="text-xs text-muted-foreground">
                  schema v{entry.schema_version} ·{" "}
                  {entry.is_active ? "active" : "inactive"}
                </span>
                {entry.changed_by ? (
                  adminEmails[entry.changed_by] ? (
                    <span
                      className="hidden truncate text-xs text-muted-foreground lg:inline"
                      title={entry.changed_by}
                    >
                      by {adminEmails[entry.changed_by]}
                    </span>
                  ) : (
                    <code
                      className="hidden truncate text-xs text-muted-foreground lg:inline"
                      title={entry.changed_by}
                    >
                      by {entry.changed_by.slice(0, 8)}
                    </code>
                  )
                ) : null}
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setRestoreTarget(entry)}
              >
                <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Restore
              </Button>
            </div>

            {expanded ? (
              <div className="border-t border-border p-2">
                <DiffViewer
                  original={historySnapshotJson(entry)}
                  modified={currentJson}
                  engine="light"
                  language="json"
                  view="split"
                  originalLabel="This snapshot"
                  modifiedLabel="Current"
                />
              </div>
            ) : null}
          </div>
        );
      })}

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
