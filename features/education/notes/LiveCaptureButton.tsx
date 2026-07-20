// features/education/notes/LiveCaptureButton.tsx
//
// Live lecture capture (P4): press record → real-time transcription streams into
// the OPEN note editor. Reuses the ONE canonical streaming-transcription path
// (features/audio useChunkedRecordAndTranscribe → the shared mic stream + Groq
// chunk pipeline) — never a second capture path. Each transcribed chunk is
// appended to the note's live Redux content (updateNoteContent), so it renders in
// the editor as the lecturer speaks and autosaves through the notes middleware.
// The student can keep typing/annotating between chunks — appends always target
// the freshest content, so manual edits are never clobbered.

"use client";

import { useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { updateNoteContent } from "@/features/notes/redux/slice";
import { selectNoteContent } from "@/features/notes/redux/selectors";
import { useChunkedRecordAndTranscribe } from "@/features/audio/hooks/useChunkedRecordAndTranscribe";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveCaptureButton({ noteId }: { noteId: string }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const appendToNote = useCallback(
    (text: string, opts?: { asHeader?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const current = selectNoteContent(noteId)(store.getState()) ?? "";
      let next: string;
      if (opts?.asHeader) {
        const gap = current && !current.endsWith("\n\n") ? (current.endsWith("\n") ? "\n" : "\n\n") : "";
        next = `${current}${gap}${trimmed}\n\n`;
      } else {
        const sep =
          current && !current.endsWith(" ") && !current.endsWith("\n") ? " " : "";
        next = `${current}${sep}${trimmed} `;
      }
      dispatch(updateNoteContent({ id: noteId, content: next }));
    },
    [dispatch, store, noteId],
  );

  const {
    isRecording,
    isTranscribing,
    duration,
    startRecording,
    stopRecording,
  } = useChunkedRecordAndTranscribe({
    onChunkTranscribed: (chunkText) => appendToNote(chunkText),
    onError: (message) => toast.error(message || "Recording failed"),
  });

  const start = async () => {
    const heading = `## Live capture — ${new Date().toLocaleString()}`;
    appendToNote(heading, { asHeader: true });
    try {
      await startRecording();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start recording");
    }
  };

  const stop = async () => {
    await stopRecording();
    toast.success("Live capture stopped — transcript saved to the note");
  };

  if (isRecording) {
    return (
      <Button
        size="sm"
        variant="destructive"
        onClick={stop}
        className="gap-1.5"
        title="Stop live capture"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        <Square className="h-3.5 w-3.5" />
        <span className="tabular-nums">{formatDuration(duration)}</span>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={start}
      disabled={isTranscribing}
      className={cn("gap-1.5")}
      title="Record a lecture and transcribe it live into this note"
    >
      {isTranscribing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Mic className="h-3.5 w-3.5" />
      )}
      Live capture
    </Button>
  );
}
