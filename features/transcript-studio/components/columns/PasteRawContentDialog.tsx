"use client";

/**
 * Paste-content dialog for the Raw column. Lets a user import a transcript
 * (or any text) from another source into the active session as one or more
 * raw segments. Splits on blank-line paragraphs; falls back to a single
 * segment if there are no paragraph breaks. Synthesizes timestamps from
 * the current session tail so imported content sits after live-recorded
 * chunks on the timeline.
 */

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { rawSegmentsAppended } from "../../redux/slice";
import { insertRawSegment } from "../../service/studioService";
import type { RawSegment } from "../../types";

interface PasteRawContentDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Rough words-per-minute for synthetic timestamps. 150 wpm is a typical
// conversational pace; the exact value doesn't matter — it just keeps
// imported segments ordered + spaced for the timeline UI.
const ASSUMED_WPM = 150;

function estimateDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 1;
  return Math.max(1, Math.round((words / ASSUMED_WPM) * 60));
}

function splitParagraphs(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [trimmed];
}

export function PasteRawContentDialog({
  sessionId,
  open,
  onOpenChange,
}: PasteRawContentDialogProps) {
  const dispatch = useAppDispatch();
  // We pull live state via `store.getState()` inside the loop instead of
  // useSelector, because we need the freshest snapshot AFTER each await —
  // recording chunks can land between iterations and we must place each
  // pasted segment strictly after them to avoid tStart/chunkIndex collisions.
  const store = useAppStore();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Read the current max chunkIndex + max tEnd for this session from the
   * live store. Returns `{ nextChunkIndex, nextTStart }` such that the next
   * insert is guaranteed not to collide with any segment that has already
   * landed (live recording, prior paste, realtime echo).
   */
  const readTail = (): { nextChunkIndex: number; nextTStart: number } => {
    const state = store.getState();
    const ids = state.transcriptStudio.rawIdsBySession[sessionId];
    const byId = state.transcriptStudio.rawById[sessionId];
    if (!ids || !byId || ids.length === 0) {
      return { nextChunkIndex: 0, nextTStart: 0 };
    }
    let maxChunk = -1;
    let maxTEnd = 0;
    for (const id of ids) {
      const seg = byId[id];
      if (!seg) continue;
      if (seg.chunkIndex > maxChunk) maxChunk = seg.chunkIndex;
      if (seg.tEnd > maxTEnd) maxTEnd = seg.tEnd;
    }
    return { nextChunkIndex: maxChunk + 1, nextTStart: maxTEnd };
  };

  const reset = () => {
    setText("");
    setBusy(false);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const paragraphs = splitParagraphs(text);
    if (paragraphs.length === 0) {
      toast.error("Paste some text first.");
      return;
    }
    setBusy(true);
    const inserted: RawSegment[] = [];
    try {
      for (const para of paragraphs) {
        // Re-read the tail BEFORE each insert. This guarantees that even if
        // a live recording chunk landed via realtime mid-paste, the pasted
        // segment's chunkIndex + tStart sit strictly past it, preserving
        // both the slice's chunkIndex tiebreaker invariant AND the user's
        // mental "imported segments go to the end of the timeline" model.
        const tail = readTail();
        const dur = estimateDurationSec(para);
        const seg = await insertRawSegment({
          sessionId,
          chunkIndex: tail.nextChunkIndex,
          tStart: tail.nextTStart,
          tEnd: tail.nextTStart + dur,
          text: para,
          source: "imported",
        });
        inserted.push(seg);
      }
      dispatch(rawSegmentsAppended({ sessionId, segments: inserted }));
      toast.success(
        `Imported ${inserted.length} segment${inserted.length === 1 ? "" : "s"}.`,
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import content.";
      toast.error(message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Paste transcript content</DialogTitle>
          <DialogDescription>
            Paste a transcript or any block of text. Blank-line breaks split
            it into separate raw segments. Imported segments sit at the end
            of the existing timeline.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your text here…"
          rows={14}
          autoFocus
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:cursor-wait"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy || !text.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {busy ? "Importing…" : "Import"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
