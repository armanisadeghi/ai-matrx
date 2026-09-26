"use client";

/**
 * NoteDraftRecoveryBanner — offers back the in-memory edits the app had to
 * throw away.
 *
 * The tab-blocking paths (auth identity drift → forced reload) and a broken
 * save path both snapshot the editor buffer into the local draft store first.
 * This banner is the return trip: when the note reopens under the SAME
 * account and the local draft holds text the server does NOT, the user gets
 * their text back instead of discovering it is gone (D132).
 *
 * THE BAR FOR SHOWING IT: the draft must contain text that exists nowhere on
 * the server — not in the note, and not in its version history. A draft
 * captured at a tab close whose text was in fact saved (by that tab's flush,
 * by another device, or an hour of later edits that ran through the same
 * words) is NOT unsaved work; showing it as "recovered changes" is a lie that
 * wastes the reader's attention on an edit they superseded long ago
 * (2026-09-14: a one-hour-old draft offered after dozens of later saves).
 * Such drafts are dropped silently. Only when the text is genuinely orphaned
 * does the banner appear, in one sentence, with four plain controls.
 *
 * The draft is read once per note and never auto-applied — silently
 * overwriting server content with a browser snapshot would be a second way to
 * lose work.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Copy, Eye, LifeBuoy, Trash2, Undo2 } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import {
  useOpenDiffViewerWindow,
  type DiffViewerWindowHandle,
} from "@/features/overlays/openers/diffViewerWindow";
import { fetchVersions } from "@/features/text-diff/service/versionService";
import { selectNoteContent, selectNoteFetchStatus } from "../redux/selectors";
import { discardNoteDraft, getNoteDraft } from "../utils/notesDrafts";
import {
  getDraftsVersion,
  subscribeDrafts,
  type LocalDraft,
} from "@ai-matrx/kit/drafts";
import { formatRelativeTime } from "@/utils/datetime";
import { asClause } from "@/lib/text/asClause";

function whenLabel(at: number): string {
  return formatRelativeTime(at, { style: "long", fallback: "moments ago" });
}

const REASON_LABELS: Record<string, string> = {
  "auth-identity-drift": "the tab had to reload",
  // @ai-matrx/kit 0.15.2 captures when the tab goes to the background.
  backgrounded: "the app was put in the background before the save finished",
  "note-deleted": "the note was deleted",
  "note-save-failures": "saving kept failing",
  "signed-out": "the session ended",
  unload: "the page closed before the save finished",
};

/** A save can land this long before the capture and still be the capture's
 *  own text (the autosave debounce plus a slow request). */
export const SAVED_BEFORE_CAPTURE_WINDOW_MS = 60_000;

/**
 * Is this draft's text already on the server — as the note itself, or as any
 * version in its history? Only text that is in NEITHER is unsaved work.
 * A history read that fails leaves the question open, so the draft is kept
 * and offered (degrade to showing, never to silently dropping).
 */
export async function isDraftAlreadySaved(
  draft: Pick<LocalDraft, "content" | "entityId" | "capturedAt">,
  currentContent: string | null,
  readVersions: (noteId: string) => Promise<{ content: string; created_at: string }[]> = fetchVersions,
): Promise<boolean> {
  if (currentContent !== null && draft.content === currentContent) return true;
  try {
    const versions = await readVersions(draft.entityId);
    // Only a version saved AROUND OR AFTER the capture counts as "this text was
    // saved": a save landing inside the debounce window just before the tab
    // closed, or any later save of the same words. A version from long BEFORE
    // the capture is a different event — a user who reverted to an older text
    // and lost the tab has unsaved work, however familiar the words.
    const floor = draft.capturedAt - SAVED_BEFORE_CAPTURE_WINDOW_MS;
    return versions.some(
      (version) =>
        version.content === draft.content && Date.parse(version.created_at) >= floor,
    );
  } catch (error) {
    console.warn(
      "[Notes] could not read version history to judge a recovered draft; offering it.",
      error,
    );
    return false;
  }
}

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
  /** The draft identity the history check has cleared as genuinely unsaved. */
  const [orphaned, setOrphaned] = useState<string | null>(null);
  // The judge reads the note's CURRENT text at judge time through a ref, so a
  // keystroke never re-runs a history read: the draft is re-judged only when
  // its identity changes.
  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // The -1 server snapshot keeps SSR and the first client render identical;
  // useSyncExternalStore publishes the real browser-store version after
  // hydration and on every capture/discard. Wait for the complete server note
  // before comparing it with browser-only recovery state.
  const storedDraft: LocalDraft | null =
    draftsVersion < 0 || fetchStatus !== "full"
      ? null
      : getNoteDraft(noteId, userId);
  const identity = storedDraft
    ? `${storedDraft.key}:${storedDraft.capturedAt}`
    : null;

  // Judge the draft against the server ONCE per identity: text the server
  // already holds (as the note, or as any version) is dropped silently — it
  // was saved after all. Only orphaned text reaches the banner.
  useEffect(() => {
    if (!identity) return;
    const candidate = getNoteDraft(noteId, userId);
    if (!candidate) return;
    let cancelled = false;
    void isDraftAlreadySaved(candidate, contentRef.current).then((saved) => {
      if (cancelled) return;
      if (saved) {
        discardNoteDraft(noteId);
        return;
      }
      setOrphaned(identity);
    });
    return () => {
      cancelled = true;
    };
  }, [identity, noteId, userId]);

  const draft =
    storedDraft && identity && orphaned === identity && storedDraft.content !== content
      ? storedDraft
      : null;

  // A draft that now matches the note (the user restored it, or typed the
  // same words) is no longer unsaved; drop it.
  useEffect(() => {
    if (!storedDraft || storedDraft.content !== content) return;
    discardNoteDraft(noteId);
  }, [content, noteId, storedDraft]);

  // Orphaned text reached the browser-only path — the save path that allowed
  // it is the real defect, so say so out loud.
  useEffect(() => {
    if (!draft || !identity) return;
    if (warnedDraftRef.current === identity) return;
    warnedDraftRef.current = identity;
    console.warn(
      "[Notes] recovered a local draft for note",
      draft.entityId,
      `captured ${new Date(draft.capturedAt).toISOString()} (reason: ${draft.reason}).`,
      "This text exists only in this browser.",
    );
  }, [draft, identity]);

  if (!draft) return null;

  const closeDiff = () => {
    diffWindowRef.current?.close();
    diffWindowRef.current = null;
  };

  const handleRestore = () => {
    onRestore(draft.content);
    discardNoteDraft(noteId);
    closeDiff();
    toast.success("Recovered text restored and saving.");
  };

  const handleDiscard = async () => {
    // A destructive click names what is lost (destructive-actions law): this
    // text is in neither the note nor its history, so discarding is final.
    const ok = await confirm({
      title: "Discard the recovered text?",
      description:
        "This text is not in the note and not in its version history. Discarding it deletes it for good.",
      confirmLabel: "Discard",
      variant: "destructive",
    });
    if (!ok) return;
    discardNoteDraft(noteId);
    closeDiff();
  };

  const handleCopy = async () => {
    await writeClipboard(draft.content);
    toast.success("Recovered text copied.");
  };

  const handleView = () => {
    diffWindowRef.current = openDiffViewer({
      instanceId: `note-draft-recovery-${noteId}`,
      title: "Recovered text vs. saved note",
      original: content,
      modified: draft.content,
      originalLabel: "Saved note",
      modifiedLabel: "Recovered text",
      engine: "light",
      language: "markdown",
      defaultView: "split",
    });
  };

  const reason = REASON_LABELS[draft.reason] ?? "the save never finished";

  return (
    <div
      role="status"
      className="shrink-0 border-b border-primary/40 bg-primary/10"
      data-surface-value="note_draft_recovery"
    >
      <div className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
        <LifeBuoy className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground/90">
          <span className="font-medium">Unsaved text found.</span> From{" "}
          {whenLabel(draft.capturedAt)}, when {asClause(reason)}. It is not in the saved
          note.
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleView}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            Compare
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
            title="Copy the recovered text to the clipboard"
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/15 cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy text
          </button>
          <button
            type="button"
            onClick={() => void handleDiscard()}
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
