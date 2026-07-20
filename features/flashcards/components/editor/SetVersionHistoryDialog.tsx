// features/flashcards/components/editor/SetVersionHistoryDialog.tsx
//
// The never-lose-work "version restore" affordance for a flashcard set. Reads
// the set's history from the PLATFORM row-versioning system (lib/versioning —
// get_version_history) and restores any prior version atomically
// (restore_version). Restoring is itself a new version, so nothing is ever
// destroyed — the wedge against Knowt's data-loss reputation.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

"use client";

import { useEffect, useState } from "react";
import { History, Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  listVersions,
  restoreVersion,
  type VersionEntry,
} from "@/lib/versioning/versionHistory";

/** The platform entity token the version system keys a flashcard set by. */
const FC_SET_ENTITY = "fc_set";

export function SetVersionHistoryDialog({
  open,
  onOpenChange,
  setId,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setId: string;
  /** Called after a successful restore so the editor can refetch the set. */
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<VersionEntry | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await listVersions(FC_SET_ENTITY, setId, { limit: 50 });
      if (cancelled) return;
      if (res.error) {
        setError(res.error);
        setVersions([]);
      } else {
        setVersions(res.data ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, setId, reloadKey]);

  const confirmRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    const res = await restoreVersion(
      FC_SET_ENTITY,
      setId,
      restoreTarget.versionNumber,
    );
    setRestoring(false);
    setRestoreTarget(null);
    if (res.error) {
      toast.error("Couldn't restore that version", { description: res.error });
      return;
    }
    toast.success(`Restored to version ${restoreTarget.versionNumber}`);
    setReloadKey((k) => k + 1);
    onRestored();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg gap-0 p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-primary" />
              Version history
            </DialogTitle>
            <DialogDescription className="text-xs">
              Every change is versioned automatically. Restore any earlier
              version — restoring never deletes anything, it just adds a new
              version on top.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[55vh]">
            <div className="px-4 py-3">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history…
                </div>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-foreground">
                    Couldn&apos;t load version history
                  </p>
                  <p className="max-w-sm text-xs text-muted-foreground">{error}</p>
                </div>
              ) : versions.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No earlier versions yet — edits you make will show up here.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {versions.map((v, i) => (
                    <li
                      key={v.versionId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            Version {v.versionNumber}
                          </span>
                          {i === 0 && (
                            <span className="rounded bg-primary/10 px-1.5 py-0 text-[10px] font-medium text-primary">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(v.changedAt).toLocaleString()}
                          {v.changeNote ? ` · ${v.changeNote}` : ""}
                        </div>
                      </div>
                      {i !== 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 gap-1 px-2 text-xs"
                          onClick={() => setRestoreTarget(v)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => {
          if (!o && !restoring) setRestoreTarget(null);
        }}
        title={`Restore version ${restoreTarget?.versionNumber ?? ""}`}
        description="This set's fields will be reset to that version. Your current version is kept in history, so you can always come back to it."
        confirmLabel="Restore"
        busy={restoring}
        onConfirm={confirmRestore}
      />
    </>
  );
}
