"use client";

/**
 * NoteSaveFailureBanner — the blocking escalation for a broken save path.
 *
 * A toast was not enough. On 2026-08-08 an auth-cookie rotation left every
 * autosave RLS-filtered to 0 rows for ~14 hours; the failure DID surface (a
 * deduped toast + a red "Save failed" in the metadata bar) and was ignorable
 * the whole time, so the work was lost (FOUND_DEFECTS.md D132).
 *
 * After NOTE_SAVE_FAILURE_BLOCK_THRESHOLD consecutive failures the editor
 * stops whispering: this banner takes the top of the editor, cannot be
 * dismissed, and stays until a save actually lands. It is deliberately NOT a
 * read-only lock — locking the editor would strand the user's only copy of the
 * text behind a wall. Instead every action here is a way to GET THE WORK OUT:
 * retry, copy, download, reload.
 *
 * The buffer has already been snapshotted to a local draft by
 * `reportNoteSaveFailure` (lib/local-drafts) by the time this renders.
 */

import { useState, useSyncExternalStore } from "react";
import { AlertOctagon, Copy, Download, RefreshCw, RotateCw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { downloadFile, exportFilename } from "@/components/agent-copy/export";
import {
  selectNoteContent,
  selectNoteFirstSaveFailureAt,
  selectNoteLabel,
  selectNoteSaveErrorMessage,
  selectNoteSaveFailureCount,
} from "../redux/selectors";
import { NOTE_SAVE_FAILURE_BLOCK_THRESHOLD } from "../redux/notes.types";
import { saveNote } from "../redux/thunks";
import {
  getNoteLiveContent,
  subscribeNoteLiveContent,
} from "../utils/noteLiveContent";

function sinceLabel(from: number | null): string | null {
  if (!from) return null;
  const minutes = Math.floor((Date.now() - from) / 60_000);
  if (minutes < 1) return "less than a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

interface NoteSaveFailureBannerProps {
  noteId: string;
}

export function NoteSaveFailureBanner({ noteId }: NoteSaveFailureBannerProps) {
  const dispatch = useAppDispatch();
  const failureCount = useAppSelector(selectNoteSaveFailureCount(noteId));
  const errorMessage = useAppSelector(selectNoteSaveErrorMessage(noteId));
  const firstFailureAt = useAppSelector(selectNoteFirstSaveFailureAt(noteId));
  const storedContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  const label = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";

  // Copy/Download must hand over what the user SEES. Keystrokes reach Redux
  // 200–1000ms late (`getReduxSyncDelay`), so on a note whose saves are
  // failing, the Redux copy is always a little behind the buffer — rescuing
  // it minus the last sentence is its own small data loss.
  const liveContent = useSyncExternalStore(
    (onChange) => subscribeNoteLiveContent(noteId, onChange),
    () => getNoteLiveContent(noteId),
    () => undefined,
  );
  const content = liveContent ?? storedContent;
  const [retrying, setRetrying] = useState(false);

  if (failureCount < NOTE_SAVE_FAILURE_BLOCK_THRESHOLD) return null;

  const elapsed = sinceLabel(firstFailureAt);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await dispatch(saveNote(noteId)).unwrap();
      toast.success("Saved.");
    } catch {
      // The save path already toasted + re-escalated; the banner stays up.
    } finally {
      setRetrying(false);
    }
  };

  const handleCopy = async () => {
    await writeClipboard(content);
    toast.success("Note text copied — paste it somewhere safe.");
  };

  const handleDownload = () => {
    downloadFile(
      exportFilename(label, "md"),
      content,
      "text/markdown;charset=utf-8",
    );
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="shrink-0 border-b-2 border-destructive bg-destructive/10"
      data-surface-value="note_save_blocked"
    >
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start">
        <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-destructive">
            Your changes are NOT being saved
          </p>
          <p className="text-xs leading-relaxed text-foreground/90">
            {failureCount} save attempts in a row have failed
            {elapsed ? ` over the last ${elapsed}` : ""}. This note exists only
            in this browser tab right now — copy or download it before closing
            or reloading. A local backup was kept in this browser and will be
            offered back if the tab reloads.
          </p>
          {errorMessage && (
            <p className="text-xs text-muted-foreground break-words">
              Reason: {errorMessage}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-1 rounded-md bg-destructive px-2.5 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60 cursor-pointer"
          >
            <RotateCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} />
            {retrying ? "Retrying…" : "Try saving again"}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy text
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
            title="Reload after copying or downloading your work — your local backup will be offered back"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
