"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectRecordingSegments } from "../../redux/selectors";
import { deleteRecordingSegmentThunk } from "../../redux/thunks";
import { RecordingCard } from "./RecordingCard";

interface RecordingCardListProps {
  sessionId: string;
  onOpenTranscript: (recordingSegmentId: string) => void;
}

export function RecordingCardList({
  sessionId,
  onOpenTranscript,
}: RecordingCardListProps) {
  const dispatch = useAppDispatch();
  const recordings = useAppSelector(selectRecordingSegments(sessionId));
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
        "This removes the audio and its transcript from this session. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    for (const id of ids) {
      void dispatch(deleteRecordingSegmentThunk({ sessionId, recordingSegmentId: id }));
    }
    clearSelection();
  };

  if (recordings.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">
          No recordings yet. Tap the record button to capture audio — each
          recording becomes a card you can keep, replay, or hand to the
          assistant.
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
          selected={selected.has(rec.id)}
          selectionActive={selectionActive}
          onToggleSelect={toggleSelect}
          onOpenTranscript={onOpenTranscript}
        />
      ))}
    </div>
  );
}
