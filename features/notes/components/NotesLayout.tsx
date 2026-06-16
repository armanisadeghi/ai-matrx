// features/notes/components/NotesLayout.tsx
"use client";

import React, {
  useCallback,
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { NotesSidebar } from "./NotesSidebar";
import { NoteEditor } from "./NoteEditor";
import { NoteTabs } from "./NoteTabs";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { ShareNoteDialog } from "./ShareNoteDialog";
import { NotesHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { useNotesRedux } from "../hooks/useNotesRedux";
import { useAllFolders } from "../utils/folderUtils";
import { PHANTOM_NOTE_ID, createPhantomNote } from "../utils/phantomNote";
import type { Note } from "../types";
import { cn } from "@/lib/utils";
import { Loader2, Menu } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Button } from "@/components/ui/button";
import { useToastManager } from "@/hooks/useToastManager";

interface NotesLayoutProps {
  className?: string;
}

export function NotesLayout({ className }: NotesLayoutProps) {
  const {
    notes,
    isLoading,
    activeNote,
    setActiveNote,
    createNote,
    updateNote,
    deleteNote,
    copyNote,
    refreshNotes,
    findOrCreateEmptyNote,
    openNoteInTab,
    openTabs,
    closeTab,
  } = useNotesRedux();

  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [shareNoteId, setShareNoteId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalLabel, setOriginalLabel] = useState<string>("");
  const [sortConfig, setSortConfig] = useState<{
    field: string;
    order: "asc" | "desc";
  }>({
    field: "updated_at",
    order: "desc",
  });
  const toast = useToastManager("notes");

  // Phantom note: shown when no real note is active, never saved until user edits
  const [phantomNote] = useState<Note>(createPhantomNote);
  // Track if we're in the process of materialising the phantom into a real note
  const materialisingRef = useRef(false);

  // The note passed to the editor: real active note if we have one, phantom otherwise
  // During loading, pass null so the spinner shows instead of a phantom
  const editorNote = activeNote ?? (isLoading ? null : phantomNote);

  // Track when label changes
  useEffect(() => {
    if (activeNote) {
      setOriginalLabel(activeNote.label);
      setIsDirty(false);
    }
  }, [activeNote?.id]);

  // Update dirty state when note label changes
  useEffect(() => {
    if (activeNote && originalLabel && activeNote.label !== originalLabel) {
      setIsDirty(true);
    } else {
      setIsDirty(false);
    }
  }, [activeNote?.label, originalLabel]);

  // Note: refreshNotes() is already called on mount by NotesContext, no need to call again here

  // Get all folders (default + custom) - optimized to only recalculate when folder names change
  const existingFolders = useAllFolders(notes);

  // Keyboard shortcuts for tab management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+W or Cmd+W to close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === "w" && activeNote) {
        e.preventDefault();
        closeTab(activeNote.id);
      }

      // Ctrl+Tab to cycle through tabs
      if (e.ctrlKey && e.key === "Tab" && openTabs.length > 1) {
        e.preventDefault();
        const currentIndex = openTabs.indexOf(activeNote?.id || "");
        const nextIndex = (currentIndex + 1) % openTabs.length;
        const nextNoteId = openTabs[nextIndex];
        if (nextNoteId) {
          openNoteInTab(nextNoteId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNote, openTabs, closeTab, openNoteInTab]);

  const handleCreateNote = useCallback(
    async (folderName?: string) => {
      try {
        const targetFolder = folderName || "Draft";

        // Use the context method which handles duplicate checking
        const note = await findOrCreateEmptyNote(targetFolder);

        // Open the new note in a tab
        if (note) {
          openNoteInTab(note.id);
        }

        setIsMobileSidebarOpen(false);
        toast.success("Note ready");
      } catch (error) {
        console.error("Error creating note:", error);
        toast.error(error);
      }
    },
    [findOrCreateEmptyNote, openNoteInTab, toast],
  );

  const handleCreateFolder = useCallback(() => {
    setIsCreateFolderOpen(true);
  }, []);

  const handleConfirmCreateFolder = useCallback(
    async (folderName: string) => {
      try {
        // Use the context method which finds or creates an empty note
        await findOrCreateEmptyNote(folderName);
        setIsMobileSidebarOpen(false);

        toast.success(`Folder "${folderName}" created`);
      } catch (error) {
        console.error("Error creating folder:", error);
        toast.error(error);
      }
    },
    [findOrCreateEmptyNote, toast],
  );

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      try {
        const noteToDelete = notes.find((n) => n.id === noteId);
        await deleteNote(noteId);

        toast.success(`"${noteToDelete?.label || "Note"}" deleted`);
      } catch (error) {
        console.error("Error deleting note:", error);
        toast.error(error);
      }
    },
    [notes, deleteNote, toast],
  );

  const handleCopyNote = useCallback(
    async (noteId: string) => {
      try {
        const noteToCopy = notes.find((n) => n.id === noteId);
        await copyNote(noteId);

        toast.success(`"${noteToCopy?.label || "Note"}" copied`);
      } catch (error) {
        console.error("Error copying note:", error);
        toast.error(error);
      }
    },
    [notes, copyNote, toast],
  );

  const handleShareNote = useCallback((noteId: string) => {
    setShareNoteId(noteId);
  }, []);

  const handleSaveNote = useCallback(async () => {
    if (!activeNote) return;

    try {
      setIsSaving(true);

      // Call the editor's force save which captures ALL current state including unsaved content
      if ((window as any).__noteEditorForceSave) {
        (window as any).__noteEditorForceSave();
      } else {
        // Fallback: save with current activeNote data
        await updateNote(activeNote.id, {
          label: activeNote.label,
          content: activeNote.content,
          folder_name: activeNote.folder_name,
          tags: activeNote.tags,
          metadata: activeNote.metadata,
        });
      }

      setOriginalLabel(activeNote.label);
      setIsDirty(false);
      toast.success("Note saved");
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error(error);
    } finally {
      setIsSaving(false);
    }
  }, [activeNote, updateNote, toast]);

  const handleUpdateNote = useCallback(
    async (noteId: string, updates: Partial<Note>) => {
      // If editing the phantom note, materialise it as a real DB note first
      if (noteId === PHANTOM_NOTE_ID) {
        // Guard against concurrent calls during materialisation
        if (materialisingRef.current) return;
        materialisingRef.current = true;
        try {
          const realNote = await findOrCreateEmptyNote(
            updates.folder_name || "Draft",
          );
          // Apply any content/label updates from the first edit
          const { folder_name: _f, ...restUpdates } = updates;
          const hasPayload = Object.keys(restUpdates).some(
            (k) => restUpdates[k as keyof typeof restUpdates] !== undefined,
          );
          if (hasPayload) {
            await updateNote(realNote.id, restUpdates);
          }
          openNoteInTab(realNote.id);
        } catch (err) {
          console.error("Error materialising phantom note:", err);
          toast.error(err);
        } finally {
          materialisingRef.current = false;
        }
        return;
      }
      // Context handles optimistic updates automatically
      updateNote(noteId, updates);
    },
    [updateNote, findOrCreateEmptyNote, openNoteInTab, toast],
  );

  const handleMoveNote = useCallback(
    async (noteId: string, newFolder: string) => {
      try {
        const note = notes.find((n) => n.id === noteId);
        if (!note) return;

        await updateNote(noteId, { folder_name: newFolder });

        toast.success(`Moved "${note.label}" to "${newFolder}"`);
      } catch (error) {
        console.error("Error moving note:", error);
        toast.error(error);
      }
    },
    [notes, updateNote, toast],
  );

  const handleRenameFolder = useCallback(
    async (oldName: string, newName: string) => {
      try {
        const { renameFolder } = await import("../service/notesService");
        await renameFolder(oldName, newName);
        await refreshNotes();

        toast.success(`Renamed folder "${oldName}" to "${newName}"`);
      } catch (error) {
        console.error("Error renaming folder:", error);
        toast.error(error);
      }
    },
    [refreshNotes, toast],
  );

  const handleDeleteFolderNotes = useCallback(
    async (folderName: string) => {
      try {
        const { deleteFolderNotes } = await import("../service/notesService");
        const count = await deleteFolderNotes(folderName);
        await refreshNotes();

        toast.success(
          `Deleted ${count} note${count !== 1 ? "s" : ""} from "${folderName}"`,
        );
      } catch (error) {
        console.error("Error deleting folder notes:", error);
        toast.error(error);
      }
    },
    [refreshNotes, toast],
  );

  const handleSelectNote = useCallback(
    (note: Note) => {
      // Open note in tab (or switch to it if already open)
      openNoteInTab(note.id);
      setIsMobileSidebarOpen(false); // Close mobile sidebar after selecting note
    },
    [openNoteInTab],
  );

  const handleSortChange = useCallback(
    (field: string, order: "asc" | "desc") => {
      setSortConfig({ field, order });
    },
    [],
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Page Header - Inject into main layout header */}
      <NotesHeader
        onCreateNote={() => handleCreateNote()}
        onCreateFolder={handleCreateFolder}
        sortConfig={sortConfig}
        onSortChange={handleSortChange}
      />

      <div className={cn("flex h-page overflow-hidden", className)}>
        {/* Desktop Sidebar - Compact */}
        <div
          style={{ width: `${sidebarWidth}px` }}
          className="shrink-0 hidden md:block"
        >
          <NotesSidebar
            notes={notes}
            activeNote={activeNote}
            onSelectNote={handleSelectNote}
            onCreateNote={handleCreateNote}
            onDeleteNote={handleDeleteNote}
            onCreateFolder={handleCreateFolder}
            onMoveNote={handleMoveNote}
            onRenameFolder={handleRenameFolder}
            onDeleteFolderNotes={handleDeleteFolderNotes}
            onCopyNote={handleCopyNote}
          />
        </div>

        {/* Main Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile: Show menu button */}
          <div className="flex items-center border-b border-border bg-textured md:hidden h-9">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 m-1"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <Menu className="h-3.5 w-3.5" />
            </Button>
            <MatrxDynamicPanelHost
              open={isMobileSidebarOpen}
              onOpenChange={setIsMobileSidebarOpen}
              title="Notes"
              position="left"
              defaultSize={78}
              contentClassName="flex min-h-0 flex-1 flex-col p-0"
            >
              <NotesSidebar
                notes={notes}
                activeNote={activeNote}
                onSelectNote={(note) => {
                  handleSelectNote(note);
                  setIsMobileSidebarOpen(false);
                }}
                onCreateNote={handleCreateNote}
                onDeleteNote={handleDeleteNote}
                onCreateFolder={handleCreateFolder}
                onMoveNote={handleMoveNote}
                onRenameFolder={handleRenameFolder}
                onDeleteFolderNotes={handleDeleteFolderNotes}
                onCopyNote={handleCopyNote}
              />
            </MatrxDynamicPanelHost>

            {/* Mobile - Show active note title */}
            {activeNote && (
              <div className="flex-1 px-2 text-xs font-medium text-foreground truncate">
                {activeNote.label}
              </div>
            )}
          </div>

          {/* Note Tabs - Desktop only (toolbar integrated) */}
          <NoteTabs
            onCreateNote={handleCreateNote}
            onDeleteNote={handleDeleteNote}
            onCopyNote={handleCopyNote}
            onShareNote={handleShareNote}
            onUpdateNote={handleUpdateNote}
            onSaveNote={handleSaveNote}
            isDirty={isDirty}
            isSaving={isSaving}
          />

          <NoteEditor
            note={editorNote}
            onUpdate={handleUpdateNote}
            allNotes={notes}
            className="flex-1"
            onForceSave={() => {}}
          />
        </div>

        {/* Create Folder Dialog */}
        <CreateFolderDialog
          open={isCreateFolderOpen}
          onOpenChange={setIsCreateFolderOpen}
          onConfirm={handleConfirmCreateFolder}
          existingFolders={existingFolders}
        />

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
    </>
  );
}
