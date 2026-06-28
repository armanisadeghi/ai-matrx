/**
 * WorkbookHistoryViewer — read-only audit log for a single workbook.
 *
 * Lists snapshots newest-first. Each entry shows origin (autosave / manual /
 * imported / restored), created_at, and a Restore button that takes the
 * snapshot's JSON and writes a NEW snapshot row labeled "Restored from <id>".
 * The realtime hook in WorkbookEditor will hot-swap to the new snapshot
 * automatically (it's the new latest).
 *
 * Read RLS already scopes by viewer permission of the parent workbook —
 * no extra gating needed here.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock,
  History,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";

import {
  getLatestSnapshot,
  listSnapshots,
  saveSnapshot,
} from "../workbook-service";
import { isServiceFailure, type WorkbookSnapshot } from "../types";

type Props = {
  workbookId: string | null | undefined;
  /** Hide the Restore button when viewer is read-only. */
  editable?: boolean;
};

export function WorkbookHistoryViewer({ workbookId, editable = true }: Props) {
  const [snapshots, setSnapshots] = useState<WorkbookSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!workbookId) return;
    setLoading(true);
    const res = await listSnapshots(workbookId);
    if (isServiceFailure(res)) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setSnapshots(res.data);
    setError(null);
    setLoading(false);
  }, [workbookId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRestore = useCallback(
    async (snapshotId: string) => {
      if (!workbookId) return;
      setRestoringId(snapshotId);

      // listSnapshots intentionally omits the heavy `snapshot` jsonb. Re-fetch
      // the chosen row with its snapshot column. We bypass the dedicated
      // service fn here because we want a specific snapshot by id, not the
      // latest — kept as an inline query to avoid bloating the service surface
      // until a second consumer needs it.
      const { supabase } = await import("@/utils/supabase/client");
      const { data: full, error: fetchErr } = await supabase
        .schema("workbench")
        .from("udt_workbook_snapshots")
        .select("snapshot, label")
        .eq("id", snapshotId)
        .single();

      if (fetchErr || !full) {
        toast({
          title: "Could not load snapshot",
          description: fetchErr?.message ?? "snapshot not found",
          variant: "destructive",
        });
        setRestoringId(null);
        return;
      }

      // Write a NEW snapshot pinned as 'restored'. The realtime hook in
      // WorkbookEditor will pick this up as the new latest and hot-swap.
      const saved = await saveSnapshot({
        workbookId,
        snapshot: full.snapshot,
        origin: "restored",
        label: `Restored from ${full.label ?? snapshotId.slice(0, 8)}`,
      });
      setRestoringId(null);

      if (isServiceFailure(saved)) {
        toast({
          title: "Could not restore",
          description: saved.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Restored snapshot", variant: "success" });
      void reload();
    },
    [reload, workbookId],
  );

  if (!workbookId) {
    return (
      <EmptyState
        icon={<History className="size-4" />}
        title="No workbook selected"
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<History className="size-4 text-destructive" />}
        title="Could not load history"
        description={error}
      />
    );
  }

  if (snapshots.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-4" />}
        title="No saves yet"
        description="Edits autosave after 2.5s of idle. Use 'Save now' to create a labeled snapshot."
      />
    );
  }

  // The newest entry is the current state — surface it as such; older ones
  // are restorable.
  const [current, ...rest] = snapshots;

  return (
    <div className="flex flex-col gap-2">
      <SnapshotRow
        snapshot={current}
        isCurrent
        editable={false}
        restoringId={restoringId}
        onRestore={handleRestore}
      />
      {rest.length > 0 && (
        <div className="text-xs uppercase tracking-wider text-muted-foreground px-1 pt-2">
          History
        </div>
      )}
      {rest.map((s) => (
        <SnapshotRow
          key={s.id}
          snapshot={s}
          isCurrent={false}
          editable={editable}
          restoringId={restoringId}
          onRestore={handleRestore}
        />
      ))}
    </div>
  );
}

function SnapshotRow({
  snapshot,
  isCurrent,
  editable,
  restoringId,
  onRestore,
}: {
  snapshot: WorkbookSnapshot;
  isCurrent: boolean;
  editable: boolean;
  restoringId: string | null;
  onRestore: (id: string) => void;
}) {
  return (
    <div
      className={`rounded-md border border-border bg-card p-3 text-sm ${
        isCurrent ? "ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <OriginBadge origin={snapshot.origin} />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" /> {formatTimestamp(snapshot.created_at)}
          </span>
          {isCurrent && (
            <Badge variant="outline" className="text-xs">
              Current
            </Badge>
          )}
        </div>
        {!isCurrent && editable && (
          <Button
            variant="ghost"
            size="sm"
            disabled={restoringId !== null}
            onClick={() => onRestore(snapshot.id)}
            title="Restore this snapshot as the new current state"
          >
            {restoringId === snapshot.id ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <RotateCcw className="size-3 mr-1" />
            )}
            Restore
          </Button>
        )}
      </div>
      {snapshot.label && (
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {snapshot.label}
        </div>
      )}
    </div>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  switch (origin) {
    case "manual":
      return (
        <Badge variant="secondary" className="gap-1">
          <Pencil className="size-3" /> Manual
        </Badge>
      );
    case "imported":
      return (
        <Badge variant="secondary" className="gap-1">
          <Upload className="size-3" /> Imported
        </Badge>
      );
    case "restored":
      return (
        <Badge variant="secondary" className="gap-1">
          <RotateCcw className="size-3" /> Restored
        </Badge>
      );
    case "autosave":
    default:
      return (
        <Badge variant="outline" className="gap-1">
          <Sparkles className="size-3" /> Autosave
        </Badge>
      );
  }
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md bg-muted p-6 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <div className="text-xs text-muted-foreground">{description}</div>
      )}
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
