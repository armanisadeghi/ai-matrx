"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronRight, Trash2, X } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectArchivedRecordingSegments,
  selectRecordingSegments,
} from "../../redux/selectors";
import { deleteRecordingSegmentThunk } from "../../redux/thunks";
import { RecordingCard } from "./RecordingCard";
import type { TranscriptSection } from "./FullTranscriptDrawer";

interface RecordingCardListProps {
  sessionId: string;
  onOpenTranscript: (
    recordingSegmentId: string,
    section?: TranscriptSection,
  ) => void;
}

export function RecordingCardList({
  sessionId,
  onOpenTranscript,
}: RecordingCardListProps) {
  const dispatch = useAppDispatch();
  const recordings = useAppSelector(selectRecordingSegments(sessionId));
  const archived = useAppSelector(selectArchivedRecordingSegments(sessionId));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

  const selectionActive = selected.size > 0;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const handleDelete = async () => {
    const ids = [...selected];
    const ok = await confirm({
      title: `Delete ${ids.length} recording${ids.length === 1 ? "" : "s"}?`,
      description:
        "This permanently removes the audio and transcript. To keep them, use Archive or Unsort instead.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    for (const id of ids) {
      void dispatch(
        deleteRecordingSegmentThunk({ sessionId, recordingSegmentId: id }),
      );
    }
    clearSelection();
  };

  if (recordings.length === 0 && archived.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No recordings yet. Tap the record button to capture audio. Each
          recording becomes a card — swipe it to archive, unsort, or delete.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {selectionActive && (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={clearSelection}
            className="flex items-center gap-1.5 text-sm text-muted-foreground"
          >
            <X className="h-4 w-4" />
            {selected.size} selected
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground active:bg-destructive/80"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      )}

      {recordings.map((rec, idx) => (
        <RecordingCard
          key={rec.id}
          sessionId={sessionId}
          recording={rec}
          index={idx}
          variant="active"
          selected={selected.has(rec.id)}
          selectionActive={selectionActive}
          onToggleSelect={toggleSelect}
          onOpenTranscript={onOpenTranscript}
        />
      ))}

      {archived.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground active:bg-accent"
          >
            {showArchived ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Archive className="h-4 w-4" />
            Archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-1 flex flex-col gap-2">
              {archived.map((rec, idx) => (
                <RecordingCard
                  key={rec.id}
                  sessionId={sessionId}
                  recording={rec}
                  index={idx}
                  variant="archived"
                  onOpenTranscript={onOpenTranscript}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
