"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  FileText,
  Plus,
  FolderPlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotesRedux } from "../hooks/useNotesRedux";
import { useAllFolders, getFolderIconAndColor } from "../utils/folderUtils";
import { NotesAPI } from "../service/notesApi";
import type { Note } from "../types";

export interface NotesTreeViewProps {
  onSelectNote?: (note: Note) => void;
  onSelectFolder?: (folderName: string) => void;
  activeNoteId?: string | null;
  className?: string;
}

export function NotesTreeView({
  onSelectNote,
  onSelectFolder,
  activeNoteId,
  className,
}: NotesTreeViewProps) {
  const { notes, isLoading, findOrCreateEmptyNote } = useNotesRedux();
  const allFolders = useAllFolders(notes);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [creatingNoteIn, setCreatingNoteIn] = useState<string | null>(null);
  const [newNoteLabel, setNewNoteLabel] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const noteInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const notesByFolder = useMemo(() => {
    const grouped: Record<string, Note[]> = {};
    for (const folder of allFolders) {
      grouped[folder] = [];
    }
    for (const note of notes) {
      const folder = note.folder_name || "Draft";
      (grouped[folder] ??= []).push(note);
    }
    for (const folder of Object.keys(grouped)) {
      grouped[folder].sort((a, b) => {
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    return grouped;
  }, [notes, allFolders]);

  // Auto-expand the folder containing the active note
  useEffect(() => {
    if (!activeNoteId) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (note && note.folder_name !== expandedFolder) {
      setExpandedFolder(note.folder_name);
    }
  }, [activeNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleFolder = useCallback(
    (folder: string) => {
      const next = expandedFolder === folder ? null : folder;
      setExpandedFolder(next);
      if (next) onSelectFolder?.(next);
      setCreatingNoteIn(null);
    },
    [expandedFolder, onSelectFolder],
  );

  const handleNoteClick = useCallback(
    (note: Note) => {
      onSelectNote?.(note);
    },
    [onSelectNote],
  );

  // Inline note creation
  const handleStartCreateNote = useCallback(
    (folder: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setCreatingNoteIn(folder);
      setNewNoteLabel("");
      setTimeout(() => noteInputRef.current?.focus(), 30);
    },
    [],
  );

  const handleConfirmCreateNote = useCallback(
    async (folder: string) => {
      const label = newNoteLabel.trim();
      if (!label) {
        setCreatingNoteIn(null);
        return;
      }
      setBusyAction(`note-${folder}`);
      try {
        const note = await NotesAPI.create({
          label,
          content: "",
          folder_name: folder,
        });
        onSelectNote?.(note);
      } catch {
        // ignored
      } finally {
        setBusyAction(null);
        setCreatingNoteIn(null);
        setNewNoteLabel("");
      }
    },
    [newNoteLabel, onSelectNote],
  );

  const handleNoteInputKeyDown = useCallback(
    (e: React.KeyboardEvent, folder: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmCreateNote(folder);
      } else if (e.key === "Escape") {
        setCreatingNoteIn(null);
      }
    },
    [handleConfirmCreateNote],
  );

  // Inline folder creation
  const handleStartCreateFolder = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCreatingFolder(true);
    setNewFolderName("");
    setTimeout(() => folderInputRef.current?.focus(), 30);
  }, []);

  const handleConfirmCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) {
      setCreatingFolder(false);
      return;
    }
    setBusyAction("folder");
    try {
      await NotesAPI.ensureFolderMaterialized(name);
      const note = await findOrCreateEmptyNote(name);
      setExpandedFolder(name);
      onSelectNote?.(note);
    } catch {
      // ignored
    } finally {
      setBusyAction(null);
      setCreatingFolder(false);
      setNewFolderName("");
    }
  }, [newFolderName, findOrCreateEmptyNote, onSelectNote]);

  const handleFolderInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleConfirmCreateFolder();
      } else if (e.key === "Escape") {
        setCreatingFolder(false);
      }
    },
    [handleConfirmCreateFolder],
  );

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-4", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col text-xs select-none overflow-auto",
        className,
      )}
    >
      {allFolders.map((folder) => {
        const isExpanded = expandedFolder === folder;
        const folderNotes = notesByFolder[folder] ?? [];
        const { icon: FolderIcon, color: folderColor } =
          getFolderIconAndColor(folder);

        return (
          <div key={folder}>
            {/* ── Folder row ──────────────────────── */}
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 w-full px-1.5 py-[3px] hover:bg-accent/50 transition-colors",
                isExpanded && "bg-accent/30",
              )}
              onClick={() => handleToggleFolder(folder)}
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 shrink-0 transition-transform duration-150",
                  isExpanded && "rotate-90",
                )}
              />
              <FolderIcon className={cn("h-3 w-3 shrink-0", folderColor)} />
              <span className="truncate font-medium">{folder}</span>
              <span className="ml-auto text-[9px] text-muted-foreground/50 tabular-nums pr-0.5">
                {folderNotes.length}
              </span>
            </button>

            {/* ── Notes list ──────────────────────── */}
            {isExpanded && (
              <div>
                {folderNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    className={cn(
                      "flex items-center gap-1 w-full pl-5 pr-1.5 py-[3px] hover:bg-accent/40 transition-colors",
                      note.id === activeNoteId && "bg-primary/10 text-primary",
                    )}
                    onClick={() => handleNoteClick(note)}
                  >
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{note.label || "New Note"}</span>
                  </button>
                ))}

                {/* ── Inline create note ────────── */}
                {creatingNoteIn === folder ? (
                  <div className="flex items-center gap-1 pl-5 pr-1.5 py-[2px]">
                    <FileText className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                    <input
                      ref={noteInputRef}
                      type="text"
                      value={newNoteLabel}
                      onChange={(e) => setNewNoteLabel(e.target.value)}
                      onKeyDown={(e) => handleNoteInputKeyDown(e, folder)}
                      onBlur={() => handleConfirmCreateNote(folder)}
                      placeholder="Note name..."
                      className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/40 border-b border-primary/40"
                      style={{ fontSize: "16px" }}
                      disabled={busyAction === `note-${folder}`}
                    />
                    {busyAction === `note-${folder}` && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex items-center gap-1 w-full pl-5 pr-1.5 py-[3px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/30 transition-colors"
                    onClick={(e) => handleStartCreateNote(folder, e)}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="text-[10px]">New note</span>
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Inline create folder ────────────────────────── */}
      <div className="mt-0.5 border-t border-border/30">
        {creatingFolder ? (
          <div className="flex items-center gap-1 px-1.5 py-[3px]">
            <FolderPlus className="h-3 w-3 shrink-0 text-muted-foreground/40" />
            <input
              ref={folderInputRef}
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={handleFolderInputKeyDown}
              onBlur={handleConfirmCreateFolder}
              placeholder="Folder name..."
              className="flex-1 min-w-0 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground/40 border-b border-primary/40"
              style={{ fontSize: "16px" }}
              disabled={busyAction === "folder"}
            />
            {busyAction === "folder" && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 w-full px-1.5 py-[3px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/30 transition-colors"
            onClick={handleStartCreateFolder}
          >
            <FolderPlus className="h-3 w-3 shrink-0" />
            <span className="text-[10px]">New folder</span>
          </button>
        )}
      </div>
    </div>
  );
}
