/**
 * features/files/components/core/FileVersions/FileVersionsList.tsx
 *
 * Lists every persisted version of a file with restore + change-summary.
 * Designed to slot into a tab inside `PreviewPane` so users can scroll
 * through versions while the previewer keeps the body in view.
 *
 * Backend already provides everything: `Files.listVersions`, the
 * `versionsByFileId` slice, and the `restoreVersion` thunk that
 * (server-side) creates a new top version pointing at the chosen
 * version's storage uri. We only need the UI.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  AlertCircle,
  History,
  Loader2,
  RotateCcw,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  selectFileById,
  selectVersionsForFile,
} from "@/features/files/redux/selectors";
import {
  loadFileVersions,
  restoreVersion as restoreVersionThunk,
} from "@/features/files/redux/thunks";
import { formatFileSize } from "@/features/files/utils/format";

export interface FileVersionsListProps {
  fileId: string;
  className?: string;
}

export function FileVersionsList({ fileId, className }: FileVersionsListProps) {
  const dispatch = useAppDispatch();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const versions = useAppSelector((s) => selectVersionsForFile(s, fileId));
  // Virtual files (Notes / Code Snippets / Agent Apps / etc.) don't share
  // the `cld_file_versions` table — each adapter owns its own version
  // schema, exposed via `adapter.listVersions`. v1 ships without that path
  // wired through the preview pane, so we render a clear empty state
  // instead of trying to query a UUID-typed column with a synthetic id.
  const isVirtual =
    fileId.startsWith("vfs:") || file?.source.kind === "virtual";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    if (isVirtual) return;
    setLoading(true);
    setError(null);
    try {
      await dispatch(loadFileVersions({ fileId })).unwrap();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [dispatch, fileId, isVirtual]);

  // Reload versions whenever the file id changes — the parent (PreviewPane)
  // mounts a new instance per fileId so this fires on every preview swap.
  useEffect(() => {
    void fetchVersions();
  }, [fetchVersions]);

  const handleRestore = useCallback(
    async (versionNumber: number) => {
      setRestoring(versionNumber);
      try {
        await dispatch(
          restoreVersionThunk({ fileId, versionNumber }),
        ).unwrap();
      } finally {
        setRestoring(null);
        setConfirmTarget(null);
      }
    },
    [dispatch, fileId],
  );

  // The virtual-source guard sits BELOW every hook. Above them handleRestore
  // was a conditional hook (react-hooks/rules-of-hooks) — a file whose
  // `isVirtual` flips once its source resolves would crash the tab.
  if (isVirtual) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center p-6 text-center",
          className,
        )}
      >
        <p className="max-w-sm text-sm text-muted-foreground">
          Version history isn't available for this source yet. Each backing
          system (Notes, Code Snippets, Agent Apps, …) tracks its own
          versions; we'll wire those into this tab soon.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading && versions.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center gap-2 p-6",
          className,
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading versions…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center",
          className,
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-5 w-5 text-destructive" />
        </div>
        <p className="text-sm font-medium">Couldn't load versions</p>
        <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        <button
          type="button"
          onClick={() => void fetchVersions()}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-accent"
        >
          Retry
        </button>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center",
          className,
        )}
      >
        <History className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">No version history yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Each save creates a version. Re-upload this file or edit it from a
          tool to see entries here.
        </p>
      </div>
    );
  }

  // Sorted desc by version number — newest at top. Null/undefined
  // version numbers (corrupt rows) sort to the end so they don't poison
  // the "latest" lookup below.
  const sorted = [...versions].sort((a, b) => {
    const av = a.versionNumber;
    const bv = b.versionNumber;
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
  const latest = sorted[0]?.versionNumber ?? null;
  const currentVersion = (file as { version?: number } | null)?.version ?? latest;

  return (
    <div className={cn("flex h-full w-full flex-col overflow-hidden", className)}>
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">
            Versions ({versions.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void fetchVersions()}
          disabled={loading}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <ul className="flex-1 overflow-auto divide-y divide-border">
        {sorted.map((v) => {
          const isCurrent = v.versionNumber === currentVersion;
          return (
            <li
              key={v.id}
              className="flex items-start gap-3 px-3 py-2.5 hover:bg-accent/30"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                v{v.versionNumber}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium">
                    {formatDate(v.createdAt)}
                  </p>
                  {isCurrent ? (
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {v.fileSize != null ? formatFileSize(v.fileSize) : "—"}
                  {v.checksum ? (
                    <>
                      <span className="px-1">·</span>
                      <span
                        className="font-mono"
                        title={`SHA-256: ${v.checksum}`}
                      >
                        {v.checksum.slice(0, 8)}
                      </span>
                    </>
                  ) : null}
                </p>
                {v.changeSummary ? (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {v.changeSummary}
                  </p>
                ) : null}
              </div>
              {!isCurrent ? (
                <button
                  type="button"
                  onClick={() => setConfirmTarget(v.versionNumber)}
                  disabled={restoring !== null}
                  className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50 shrink-0"
                  title="Restore this version"
                >
                  {restoring === v.versionNumber ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  Restore
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Restore version {confirmTarget}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new version at the top of history with the
              contents of v{confirmTarget}. The current version stays in
              history — nothing is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmTarget != null) {
                  void handleRestore(confirmTarget);
                }
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
