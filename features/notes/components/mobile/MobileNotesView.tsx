"use client";

import { noteDisplayLabel } from "@/features/notes/format";
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
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectNoteContentLoadStatus,
  selectSharedWithMeNotes,
} from "../../redux/selectors";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { fetchNoteContent } from "../../redux/thunks";
import { useNoteAccess } from "../../hooks/useNoteAccess";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";
import { cn } from "@/lib/utils";
import MobileNotesList from "./MobileNotesList";
import MobileNoteEditor, { type MobileEditorMode } from "./MobileNoteEditor";
import { NoteSyncStatusStrip } from "../NoteSyncStatusStrip";
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
  { mode: "plain", icon: <FileText size={16} />, label: "Edit" },
  { mode: "preview", icon: <Eye size={16} />, label: "Read" },
];

export default function MobileNotesView({
  singleNoteId = null,
}: {
  /** When set, skip the list and open this note in the editor. */
  singleNoteId?: string | null;
} = {}) {
  const { notes } = useNotesRedux();
  const sharedNotes = useAppSelector(selectSharedWithMeNotes);
  const dispatch = useAppDispatch();

  const [currentView, setCurrentView] = useState<MobileView>(
    singleNoteId ? "editor" : "list",
  );
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    singleNoteId,
  );
  const [editorMode, setEditorMode] = useState<MobileEditorMode>("preview");
  // Shared filter state — owned here so header dropdown and list stay in sync
  const [filters, setFilters] =
    useState<NotesFilterState>(DEFAULT_FILTER_STATE);
  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false);
  // Mirror of the editor's dirty/saving state for the header
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Keep embed/single-note mode in sync if the parent swaps the locked id.
  React.useEffect(() => {
    if (!singleNoteId) return;
    setSelectedNoteId(singleNoteId);
    setCurrentView("editor");
    void dispatch(fetchNoteContent(singleNoteId));
  }, [dispatch, singleNoteId]);

  // Unique folder names derived from all notes
  const folderNames = useMemo(() => {
    const seen = new Set<string>();
    notes.forEach((n) => seen.add(n.folder_name || "Draft"));
    return Array.from(seen).sort();
  }, [notes]);

  // Shared-with-me notes are excluded from the owner list — look them up too.
  const selectedNote = selectedNoteId
    ? (notes.find((n) => n.id === selectedNoteId) ??
      sharedNotes.find((n) => n.id === selectedNoteId) ??
      null)
    : null;

  // Header actions that mutate the note (Clean up) hide for viewers.
  const selectedAccess = useNoteAccess(selectedNoteId);
  // A deep-linked note whose read rejected (missing, denied, trashed, fault)
  // renders the canonical gate instead of an empty editor pane.
  const selectedLoadStatus = useAppSelector(
    selectNoteContentLoadStatus(selectedNoteId ?? ""),
  );
  const selectedUnavailable =
    Boolean(selectedNoteId) && !selectedNote && selectedLoadStatus === "error";

  // Shared list rows come from the get_notes_shared_with_me RPC WITHOUT
  // content — fetch the full note (RLS grants the sharee SELECT) before the
  // editor mounts, otherwise it would open on an empty body.
  const selectedNoteReady = Boolean(
    selectedNote &&
    (!selectedNote._sharedWithMe || selectedNote.content != null),
  );

  const handleNoteSelect = (note: Note) => {
    setSelectedNoteId(note.id);
    setCurrentView("editor");
    setIsDirty(false);
    setJustSaved(false);
    // Owner rows already carry content from the list query; only shared rows
    // arrive content-less and need the full fetch.
    if (note.content == null) {
      dispatch(fetchNoteContent(note.id));
    }
  };

  const handleBack = () => {
    setCurrentView("list");
    setSelectedNoteId(null);
    setIsDirty(false);
  };

  // Called from the header save button — delegates to editor via window ref
  const handleSave = useCallback(async () => {
    const editorState = window.__mobileNoteEditorState;
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
    if (currentView !== "editor") return undefined;
    const id = setInterval(() => {
      const editorState = window.__mobileNoteEditorState;
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
              className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted/60 transition-colors text-foreground"
              aria-label="Back to notes"
            >
              <ChevronLeft size={18} />
            </button>

            {/* Title — the header names the record; it takes the free space */}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {noteDisplayLabel(selectedNote)}
            </span>

            {/* View mode — two modes, so one button that switches to the
                other (a two-pill toggle squeezed the title to nothing and
                its pills to 16px targets). */}
            {(() => {
              const next =
                VIEW_MODES.find((m) => m.mode !== editorMode) ?? VIEW_MODES[0];
              return (
                <button
                  type="button"
                  onClick={() => setEditorMode(next.mode)}
                  aria-label={`Switch to ${next.label}`}
                  title={next.label}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {next.icon}
                </button>
              );
            })()}

            {/* Clean up content — mutates the note, so viewers don't get it.
                The reference copy lives in the More sheet (a bookmark glyph
                here read as "bookmark", not "copy reference"). */}
            {!selectedAccess.readOnly && (
              <NoteCleanupButton noteId={selectedNote.id} asTapButton />
            )}

            {/* Save state */}
            <div className="flex-shrink-0 flex items-center relative">
              {isSaving && (
                <Loader2
                  size={14}
                  className="animate-spin text-muted-foreground"
                />
              )}
              {justSaved && !isSaving && (
                <Check size={14} className="text-success" />
              )}
              {isDirty && !isSaving && !justSaved && (
                <>
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning animate-pulse" />
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
      <div className="h-full w-full bg-background overflow-hidden relative">
        {/* List view */}
        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
            currentView === "list" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Same realtime honesty as the desktop sidebar — this is the
              surface the reported user was on (audit N-05). */}
          <NoteSyncStatusStrip />
          <div className="min-h-0 flex-1">
            <MobileNotesList
              onNoteSelect={handleNoteSelect}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </div>
        </div>

        {/* Editor view — split into scrollable content + fixed dock outside transform */}
        <div
          className={`absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out ${
            currentView === "editor" ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {selectedUnavailable && selectedNoteId && (
            <div className="h-full overflow-y-auto">
              <AccessGate
                token="note"
                id={selectedNoteId}
                onRetry={() => void dispatch(fetchNoteContent(selectedNoteId))}
                fallbackHref="/notes"
                fallbackLabel="All notes"
              />
            </div>
          )}
          {selectedNote &&
            (selectedNoteReady ? (
              <MobileNoteEditor
                note={selectedNote}
                editorMode={editorMode}
                onBack={handleBack}
              />
            ) : (
              <div className="flex items-center justify-center h-40">
                <Loader2
                  size={18}
                  className="animate-spin text-muted-foreground"
                />
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
