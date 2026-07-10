"use client";

/**
 * NoteSidebarBulkBar — compact bulk-action bar shown in the notes sidebar
 * once one or more notes are checkbox-selected (selection mode). Mirrors
 * features/files/components/surfaces/desktop/BulkActionsBar.tsx in shape
 * (bounded-concurrency fan-out + a single confirm for delete) but sized to
 * fit a narrow sidebar column instead of floating as a bottom pill.
 */

import { useState } from "react";
import {
  Database,
  Download,
  FolderInput,
  Loader2,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
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

const MAX_PARALLEL = 4;

interface NoteSidebarBulkBarProps {
  instanceId: string;
  selectedNotes: NoteRecord[];
  allFolders: string[];
  openTabIds: string[] | undefined;
  onClear: () => void;
}

export function NoteSidebarBulkBar({
  instanceId,
  selectedNotes,
  allFolders,
  openTabIds,
  onClear,
}: NoteSidebarBulkBarProps) {
  const dispatch = useAppDispatch();
  const [busyKind, setBusyKind] = useState<
    "move" | "knowledge" | "delete" | null
  >(null);

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

  if (!hasAny) return null;

  return (
    <div
      className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-t border-border/30 bg-accent/30"
      role="toolbar"
      aria-label="Bulk note actions"
    >
      <span className="px-1 text-[0.6875rem] font-medium tabular-nums text-foreground">
        {count} selected
      </span>
      <span className="h-4 w-px bg-border" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busyKind !== null}
            title="Move to folder"
            className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [&_svg]:w-3.5 [&_svg]:h-3.5"
          >
            {busyKind === "move" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <FolderInput />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[220px] overflow-auto"
        >
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

      <button
        type="button"
        onClick={() => void handleKnowledge()}
        disabled={busyKind !== null}
        title="Add to knowledge base"
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [&_svg]:w-3.5 [&_svg]:h-3.5"
      >
        {busyKind === "knowledge" ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Database />
        )}
      </button>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busyKind !== null}
        title="Export as Markdown"
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [&_svg]:w-3.5 [&_svg]:h-3.5"
      >
        <Download />
      </button>

      <button
        type="button"
        onClick={handleShare}
        disabled={busyKind !== null || !singleNote}
        title={singleNote ? "Share" : "Select exactly one note to share"}
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 [&_svg]:w-3.5 [&_svg]:h-3.5"
      >
        <Share2 />
      </button>

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={busyKind !== null}
        title="Delete"
        className={cn(
          "flex items-center justify-center w-6 h-6 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 [&_svg]:w-3.5 [&_svg]:h-3.5",
        )}
      >
        {busyKind === "delete" ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 />
        )}
      </button>

      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        title="Cancel selection"
        className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:w-3.5 [&_svg]:h-3.5"
      >
        <X />
      </button>
    </div>
  );
}
