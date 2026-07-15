"use client";

/**
 * NoteSidebarBulkBar — compact bulk-action bar shown in the notes sidebar
 * while selection mode is active. It renders the moment selection mode is
 * entered (docked at the TOP, just below the toolbar) so the UI doesn't shift
 * when the first note is checked; actions are disabled until ≥1 note is
 * selected. Mirrors features/files/components/surfaces/desktop/BulkActionsBar
 * in shape (bounded-concurrency fan-out + a single confirm for delete) but
 * sized to fit a narrow sidebar column.
 */

import { useState } from "react";
import {
  CheckSquare,
  Database,
  Download,
  FolderInput,
  FolderPlus,
  Loader2,
  Share2,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/matrx/Tooltip";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import { removeInstanceTab } from "../redux/slice";
import { deleteNote, moveNoteToFolder, restoreNote } from "../redux/thunks";
import { ingestSource } from "@/features/rag/api/ingest";
import { isNoteContentEmpty } from "../utils/noteUtils";
import { runWithConcurrency } from "../utils/concurrency";
import {
  downloadNoteAsMarkdown,
  downloadNotesAsMarkdownZip,
} from "../utils/exportNotesMarkdown";
import { openNoteShareModal } from "./note-actions/noteMenuRegistry";
import type { NoteRecord } from "../redux/notes.types";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { createFolder } from "../service/notesService";

const MAX_PARALLEL = 4;

interface NoteSidebarBulkBarProps {
  instanceId: string;
  selectedNotes: NoteRecord[];
  allFolders: string[];
  openTabIds: string[] | undefined;
  /** Exit selection mode entirely (clears selection). */
  onClear: () => void;
  /** True when every selectable (visible) note is already selected. */
  allVisibleSelected: boolean;
  /** Select all visible notes, or clear if all are already selected. */
  onToggleSelectAll: () => void;
  /** How many notes are selectable in the current view (for the select-all tooltip). */
  selectableCount: number;
}

export function NoteSidebarBulkBar({
  instanceId,
  selectedNotes,
  allFolders,
  openTabIds,
  onClear,
  allVisibleSelected,
  onToggleSelectAll,
  selectableCount,
}: NoteSidebarBulkBarProps) {
  const dispatch = useAppDispatch();
  const [busyKind, setBusyKind] = useState<
    "move" | "knowledge" | "delete" | null
  >(null);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  const count = selectedNotes.length;
  const hasAny = count > 0;
  const singleNote = count === 1 ? selectedNotes[0] : null;

  const handleMove = async (folder: string) => {
    if (!hasAny || busyKind) return;
    setBusyKind("move");
    try {
      const { succeeded, failed } = await runWithConcurrency(
        selectedNotes,
        MAX_PARALLEL,
        async (note) => {
          await dispatch(
            moveNoteToFolder({ noteId: note.id, folder }),
          ).unwrap();
        },
      );
      if (failed > 0) {
        toast.error(`Moved ${succeeded}, ${failed} failed`);
      } else {
        toast.success(
          `Moved ${succeeded} note${succeeded === 1 ? "" : "s"} to ${folder}`,
        );
      }
      onClear();
    } finally {
      setBusyKind(null);
    }
  };

  const handleKnowledge = async () => {
    if (!hasAny || busyKind) return;
    setBusyKind("knowledge");
    try {
      const { succeeded, failed } = await runWithConcurrency(
        selectedNotes,
        MAX_PARALLEL,
        async (note) => {
          await ingestSource("note", note.id);
        },
      );
      if (failed > 0) {
        toast.error(`Indexed ${succeeded}, ${failed} failed`);
      } else {
        toast.success(
          `Added ${succeeded} note${succeeded === 1 ? "" : "s"} to knowledge base`,
        );
      }
    } finally {
      setBusyKind(null);
    }
  };

  const handleCreateFolder = async (folderName: string) => {
    await createFolder(folderName);
    await handleMove(folderName);
  };

  const handleExport = async () => {
    if (!hasAny) return;
    if (singleNote) {
      downloadNoteAsMarkdown(singleNote);
      return;
    }
    await downloadNotesAsMarkdownZip(selectedNotes, "notes-export.zip");
  };

  const handleShare = () => {
    if (!singleNote) return;
    void openNoteShareModal(dispatch, singleNote.id, singleNote.label);
  };

  const handleDelete = async () => {
    if (!hasAny || busyKind) return;

    const allEmpty = selectedNotes.every((n) => isNoteContentEmpty(n.content));
    if (!allEmpty) {
      const ok = await confirm({
        title: `Delete ${count} note${count === 1 ? "" : "s"}?`,
        description: `Selected note${count === 1 ? "" : "s"} will be moved to trash. You can restore ${count === 1 ? "it" : "them"} later.`,
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
    }

    setBusyKind("delete");
    try {
      for (const note of selectedNotes) {
        if (openTabIds?.includes(note.id)) {
          dispatch(removeInstanceTab({ instanceId, noteId: note.id }));
        }
      }
      const deletedIds = selectedNotes.map((n) => n.id);
      const { succeeded, failed } = await runWithConcurrency(
        selectedNotes,
        MAX_PARALLEL,
        async (note) => {
          await dispatch(deleteNote(note.id)).unwrap();
        },
      );

      if (failed > 0) {
        toast.error(`Deleted ${succeeded}, ${failed} failed`);
      } else {
        toast.success(
          `Deleted ${succeeded} note${succeeded === 1 ? "" : "s"}`,
          {
            action: {
              label: "Undo",
              onClick: () => {
                for (const id of deletedIds) dispatch(restoreNote(id));
                toast.success("Notes restored");
              },
            },
          },
        );
      }
      onClear();
    } finally {
      setBusyKind(null);
    }
  };

  // Disabled while a bulk op runs, or when nothing is selected yet.
  const noneSelected = !hasAny;
  const actionsDisabled = busyKind !== null || noneSelected;
  const btn =
    "flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:cursor-not-allowed [&_svg]:w-3.5 [&_svg]:h-3.5";

  return (
    <>
      <div
        className="shrink-0 flex items-center gap-0.5 px-2 py-1.5 border-b border-border/30 bg-accent/40"
        role="toolbar"
        aria-label="Bulk note actions"
      >
        {/* Select-all toggle */}
        <SimpleTooltip
          text={
            allVisibleSelected
              ? "Clear selection"
              : `Select all ${selectableCount} visible`
          }
        >
          <button
            type="button"
            onClick={onToggleSelectAll}
            disabled={busyKind !== null || selectableCount === 0}
            className={cn(btn, "text-foreground/70")}
            aria-pressed={allVisibleSelected}
          >
            {allVisibleSelected ? <CheckSquare /> : <Square />}
          </button>
        </SimpleTooltip>

        <span className="min-w-[4.5rem] px-1 text-[0.6875rem] font-medium tabular-nums text-foreground">
          {hasAny ? `${count} selected` : "Select notes"}
        </span>
        <span className="h-4 w-px bg-border" />

        <DropdownMenu>
          <SimpleTooltip text="Move to folder">
            <DropdownMenuTrigger asChild>
              <button type="button" disabled={actionsDisabled} className={btn}>
                {busyKind === "move" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FolderInput />
                )}
              </button>
            </DropdownMenuTrigger>
          </SimpleTooltip>
          <DropdownMenuContent
            align="start"
            className="max-h-[220px] overflow-auto"
          >
            <DropdownMenuItem
              onSelect={() => setCreateFolderOpen(true)}
              className="text-primary"
            >
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              New folder…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {allFolders.map((folder) => (
              <DropdownMenuItem
                key={folder}
                onSelect={() => void handleMove(folder)}
              >
                {folder}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <SimpleTooltip text="Add to knowledge base">
          <button
            type="button"
            onClick={() => void handleKnowledge()}
            disabled={actionsDisabled}
            className={btn}
          >
            {busyKind === "knowledge" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Database />
            )}
          </button>
        </SimpleTooltip>

        <SimpleTooltip text="Export as Markdown">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={actionsDisabled}
            className={btn}
          >
            <Download />
          </button>
        </SimpleTooltip>

        <SimpleTooltip
          text={
            noneSelected
              ? "Select a note to share"
              : singleNote
                ? "Share"
                : "Select exactly one note to share"
          }
        >
          <button
            type="button"
            onClick={handleShare}
            disabled={busyKind !== null || !singleNote}
            className={btn}
          >
            <Share2 />
          </button>
        </SimpleTooltip>

        <SimpleTooltip text="Delete (move to trash)">
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={actionsDisabled}
            className={cn(
              btn,
              "text-destructive hover:bg-destructive/10 hover:text-destructive disabled:hover:bg-transparent",
            )}
          >
            {busyKind === "delete" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Trash2 />
            )}
          </button>
        </SimpleTooltip>

        <div className="flex-1" />
        <SimpleTooltip text="Exit selection mode">
          <button
            type="button"
            onClick={onClear}
            className={cn(btn, "text-foreground/70")}
          >
            <X />
          </button>
        </SimpleTooltip>
      </div>
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onConfirm={handleCreateFolder}
        existingFolders={allFolders}
        description={`Create a folder and move ${count} selected note${count === 1 ? "" : "s"} into it.`}
        confirmLabel="Create & Move"
      />
    </>
  );
}
