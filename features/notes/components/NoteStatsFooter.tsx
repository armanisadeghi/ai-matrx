"use client";

// NoteStatsFooter — the ONLY place notes surfaces show live content metrics.
//
// Compartmentalization:
//   - Editor body (NoteEditorCore / ProTextarea) never pins a stats bar.
//   - Chrome (NoteMetadataBar) owns folder / context / tags.
//   - This footer owns save status + chars/words/lines/paragraphs.
//
// Drop into WindowPanel `footer` or the bottom of the /notes main column.
// Designed for WindowPanel `footerVariant="bar"` — no self-owned bg/border
// (the slot provides that). Pass `standalone` when rendering outside a slot.

import { useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
} from "../redux/selectors";
import {
  getNoteLiveContent,
  subscribeNoteLiveContent,
} from "../utils/noteLiveContent";
import { PlainTextMetricsBar } from "@/components/text/PlainTextMetricsBar";
import { cn } from "@/lib/utils";

export interface NoteStatsFooterProps {
  noteId: string;
  className?: string;
  /**
   * When true, paints its own top border + background (for /notes inline use).
   * When false (default), relies on WindowPanel footer chrome.
   */
  standalone?: boolean;
}

export function NoteStatsFooter({
  noteId,
  className,
  standalone = false,
}: NoteStatsFooterProps) {
  const reduxContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  const liveContent = useSyncExternalStore(
    (onStoreChange) => subscribeNoteLiveContent(noteId, onStoreChange),
    () => getNoteLiveContent(noteId),
    () => undefined,
  );
  const content = liveContent ?? reduxContent;

  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const isSaving = useAppSelector(selectNoteIsSavingById(noteId));
  const note = useAppSelector(selectNoteById(noteId));

  const saveError =
    note?._error && note._error !== "conflict" ? note._error : null;
  const saveStatus = saveError
    ? "Save failed"
    : isSaving
      ? "Saving…"
      : isDirty
        ? "Unsaved"
        : "Saved";
  const statusColor = saveError
    ? "text-destructive"
    : isSaving
      ? "text-yellow-500"
      : isDirty
        ? "text-amber-500"
        : "text-emerald-500";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 px-2 py-0.5",
        standalone && "shrink-0 border-t border-border/30 bg-background",
        className,
      )}
    >
      <span
        className={cn("shrink-0 text-[0.625rem] font-medium", statusColor)}
        title={saveError ?? undefined}
      >
        {saveStatus}
      </span>
      <PlainTextMetricsBar
        text={content}
        compact
        metrics={[
          "charCount",
          "whitespaceCharCount",
          "wordCount",
          "lineCount",
          "paragraphCount",
        ]}
        className="min-w-0 flex-1 border-t-0 bg-transparent px-0 py-0 shadow-none"
      />
    </div>
  );
}
