"use client";

import { noteDisplayLabel } from "@/features/notes/format";
import React, { useState, useCallback, useMemo } from "react";
import {
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
  selectNoteById,
  selectNoteContentLoadStatus,
  selectSharedWithMeNotes,
} from "../../redux/selectors";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { fetchNoteContent } from "../../redux/thunks";
import { useNoteAccess } from "../../hooks/useNoteAccess";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import { HeaderActionsSlot } from "@/features/shell/components/header/HeaderActionsSlot";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { cn } from "@/lib/utils";
import MobileNotesList from "./MobileNotesList";
import MobileNoteEditor, { type MobileEditorMode } from "./MobileNoteEditor";
import { NOTE_PHONE_VIEW_MODES } from "../NoteViewControls";
import {
  DEFAULT_PHONE_EDITOR_MODE_SETTING,
  useNoteEditorMode,
  type PhoneNoteMode,
} from "../../hooks/usePreferredDefaultEditorMode";
import { setNoteEditorMode } from "../../redux/slice";
import { useSetting } from "@/features/settings/hooks/useSetting";

import { NoteSyncStatusStrip } from "../NoteSyncStatusStrip";
import { NoteCleanupButton } from "../cleanup/NoteCleanupButton";
import {
  DEFAULT_FILTER_STATE,
  type NotesFilterState,
} from "./NotesFilterSheet";
import type { Note } from "@/features/notes/types";

type MobileView = "list" | "editor";


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
  // The phone's modes, by the same rule as desktop: this note's session pick →
  // the mode it was last typed in (Write stays Write) → the person's phone
  // default (Plain).
  const resolvedMode = useNoteEditorMode(selectedNoteId, "phone");
  const editorMode: MobileEditorMode = resolvedMode === "write" ? "write" : "plain";
  const [, savePhoneDefaultMode] = useSetting<PhoneNoteMode>(DEFAULT_PHONE_EDITOR_MODE_SETTING);
  const setEditorMode = (mode: PhoneNoteMode) => {
    if (selectedNoteId) dispatch(setNoteEditorMode({ id: selectedNoteId, mode }));
    savePhoneDefaultMode(mode);
  };
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
  const selectedLoadStatus = useAppSelector(
    selectNoteContentLoadStatus(selectedNoteId ?? ""),
  );

  // List rows (owned AND shared) carry a preview, never the body (audit
  // N-24) — fetch the full note before the editor mounts. An editor mounted
  // on "" lets a keystroke in the fetch window replace the whole note on save.
  // A new unsaved note is created "full" (it is empty), so it opens at once.
  const selectedRecord = useAppSelector(selectNoteById(selectedNoteId ?? ""));
  const selectedNoteReady = Boolean(
    selectedNote && selectedRecord?._fetchStatus === "full",
  );
  // A note whose read rejected (missing, denied, trashed, fault) renders the
  // canonical gate instead of an empty editor pane or an endless spinner.
  const selectedUnavailable =
    Boolean(selectedNoteId) && !selectedNoteReady && selectedLoadStatus === "error";

  const handleNoteSelect = (note: Note) => {
    setSelectedNoteId(note.id);
    setCurrentView("editor");
    setIsDirty(false);
    setJustSaved(false);
    // No-op when the body is already loaded (fetchNoteContent checks).
    dispatch(fetchNoteContent(note.id));
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
        <PageHeader>
          <div className="flex items-center gap-2 h-full w-full">
            <FolderFilterPill
              folder={filters.folder}
              folderNames={folderNames}
              open={folderDropdownOpen}
              setOpen={setFolderDropdownOpen}
              onPick={(folder) => setFilters((f) => ({ ...f, folder }))}
            />
          </div>
        </PageHeader>
      )}

      {/* ── Editor header: back + title + view toggle + save ── */}
      {currentView === "editor" && selectedNote && (
        <PageHeader>
          <div className="flex items-center gap-1.5 h-full w-full">
            {/* Back */}
            <ChevronLeftTapButton onClick={handleBack} ariaLabel="Back to notes" />

            {/* Title — the header names the record; it takes the free space */}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {noteDisplayLabel(selectedNote)}
            </span>

            {/* The record's actions live in the shell's ⋮ sheet ("This page"),
                so the title keeps the row — one overflow per phone header
                (page-pass shared defects, 2026-09-27). */}
            {/* The view switch: a segmented Plain | Write showing the CURRENT
                view highlighted (a single button naming the other view read
                like the current state). 44px on touch; short labels leave the
                title its room. */}
            <div
              role="radiogroup"
              aria-label="Note view"
              className="flex flex-shrink-0 items-center rounded-full bg-muted p-0.5"
            >
              {NOTE_PHONE_VIEW_MODES.map(({ mode, label, hint }) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={editorMode === mode}
                  title={hint}
                  onClick={() => setEditorMode(mode)}
                  className={cn(
                    "h-8 rounded-full px-2.5 text-xs font-medium transition-colors pointer-coarse:h-10",
                    editorMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <PageHeaderRightPortal>
              {/* Clean up content — mutates the note, so viewers don't get it.
                  The reference copy lives in the More sheet (a bookmark glyph
                  here read as "bookmark", not "copy reference"). */}
              {!selectedAccess.readOnly && (
                <NoteCleanupButton noteId={selectedNote.id} asTapButton />
              )}

            </PageHeaderRightPortal>

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
                  <HeaderActionsSlot>
                    <button
                      onClick={handleSave}
                      className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-muted/60 transition-colors text-primary"
                      aria-label="Save"
                    >
                      <Save size={14} />
                    </button>
                  </HeaderActionsSlot>
                </>
              )}
            </div>
          </div>
        </PageHeader>
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
            !selectedUnavailable &&
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

/**
 * The notes list's header control — the folder it is showing, and the switch
 * to another. It is the header's identity (a selector, like a record-name
 * dropdown), not an action, so it keeps the row on a phone.
 */
function FolderFilterPill({
  folder,
  folderNames,
  open,
  setOpen,
  onPick,
}: {
  folder: string;
  folderNames: string[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onPick: (folder: string) => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors",
          folder !== "all"
            ? "bg-primary/15 text-primary"
            : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted",
        )}
      >
        {folder === "all" ? (
          <Layers size={12} />
        ) : (
          <FolderOpen size={12} />
        )}
        <span className="max-w-[90px] truncate">
          {folder === "all" ? "All" : folder}
        </span>
        <ChevronDown
          size={11}
          className={cn(
            "transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          {/* Backdrop to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Dropdown panel */}
          <div className="absolute left-0 top-full mt-1.5 z-50 min-w-[160px] rounded-xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-xl py-1 overflow-hidden">
            {/* All Notes */}
            <button
              onClick={() => {
                onPick("all");
                setOpen(false);
              }}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors",
                folder === "all"
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
              {folder === "all" && (
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
                  onPick(folder);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm transition-colors",
                  folder === folder
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
                {folder === folder && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
