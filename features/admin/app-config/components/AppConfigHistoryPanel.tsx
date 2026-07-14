"use client";

// features/admin/app-config/components/AppConfigHistoryPanel.tsx
//
// Version history for one app_config row. Reads public.app_config_history
// (admin-read RLS) directly via supabase-js, renders each snapshot with an
// expandable diff against the CURRENT row, and offers "Restore this version"
// — which goes through the same admin_update_app_config RPC (creating a new
// history entry), never a direct table write.

import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, History, Loader2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { useToast } from "@/components/ui/use-toast";
import { createClient } from "@/utils/supabase/client";
import { configSnapshotJson } from "@/features/admin/app-config/schema";
import type {
  AppConfigHistoryRow,
  AppConfigRow,
} from "@/features/admin/app-config/types";

interface AppConfigHistoryPanelProps {
  app: string;
  currentRow: AppConfigRow;
  /** Applies the snapshot via the RPC; the parent owns the write path. */
  onRestore: (entry: AppConfigHistoryRow) => Promise<void>;
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
  // Keyed by (app, refreshKey) so a key change shows the loading state
  // without a synchronous reset inside the effect.
  const loadKey = `${app}:${refreshKey}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    entries: AppConfigHistoryRow[];
  } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
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
        on every save.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {entries.length} snapshot{entries.length === 1 ? "" : "s"} — each diff
        compares the snapshot against the CURRENT live row.
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
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {format(changedAt, "yyyy-MM-dd HH:mm:ss")}
                </span>
                <span className="text-xs text-muted-foreground">
                  schema v{entry.schema_version} · min{" "}
                  {entry.min_supported_app_version}
                </span>
                {entry.changed_by ? (
                  <code
                    className="hidden truncate text-xs text-muted-foreground lg:inline"
                    title={entry.changed_by}
                  >
                    by {entry.changed_by.slice(0, 8)}
                  </code>
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
                  original={configSnapshotJson(entry)}
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
            ? `This overwrites the live "${app}" config with the snapshot from ${format(
                new Date(restoreTarget.changed_at),
                "yyyy-MM-dd HH:mm:ss",
              )}. Every installed client in the field picks it up on its next refresh. The current row is snapshotted to history first.`
            : undefined
        }
        confirmLabel="Restore"
        variant="destructive"
        busy={restoring}
        onConfirm={async () => {
          if (!restoreTarget) return;
          setRestoring(true);
          try {
            await onRestore(restoreTarget);
            setRestoreTarget(null);
          } finally {
            setRestoring(false);
          }
        }}
      />
    </div>
  );
}
