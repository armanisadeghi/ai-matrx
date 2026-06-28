/**
 * DocumentHistoryViewer — read-only audit log for a single document.
 *
 * Mirror of `WorkbookHistoryViewer`. Lists snapshots newest-first with a
 * Restore button that writes a NEW snapshot row labeled "Restored from <id>".
 * The realtime hook in DocumentEditor will hot-swap to the new snapshot when
 * not running with collab=true.
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
  listDocumentSnapshots,
  saveDocumentSnapshot,
} from "../document-service";
import { isServiceFailure, type DocumentSnapshot } from "../types";

type Props = {
  documentId: string | null | undefined;
  /** Hide the Restore button when viewer is read-only. */
  editable?: boolean;
};

export function DocumentHistoryViewer({ documentId, editable = true }: Props) {
  const [snapshots, setSnapshots] = useState<DocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    const res = await listDocumentSnapshots(documentId);
    if (isServiceFailure(res)) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setSnapshots(res.data);
    setError(null);
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRestore = useCallback(
    async (snapshotId: string) => {
      if (!documentId) return;
      setRestoringId(snapshotId);

      // Re-fetch the heavy snapshot column on demand (list intentionally
      // omits it to keep the listing payload small).
      const { supabase } = await import("@/utils/supabase/client");
      const { data: full, error: fetchErr } = await supabase
        .schema("workbench")
        .from("udt_document_snapshots")
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

      const saved = await saveDocumentSnapshot({
        documentId,
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
    [reload, documentId],
  );

  if (!documentId) {
    return (
      <EmptyState
        icon={<History className="size-4" />}
        title="No document selected"
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
  snapshot: DocumentSnapshot;
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
