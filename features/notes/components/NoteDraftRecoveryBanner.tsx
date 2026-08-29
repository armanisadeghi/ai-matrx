"use client";

/**
 * NoteDraftRecoveryBanner — offers back the in-memory edits the app had to
 * throw away.
 *
 * The tab-blocking paths (auth identity drift → forced reload) and a broken
 * save path both snapshot the editor buffer into `lib/local-drafts` first.
 * This banner is the return trip: when the note reopens under the SAME
 * account and the local draft differs from what the server holds, the user
 * gets their text back instead of discovering it is gone (D132).
 *
 * The draft is read once per note and never auto-applied — silently
 * overwriting server content with a browser snapshot would be a second way to
 * lose work.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Copy, Eye, LifeBuoy, Trash2, Undo2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import {
  useOpenDiffViewerWindow,
  type DiffViewerWindowHandle,
} from "@/features/overlays/openers/diffViewerWindow";
import { selectNoteContent, selectNoteFetchStatus } from "../redux/selectors";
import { discardNoteDraft, getNoteDraft } from "../utils/notesDrafts";
import {
  getDraftsVersion,
  subscribeDrafts,
  type LocalDraft,
} from "@ai-matrx/kit/drafts";

function whenLabel(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

const REASON_LABELS: Record<string, string> = {
  "auth-identity-drift":
    "this tab was signed in as a different account and had to reload",
  "note-save-failures": "saving this note kept failing",
  "signed-out": "the session ended before the changes were saved",
  unload: "the page closed before the changes were saved",
};

interface NoteDraftRecoveryBannerProps {
  noteId: string;
  /** Applies the recovered text through the editor's normal flush+save path. */
  onRestore: (content: string) => void;
}

export function NoteDraftRecoveryBanner({
  noteId,
  onRestore,
}: NoteDraftRecoveryBannerProps) {
  const userId = useAppSelector((state) => state.userAuth.id);
  const content = useAppSelector(selectNoteContent(noteId)) ?? "";
  const fetchStatus = useAppSelector(selectNoteFetchStatus(noteId));
  const draftsVersion = useSyncExternalStore(
    subscribeDrafts,
    getDraftsVersion,
    () => -1,
  );
  const openDiffViewer = useOpenDiffViewerWindow();
  const diffWindowRef = useRef<DiffViewerWindowHandle | null>(null);
  const warnedDraftRef = useRef<string | null>(null);

  // The -1 server snapshot keeps SSR and the first client render identical;
  // useSyncExternalStore publishes the real browser-store version after
  // hydration and on every capture/discard. Wait for the complete server note
  // before comparing it with browser-only recovery state.
  const storedDraft: LocalDraft | null =
    draftsVersion < 0 || fetchStatus !== "full"
      ? null
      : getNoteDraft(noteId, userId);
  const draft =
    storedDraft && storedDraft.content !== content ? storedDraft : null;

  // A matching draft means the write landed after all; drop it silently.
  useEffect(() => {
    if (!storedDraft || storedDraft.content !== content) return;
    discardNoteDraft(noteId);
  }, [content, noteId, storedDraft]);

  // A recovered draft means unsaved work reached the browser-only path — the
  // save path that allowed it is the real defect, so say so out loud.
  useEffect(() => {
    if (!draft) return;
    const identity = `${draft.key}:${draft.capturedAt}`;
    if (warnedDraftRef.current === identity) return;
    warnedDraftRef.current = identity;
    console.warn(
      "[Notes] recovered a local draft for note",
      draft.entityId,
      `captured ${new Date(draft.capturedAt).toISOString()} (reason: ${draft.reason}).`,
      "Unsaved work existed only in this browser.",
    );
  }, [draft]);

  if (!draft) return null;

  const handleRestore = () => {
    onRestore(draft.content);
    discardNoteDraft(noteId);
    diffWindowRef.current?.close();
    diffWindowRef.current = null;
    toast.success("Recovered changes restored — saving them now.");
  };

  const handleDiscard = () => {
    discardNoteDraft(noteId);
    diffWindowRef.current?.close();
    diffWindowRef.current = null;
  };

  const handleCopy = async () => {
    await writeClipboard(draft.content);
    toast.success("Recovered text copied to your clipboard.");
  };

  const handleView = () => {
    diffWindowRef.current = openDiffViewer({
      instanceId: `note-draft-recovery-${noteId}`,
      title: "Recovered note changes",
      original: content,
      modified: draft.content,
      originalLabel: "Saved version",
      modifiedLabel: "Recovered version",
      engine: "light",
      language: "markdown",
      defaultView: "split",
    });
  };

  const reason = REASON_LABELS[draft.reason] ?? "the changes were never saved";

  return (
    <div
      role="status"
      className="shrink-0 border-b border-primary/40 bg-primary/10"
      data-surface-value="note_draft_recovery"
    >
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
        <LifeBuoy className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90">
          <span className="font-medium">Unsaved changes recovered.</span> This
          browser kept a copy of this note from {whenLabel(draft.capturedAt)},
          because {reason}. It is{" "}
          {draft.content.length > content.length ? "longer" : "different"} than
          the saved version — restore it, or discard it to keep what is saved.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleView}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            View changes
          </button>
          <button
            type="button"
            onClick={handleRestore}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 cursor-pointer"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Restore
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          <button
            type="button"
            onClick={handleDiscard}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
