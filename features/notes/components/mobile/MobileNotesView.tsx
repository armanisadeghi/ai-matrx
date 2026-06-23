"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  ChevronLeft,
  FileText,
  Eye,
  Save,
  Loader2,
  Check,
  FolderOpen,
  Layers,
  ChevronDown,
} from "lucide-react";
import { useNotesRedux } from "../../hooks/useNotesRedux";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeader";
import { cn } from "@/lib/utils";
import MobileNotesList from "./MobileNotesList";
import MobileNoteEditor, { type MobileEditorMode } from "./MobileNoteEditor";
import { NoteReferenceCopyButton } from "../NoteReferenceCopyButton";
import { NoteCleanupButton } from "../cleanup/NoteCleanupButton";
import {
  DEFAULT_FILTER_STATE,
  type NotesFilterState,
} from "./NotesFilterSheet";
import type { Note } from "@/features/notes/types";

type MobileView = "list" | "editor";

const VIEW_MODES: {
  mode: MobileEditorMode;
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: "plain", icon: <FileText size={13} />, label: "Text" },
  { mode: "preview", icon: <Eye size={13} />, label: "Preview" },
];

export default function MobileNotesView() {
  const { notes } = useNotesRedux();

  const [currentView, setCurrentView] = useState<MobileView>("list");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<MobileEditorMode>("plain");
  // Shared filter state — owned here so header dropdown and list stay in sync
  const [filters, setFilters] =
    useState<NotesFilterState>(DEFAULT_FILTER_STATE);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  // Mirror of the editor's dirty/saving state for the header
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Unique folder names derived from all notes
  const folderNames = useMemo(() => {
    const seen = new Set<string>();
    notes.forEach((n) => seen.add(n.folder_name || "Draft"));
    return Array.from(seen).sort();
  }, [notes]);

  const selectedNote = selectedNoteId
    ? (notes.find((n) => n.id === selectedNoteId) ?? null)
    : null;

  const handleNoteSelect = (note: Note) => {
    setSelectedNoteId(note.id);
    setCurrentView("editor");
    setIsDirty(false);
    setJustSaved(false);
  };

  const handleBack = () => {
    setCurrentView("list");
    setSelectedNoteId(null);
    setIsDirty(false);
  };

  // Called from the header save button — delegates to editor via window ref
  const handleSave = useCallback(async () => {
    const editorState = (window as any).__mobileNoteEditorState;
    if (!editorState?.handleSave) return;
    setIsSaving(true);
    try {
      await editorState.handleSave();
      setIsDirty(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Poll editor dirty state every 500ms when in editor view
  React.useEffect(() => {
    if (currentView !== "editor") return;
    const id = setInterval(() => {
      const editorState = (window as any).__mobileNoteEditorState;
      if (editorState) setIsDirty(editorState.isDirty ?? false);
    }, 500);
    return () => clearInterval(id);
  }, [currentView]);

  return (
    <>
      {/* ── List header: "Notes" title + folder quick-filter dropdown ── */}
      {currentView === "list" && (
        <PageSpecificHeader>
          <div className="flex items-center gap-2 h-full w-full">
            {/* Folder quick-filter pill */}
            <div className="relative">
              <button
                onClick={() => setFolderDropdownOpen((v) => !v)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors",
                  filters.folder !== "all"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
              >
                {filters.folder === "all" ? (
                  <Layers size={12} />
                ) : (
                  <FolderOpen size={12} />
                )}
                <span className="max-w-[90px] truncate">
                  {filters.folder === "all" ? "All" : filters.folder}
                </span>
                <ChevronDown
                  size={11}
                  className={cn(
                    "transition-transform",
                    folderDropdownOpen && "rotate-180",
                  )}
                />
              </button>

              {folderDropdownOpen && (
                <>
                  {/* Backdrop to close */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setFolderDropdownOpen(false)}
                  />
                  {/* Dropdown panel */}
                  <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-xl py-1 overflow-hidden">
                    {/* All Notes */}
                    <button
                      onClick={() => {
                        setFilters((f) => ({ ...f, folder: "all" }));
                        setFolderDropdownOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors",
                        filters.folder === "all"
                          ? "text-primary bg-primary/8"
                          : "text-foreground hover:bg-muted/60",
                      )}
                    >
                      <Layers
                        size={14}
                        className="flex-shrink-0 text-muted-foreground"
                      />
                      <span className="flex-1 text-left truncate">
                        All Notes
                      </span>
                      {filters.folder === "all" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                    </button>

                    {folderNames.length > 0 && (
                      <div className="h-px bg-border/40 mx-2 my-0.5" />
                    )}

                    {folderNames.map((folder) => (
                      <button
                        key={folder}
                        onClick={() => {
                          setFilters((f) => ({ ...f, folder }));
                          setFolderDropdownOpen(false);
                        }}
                        className={cn(
                          "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors",
                          filters.folder === folder
                            ? "text-primary bg-primary/8"
                            : "text-foreground hover:bg-muted/60",
                        )}
                      >
                        <FolderOpen
                          size={14}
                          className="flex-shrink-0 text-muted-foreground"
                        />
                        <span className="flex-1 text-left truncate">
                          {folder}
                        </span>
                        {filters.folder === folder && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </PageSpecificHeader>
      )}

      {/* ── Editor header: back + title + view toggle + save ── */}
      {currentView === "editor" && selectedNote && (
        <PageSpecificHeader>
          <div className="flex items-center gap-1.5 h-full w-full">
            {/* Back */}
            <button
              onClick={handleBack}
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/60 transition-colors text-foreground"
              aria-label="Back to notes"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Title — truncated, small */}
            <span className="text-xs font-medium text-muted-foreground truncate min-w-0 flex-1 max-w-[100px]">
              {selectedNote.label || "Untitled Note"}
            </span>

            {/* View mode toggle — 3 pill buttons */}
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 mx-1">
              {VIEW_MODES.map(({ mode, icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setEditorMode(mode)}
                  title={label}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all",
                    editorMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {icon}
                  <span className="hidden xs:inline">{label}</span>
                </button>
              ))}
            </div>

            {/* Clean up content */}
            <NoteCleanupButton
              noteId={selectedNote.id}
              triggerClassName="flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/60 transition-colors text-muted-foreground [&_svg]:w-3.5 [&_svg]:h-3.5"
              triggerActiveClassName="bg-muted/60 text-foreground"
            />

            {/* Copy reference */}
            <NoteReferenceCopyButton
              noteId={selectedNote.id}
              label={selectedNote.label}
              size="sm"
              className="h-7 w-7"
            />

            {/* Save state */}
            <div className="flex-shrink-0 flex items-center relative">
              {isSaving && (
                <Loader2
                  size={14}
                  className="animate-spin text-muted-foreground"
                />
              )}
              {justSaved && !isSaving && (
                <Check size={14} className="text-green-500" />
              )}
              {isDirty && !isSaving && !justSaved && (
                <>
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  <button
                    onClick={handleSave}
                    className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/60 transition-colors text-primary"
                    aria-label="Save"
                  >
                    <Save size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        </PageSpecificHeader>
      )}

      {/* ── Page container ── */}
      <div className="h-[calc(100dvh-var(--header-height))] w-full bg-background overflow-hidden relative">
        {/* List view */}
        <div
          className={`absolute inset-0 transition-transform duration-300 ease-in-out ${
            currentView === "list" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <MobileNotesList
            onNoteSelect={handleNoteSelect}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Editor view — split into scrollable content + fixed dock outside transform */}
        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
            currentView === "editor" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedNote && (
            <MobileNoteEditor
              note={selectedNote}
              editorMode={editorMode}
              onBack={handleBack}
            />
          )}
        </div>
      </div>
    </>
  );
}
