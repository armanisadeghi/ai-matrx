"use client";

// NoteSidebarRow — single note row for NoteSidebar, built on the shared
// ItemRow/ItemMenu primitives (components/official/item/*) so notes get the
// same hover kebab + right-click "..." menu the chat sidebar uses for
// conversations. Replaces the 3 near-identical inline <button> blocks that
// used to live directly in NoteSidebar.tsx (recent flat list, default-mode
// recent, grouped folder list) — folder-mode drag/drop is preserved via the
// draggable wrapper props.

import { FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppDispatch } from "@/lib/redux/hooks";
import { ItemRow } from "@/components/official/item/ItemRow";
import { cn } from "@/lib/utils";
import { saveNoteField } from "../redux/thunks";
import { buildNoteMenu } from "./note-actions/noteMenuRegistry";
import type { NoteRecord } from "../redux/notes.types";

interface NoteSidebarRowProps {
  note: NoteRecord;
  instanceId: string;
  isActive: boolean;
  isOpenTab: boolean;
  allFolders: string[];
  openKnowledge: (opts: { noteId: string; title?: string }) => void;
  formatTime: (dateStr: string | null | undefined) => string;
  /** Shows the note's folder name/"Draft" as a secondary label (recent/default modes). */
  showFolderTag?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onSelectNote: (noteId: string) => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelect: (noteId: string) => void;
}

export function NoteSidebarRow({
  note,
  instanceId,
  isActive,
  isOpenTab,
  allFolders,
  openKnowledge,
  formatTime,
  showFolderTag = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onSelectNote,
  selectionMode,
  isSelected,
  onToggleSelect,
}: NoteSidebarRowProps) {
  const dispatch = useAppDispatch();

  return (
    <div
      data-note-id={note.id}
      draggable={draggable && !selectionMode}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={cn("flex items-center gap-0.5", isDragging && "opacity-40")}
    >
      {/*
       * Rendered as a SIBLING of ItemRow, not passed via `leading` — ItemRow's
       * primary element is itself a <button>, so an interactive Radix
       * checkbox can't nest inside it without producing invalid
       * button-in-button HTML. The row's own onOpen (below) already toggles
       * selection on any click, so this is a visual affordance more than a
       * second interaction path, but it still needs its own handler for
       * users who target the checkbox directly.
       */}
      {selectionMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(note.id)}
          className="h-3.5 w-3.5 ml-2 shrink-0"
          aria-label={`Select ${note.label}`}
        />
      )}
      <div className="flex-1 min-w-0">
        <ItemRow
          size="sm"
          label={note.label}
          secondaryLabel={
            showFolderTag ? note.folder_name || "Draft" : undefined
          }
          leading={
            selectionMode ? undefined : (
              <FileText className="w-3.5 h-3.5 shrink-0 opacity-50" />
            )
          }
          trailing={
            <>
              {isOpenTab && !isActive && (
                <span className="h-1 w-1 rounded-full bg-foreground/40" />
              )}
              <span className="text-[0.625rem] opacity-40 tabular-nums">
                {formatTime(note.updated_at)}
              </span>
            </>
          }
          active={isActive}
          className={cn(isOpenTab && !isActive && "bg-accent/30")}
          onOpen={() =>
            selectionMode ? onToggleSelect(note.id) : onSelectNote(note.id)
          }
          rename={
            selectionMode
              ? undefined
              : {
                  value: note.label,
                  emptyFallback: "Untitled",
                  onCommit: (next) =>
                    void dispatch(
                      saveNoteField({
                        noteId: note.id,
                        field: "label",
                        value: next,
                      }),
                    ),
                }
          }
          menu={
            selectionMode
              ? undefined
              : () =>
                  buildNoteMenu({
                    instanceId,
                    noteId: note.id,
                    label: note.label,
                    content: note.content,
                    folder: note.folder_name || "Uncategorized",
                    allFolders,
                    openKnowledge,
                    dispatch,
                  })
          }
        />
      </div>
    </div>
  );
}
