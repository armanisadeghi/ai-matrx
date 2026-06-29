// features/notes/actions/QuickNotesSheet.tsx
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NoteEditor } from "../components/NoteEditor";
import { useNotesRedux } from "../hooks/useNotesRedux";
import { useAllFolders } from "../utils/folderUtils";
import { PHANTOM_NOTE_ID, createPhantomNote } from "../utils/phantomNote";
import type { Note } from "../types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  FolderOpen,
  ExternalLink,
  Copy,
  Share2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShareNoteDialog } from "../components/ShareNoteDialog";
import { useToastManager } from "@/hooks/useToastManager";
import { cn } from "@/lib/utils";

console.log(
  "[Track Quick Notes] 3b, QuickNotesSheet.tsx — module evaluated (chunk loaded)",
);

interface QuickNotesSheetProps {
  onClose?: () => void;
  className?: string;
}

export function QuickNotesSheet({ onClose, className }: QuickNotesSheetProps) {
  const {
    notes,
    isLoading,
    activeNote,
    setActiveNote,
    deleteNote,
    copyNote,
    updateNote,
    findOrCreateEmptyNote,
  } = useNotesRedux();
  console.log("[Track Quick Notes] 4, QuickNotesSheet.tsx — component render", {
    isLoading,
    notesCount: notes.length,
    activeNoteId: activeNote?.id ?? null,
  });
  const toast = useToastManager("notes");
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);

  // Drop the user straight into an editable draft. "Quick" means capture, not
  // a "select a note" prompt. The phantom is a purely client-side note shown
  // when nothing real is active — it is NEVER persisted until the first edit
  // materialises it (see `handleUpdateNote`). Switching to another note before
  // typing therefore saves nothing. Same pattern as the full /notes layout.
  const [phantomNote] = useState<Note>(() => createPhantomNote("Draft"));
  const materialisingRef = useRef(false);
  // During the list load, pass null so the editor shows its spinner rather than
  // flashing the phantom; otherwise the phantom is the editable fallback.
  const editorNote = activeNote ?? (isLoading ? null : phantomNote);

  useEffect(() => {
    if (!isLoading) {
      console.log(
        "[Track Quick Notes] 8, QuickNotesSheet.tsx — notes list ready, showing content",
        {
          notesCount: notes.length,
          editorNoteId: editorNote?.id ?? null,
          editorNoteLabel: editorNote?.label ?? null,
        },
      );
    }
  }, [isLoading, notes.length, editorNote?.id, editorNote?.label]);

  // Drop the cursor into the note body as soon as one is ready — "Quick Note"
  // means start typing, not "find the editor". The NoteEditor's plain-mode
  // textarea is the capture surface; focus it once the editor mounts.
  const editorWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!editorNote) return undefined;
    const t = window.setTimeout(() => {
      const el = editorWrapRef.current?.querySelector<
        HTMLTextAreaElement | HTMLElement
      >('textarea, [contenteditable="true"]');
      el?.focus();
    }, 80);
    return () => window.clearTimeout(t);
  }, [editorNote?.id]);

  // Get all folders - optimized to only recalculate when folder names change
  const allFolders = useAllFolders(notes);

  // Group notes by folder for the selector - single source of truth
  const notesByFolder = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    const seenIds = new Set<string>();

    // Initialize all folders (including defaults)
    allFolders.forEach((folder) => {
      grouped[folder] = [];
    });

    // Add notes to their folders (deduplicate by ID)
    notes.forEach((note) => {
      if (!seenIds.has(note.id) && grouped[note.folder_name]) {
        grouped[note.folder_name].push(note);
        seenIds.add(note.id);
      }
    });

    return grouped;
  }, [notes, allFolders]);

  const handleCreateNote = useCallback(async () => {
    try {
      const targetFolder = activeNote?.folder_name || "Draft";
      await findOrCreateEmptyNote(targetFolder);
      toast.success("Note ready");
    } catch (error) {
      console.error("Error creating note:", error);
      toast.error(error);
    }
  }, [activeNote, findOrCreateEmptyNote, toast]);

  const handleDeleteNote = useCallback(async () => {
    if (!activeNote) return;

    try {
      const noteLabel = activeNote.label;
      await deleteNote(activeNote.id);
      toast.success(`"${noteLabel}" deleted`);
    } catch (error) {
      console.error("Error deleting note:", error);
      toast.error(error);
    }
  }, [activeNote, deleteNote, toast]);

  const handleCopyNote = useCallback(async () => {
    if (!activeNote) return;

    try {
      const noteLabel = activeNote.label;
      await copyNote(activeNote.id);
      toast.success(`"${noteLabel}" copied`);
    } catch (error) {
      console.error("Error copying note:", error);
      toast.error(error);
    }
  }, [activeNote, copyNote, toast]);

  const handleShareNote = useCallback(() => {
    if (!activeNote) return;
    setShareNoteId(activeNote.id);
  }, [activeNote]);

  const handleUpdateNote = useCallback(
    async (noteId: string, updates: Partial<Note>) => {
      // First edit of the phantom → materialise it into a real DB note, then
      // apply the edit. This is the "only save if you do something" guarantee.
      if (noteId === PHANTOM_NOTE_ID) {
        if (materialisingRef.current) return;
        materialisingRef.current = true;
        try {
          const realNote = await findOrCreateEmptyNote(
            updates.folder_name || "Draft",
          );
          const { folder_name: _folder, ...rest } = updates;
          const hasPayload = Object.keys(rest).some(
            (k) => rest[k as keyof typeof rest] !== undefined,
          );
          if (hasPayload) {
            await updateNote(realNote.id, rest);
          }
        } catch (error) {
          console.error("Error materialising phantom note:", error);
          toast.error(error);
        } finally {
          materialisingRef.current = false;
        }
        return;
      }
      updateNote(noteId, updates);
    },
    [updateNote, findOrCreateEmptyNote, toast],
  );

  const handleSelectNote = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        setActiveNote(note);
      }
    },
    [notes, setActiveNote],
  );

  if (isLoading) {
    console.log(
      "[Track Quick Notes] 7, QuickNotesSheet.tsx — loading state (waiting for notes list)",
    );
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Loading notes...
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Compact Header with Note Selector */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-muted">
        <Select value={activeNote?.id || ""} onValueChange={handleSelectNote}>
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue placeholder="Select a note">
              {activeNote ? (
                <span className="flex items-center gap-2">
                  <FolderOpen className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{activeNote.folder_name}</span>
                  <span className="text-muted-foreground">/</span>
                  <span>{activeNote.label}</span>
                </span>
              ) : (
                "Select a note"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {Object.entries(notesByFolder).map(([folder, folderNotes]) => {
              if (folderNotes.length > 0) {
                console.log(
                  "[Track Quick Notes] 9, QuickNotesSheet.tsx — rendering note items in selector",
                  {
                    folder,
                    count: folderNotes.length,
                    labels: folderNotes.map((n) => n.label),
                  },
                );
              }
              return (
                <React.Fragment key={folder}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    {folder}
                  </div>
                  {folderNotes.map((note) => (
                    <SelectItem
                      key={note.id}
                      value={note.id}
                      className="text-xs pl-4"
                    >
                      {note.label}
                    </SelectItem>
                  ))}
                </React.Fragment>
              );
            })}
          </SelectContent>
        </Select>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCreateNote}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New Note</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {activeNote && (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleCopyNote}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy Note</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleShareNote}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share Note</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleDeleteNote}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Note</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}

        <div className="ml-auto pl-2 border-l border-border">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => window.open("/notes", "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Open in New Tab</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Editor - Takes full remaining space */}
      <div ref={editorWrapRef} className="flex-1 overflow-hidden">
        <NoteEditor
          note={editorNote}
          onUpdate={handleUpdateNote}
          allNotes={notes}
          className="h-full"
        />
      </div>

      {/* Share Note Dialog */}
      {shareNoteId && (
        <ShareNoteDialog
          open={shareNoteId !== null}
          onOpenChange={(open) => !open && setShareNoteId(null)}
          noteId={shareNoteId}
          noteLabel={notes.find((n) => n.id === shareNoteId)?.label || "Note"}
        />
      )}
    </div>
  );
}
