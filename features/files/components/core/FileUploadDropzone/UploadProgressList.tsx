/**
 * features/files/components/core/FileUploadDropzone/UploadProgressList.tsx
 *
 * Live upload tray. Reads from the `cloudFiles.uploads` slice (active AND
 * recently-completed entries) so the user always sees WHAT they just
 * uploaded — not just a progress bar that vanishes the instant the byte
 * count hits 100%.
 *
 * Behavior:
 *   - In-flight entries show a live progress bar + percentage.
 *   - Successful entries persist with the file name + an "Open" button that
 *     reveals the file (opens the preview pane and scrolls the row into
 *     view). They auto-dismiss after AUTO_DISMISS_MS — but the timer pauses
 *     while the pointer is over the tray, so a user reaching for "Open"
 *     never has the entry disappear out from under them.
 *   - Failed entries persist until manually dismissed.
 */

"use client";

import { memo, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { clearUpload } from "@/features/files/redux/slice";
import { formatFileSize } from "@/features/files/utils/format";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import type { UploadState } from "@/features/files/types";

/** How long a successful upload lingers in the tray before auto-dismissing. */
const AUTO_DISMISS_MS = 10_000;

export interface UploadProgressListProps {
  uploads: UploadState[];
  /**
   * Reveal a finished file — opens the preview pane and scrolls/highlights
   * its row. Wired by the host shell. When omitted, the "Open" affordance
   * is hidden (e.g. embedded contexts with no list to reveal into).
   */
  onOpenFile?: (fileId: string) => void;
  className?: string;
}

function UploadProgressListImpl({
  uploads,
  onOpenFile,
  className,
}: UploadProgressListProps) {
  const dispatch = useAppDispatch();
  const [hovered, setHovered] = useState(false);

  const activeCount = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending",
  ).length;
  const successCount = uploads.filter((u) => u.status === "success").length;
  const errorCount = uploads.filter((u) => u.status === "error").length;

  // Auto-dismiss successful entries. The timer is paused (cleared) while the
  // pointer is over the tray so a user reaching for "Open" is never cut off.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  useEffect(() => {
    const timers = timersRef.current;
    if (hovered) {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      return;
    }
    for (const u of uploads) {
      if (u.status !== "success") continue;
      if (timers.has(u.requestId)) continue;
      const elapsed = u.completedAt ? Date.now() - u.completedAt : 0;
      const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
      const handle = setTimeout(() => {
        timers.delete(u.requestId);
        dispatch(clearUpload({ requestId: u.requestId }));
      }, remaining);
      timers.set(u.requestId, handle);
    }
    // Drop timers for entries that are gone or no longer successful.
    const liveSuccessIds = new Set(
      uploads.filter((u) => u.status === "success").map((u) => u.requestId),
    );
    for (const [id, handle] of timers) {
      if (!liveSuccessIds.has(id)) {
        clearTimeout(handle);
        timers.delete(id);
      }
    }
  }, [uploads, hovered, dispatch]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  if (uploads.length === 0) return null;

  const headerLabel =
    activeCount > 0
      ? `Uploading ${activeCount} file${activeCount === 1 ? "" : "s"}…`
      : errorCount > 0 && successCount === 0
        ? `${errorCount} upload${errorCount === 1 ? "" : "s"} failed`
        : `Uploaded ${successCount} file${successCount === 1 ? "" : "s"}`;

  const completedIds = uploads
    .filter((u) => u.status === "success" || u.status === "error")
    .map((u) => u.requestId);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur",
        className,
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Uploads"
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="truncate text-xs font-medium text-foreground">
          {headerLabel}
        </span>
        {completedIds.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              for (const id of completedIds) {
                dispatch(clearUpload({ requestId: id }));
              }
            }}
            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>

      <ul className="max-h-72 space-y-1 overflow-y-auto p-2">
        {uploads.map((u) => {
          const percent =
            u.fileSize > 0
              ? Math.min(100, Math.round((u.bytesUploaded / u.fileSize) * 100))
              : 0;
          const done = u.status === "success";
          const failed = u.status === "error";
          const canOpen = done && !!u.fileId && !!onOpenFile;
          return (
            <li
              key={u.requestId}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                canOpen && "cursor-pointer hover:bg-accent/60",
              )}
              onClick={
                canOpen ? () => onOpenFile!(u.fileId as string) : undefined
              }
            >
              <FileIcon fileName={u.fileName} size={18} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {u.fileName}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {failed ? "Failed" : done ? "Done" : `${percent}%`}
                  </span>
                </div>
                {done ? null : (
                  <div className="mt-1 h-1 w-full rounded bg-muted">
                    <div
                      className={cn(
                        "h-1 rounded transition-all",
                        failed ? "bg-destructive" : "bg-primary",
                      )}
                      style={{ width: failed ? "100%" : `${percent}%` }}
                    />
                  </div>
                )}
                {failed && u.error ? (
                  <p className="mt-0.5 truncate text-[10px] text-destructive">
                    {u.error}
                  </p>
                ) : !done ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {formatFileSize(u.bytesUploaded)} /{" "}
                    {formatFileSize(u.fileSize)}
                  </p>
                ) : null}
              </div>

              {canOpen ? (
                <span className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  <ExternalLink className="h-3 w-3" />
                  Open
                </span>
              ) : done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : failed ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              ) : null}

              {done || failed ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch(clearUpload({ requestId: u.requestId }));
                  }}
                  aria-label="Dismiss"
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const UploadProgressList = memo(UploadProgressListImpl);
