"use client";

import React, { useRef, useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  FolderOpen,
  Clock,
  Tag,
  Plus,
  Users,
  ChevronDown,
  Eye,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useNotesRedux } from "../../hooks/useNotesRedux";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectDeletedNotesList,
  selectSharedWithMeNotes,
} from "../../redux/selectors";
import {
  fetchDeletedNotes,
  restoreNote,
  permanentlyDeleteNoteThunk,
  emptyTrashThunk,
} from "../../redux/thunks";
import {
  selectOrganizationId,
  selectPersonalOrganizationId,
  selectProjectId,
  selectTaskId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { useEntitiesByScopes } from "@/features/scopes/hooks/useEntitiesByScopes";
import { noteMatchesActiveOrgContext } from "../../utils/noteUtils";
import { MobileActionBar } from "@/components/official/mobile-action-bar/MobileActionBar";
import NotesFilterSheet, { NotesFilterState } from "./NotesFilterSheet";
import type { Note } from "@/features/notes/types";

interface MobileNotesListProps {
  onNoteSelect: (note: Note) => void;
  filters: NotesFilterState;
  onFiltersChange: (filters: NotesFilterState) => void;
}

export default function MobileNotesList({
  onNoteSelect,
  filters,
  onFiltersChange,
}: MobileNotesListProps) {
  const dispatch = useAppDispatch();
  const { notes, findOrCreateEmptyNote, isLoading } = useNotesRedux();
  const sharedNotes = useAppSelector(selectSharedWithMeNotes);
  const deletedNotes = useAppSelector(selectDeletedNotesList);

  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(true);
  const [trashOpen, setTrashOpen] = useState(false);
  const trashFetchedRef = useRef(false);

  // Active context for filtering
  const activeOrgId = useAppSelector(selectOrganizationId);
  const personalOrgId = useAppSelector(selectPersonalOrganizationId);
  const activeProjectId = useAppSelector(selectProjectId);
  const activeTaskId = useAppSelector(selectTaskId);
  const scopeSelections = useAppSelector(selectScopeSelectionsContext);

  // Scope-filtered note IDs
  const activeScopeIds = useMemo(
    () => Object.values(scopeSelections).filter(Boolean) as string[],
    [scopeSelections],
  );
  const { entityIds: scopeFilteredNoteIds } = useEntitiesByScopes({
    scopeIds: activeScopeIds,
    entityType: "note",
    matchAll: false,
  });

  // Deduplicated + context-filtered notes
  const uniqueNotes = useMemo(() => {
    const seen = new Set<string>();
    let result = notes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
    if (activeOrgId)
      result = result.filter((n) =>
        noteMatchesActiveOrgContext(n, activeOrgId, personalOrgId),
      );
    if (scopeFilteredNoteIds)
      result = result.filter((n) => scopeFilteredNoteIds.has(n.id));
    if (activeProjectId)
      result = result.filter((n) => n.project_id === activeProjectId);
    if (activeTaskId) result = result.filter((n) => n.task_id === activeTaskId);
    return result;
  }, [
    notes,
    activeOrgId,
    personalOrgId,
    scopeFilteredNoteIds,
    activeProjectId,
    activeTaskId,
  ]);

  // Filtered + sorted notes. "Shared only" swaps the base list to the notes
  // shared WITH me (from get_notes_shared_with_me) — those are cross-org, so
  // the active-context org/project filters don't apply to them.
  const filteredNotes = useMemo(() => {
    let result = filters.sharedOnly ? sharedNotes : uniqueNotes;

    // Shared rows carry the OWNER's folder_name and the folder picker only
    // lists MY folders — combining them would reliably show "no notes match"
    // with no hint why. Folder filtering applies to owned notes only.
    if (!filters.sharedOnly && filters.folder !== "all") {
      result = result.filter(
        (n) => (n.folder_name || "Draft") === filters.folder,
      );
    }

    if (filters.tags.length > 0) {
      result = result.filter((n) =>
        filters.tags.every((tag) => n.tags?.includes(tag)),
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          (n.content ?? "").toLowerCase().includes(q) ||
          n.tags?.some((t) => t.toLowerCase().includes(q)) ||
          idMatchesQuery(n, q),
      );
    }

    return result.sort((a, b) => {
      const aVal = a[filters.sortField] ?? "";
      const bVal = b[filters.sortField] ?? "";
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return filters.sortOrder === "asc" ? cmp : -cmp;
    });
  }, [uniqueNotes, sharedNotes, filters, searchQuery]);

  const handleCreateNote = async () => {
    try {
      const folder = filters.folder === "all" ? "Draft" : filters.folder;
      const note = await findOrCreateEmptyNote(folder);
      if (note) onNoteSelect(note);
    } catch (error) {
      console.error("Error creating note:", error);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffHrs = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    if (diffHrs < 24)
      return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
    if (diffHrs < 168)
      return date.toLocaleDateString("en-US", { weekday: "short" });
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getPreviewText = (content: string | null | undefined) => {
    const stripped = (content ?? "").replace(/[#*_~`]/g, "").trim();
    return stripped.split("\n")[0] || "No content";
  };

  const isFiltered =
    filters.folder !== "all" ||
    filters.tags.length > 0 ||
    filters.sharedOnly ||
    filters.sortField !== "updated_at" ||
    filters.sortOrder !== "desc";

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Notes List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Shared with me — top virtual section (mirrors desktop sidebar) */}
            {!filters.sharedOnly && sharedNotes.length > 0 && (
              <div className="border-b border-border/40">
                <button
                  type="button"
                  onClick={() => setSharedOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors active:bg-muted/40"
                >
                  <Users
                    className="text-indigo-500 dark:text-indigo-400"
                    size={12}
                  />
                  <span>Shared with me</span>
                  <span className="rounded-full bg-muted px-1.5 text-[10px]">
                    {sharedNotes.length}
                  </span>
                  <ChevronDown
                    size={12}
                    className={cn(
                      "ml-auto transition-transform",
                      sharedOpen && "rotate-180",
                    )}
                  />
                </button>
                {sharedOpen && (
                  <div className="divide-y divide-border/50">
                    {sharedNotes.map((note) => {
                      const level =
                        note._sharedMeta?.permissionLevel ?? "viewer";
                      const canEdit = level === "editor" || level === "admin";
                      return (
                        <button
                          key={note.id}
                          type="button"
                          onClick={() => onNoteSelect(note)}
                          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/40"
                        >
                          <div className="min-w-0 flex-1">
                            <h3 className="mb-0.5 truncate text-sm font-semibold text-foreground">
                              {note.label || "Untitled Note"}
                            </h3>
                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock size={10} />
                                <span>{formatDate(note.updated_at)}</span>
                              </div>
                              {note._sharedMeta?.ownerEmail && (
                                <span className="max-w-[140px] truncate">
                                  {note._sharedMeta.ownerEmail}
                                </span>
                              )}
                              <div className="ml-auto flex shrink-0 items-center gap-1">
                                {canEdit ? (
                                  <>
                                    <Pencil
                                      size={10}
                                      className="text-emerald-500"
                                    />
                                    <span>Can edit</span>
                                  </>
                                ) : (
                                  <>
                                    <Eye size={10} className="text-sky-500" />
                                    <span>View only</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {filteredNotes.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                <p className="text-sm">
                  {searchQuery || isFiltered
                    ? "No notes match your filters"
                    : "No notes yet — tap + to create one"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredNotes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onNoteSelect(note)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-0.5 truncate text-sm font-semibold text-foreground">
                        {note.label || "Untitled Note"}
                      </h3>
                      <p className="mb-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {getPreviewText(note.content)}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock size={10} />
                          <span>{formatDate(note.updated_at)}</span>
                        </div>
                        {filters.folder === "all" && note.folder_name && (
                          <div className="flex items-center gap-1">
                            <FolderOpen size={10} />
                            <span>{note.folder_name}</span>
                          </div>
                        )}
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            <Tag size={10} />
                            <span>
                              {note.tags.slice(0, 2).join(", ")}
                              {note.tags.length > 2
                                ? ` +${note.tags.length - 2}`
                                : ""}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Trash — soft-delete recovery (mirrors desktop NoteSidebar) */}
            {!filters.sharedOnly && (
              <div className="border-t border-border/40">
                <button
                  type="button"
                  onClick={() => {
                    setTrashOpen((v) => !v);
                    if (!trashFetchedRef.current) {
                      trashFetchedRef.current = true;
                      dispatch(fetchDeletedNotes());
                    }
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors active:bg-muted/40"
                >
                  <Trash2
                    className="text-rose-500 dark:text-rose-400"
                    size={12}
                  />
                  <span>Trash</span>
                  {deletedNotes.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px]">
                      {deletedNotes.length}
                    </span>
                  )}
                  <ChevronDown
                    size={12}
                    className={cn(
                      "ml-auto transition-transform",
                      trashOpen && "rotate-180",
                    )}
                  />
                </button>
                {trashOpen && (
                  <div className="pb-2">
                    {deletedNotes.length === 0 ? (
                      <p className="px-4 py-2 text-xs text-muted-foreground/60">
                        Trash is empty
                      </p>
                    ) : (
                      <>
                        <div className="mb-1 flex justify-end px-4">
                          <button
                            type="button"
                            className="text-[11px] text-destructive/80 active:text-destructive"
                            onClick={async () => {
                              const ok = await confirm({
                                title: "Empty trash",
                                description: `Permanently delete ${deletedNotes.length} note${deletedNotes.length === 1 ? "" : "s"}? This cannot be undone.`,
                                confirmLabel: "Empty trash",
                                variant: "destructive",
                              });
                              if (!ok) return;
                              try {
                                const count =
                                  await dispatch(emptyTrashThunk()).unwrap();
                                toast.success(
                                  count
                                    ? `Emptied trash (${count})`
                                    : "Nothing to delete",
                                );
                              } catch (err) {
                                console.error(err);
                                toast.error("Failed to empty trash");
                              }
                            }}
                          >
                            Empty trash
                          </button>
                        </div>
                        <div className="divide-y divide-border/50">
                          {deletedNotes.map((note) => {
                            const deletedLabel = note.deleted_at
                              ? new Date(note.deleted_at).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" },
                                )
                              : null;
                            return (
                              <div
                                key={note.id}
                                className="flex items-center gap-2 px-4 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm text-muted-foreground">
                                    {note.label || "Untitled"}
                                  </p>
                                  {deletedLabel && (
                                    <p className="text-[10px] text-muted-foreground/50">
                                      Deleted {deletedLabel}
                                    </p>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-muted/40 active:text-foreground"
                                  aria-label="Restore"
                                  onClick={async () => {
                                    try {
                                      await dispatch(
                                        restoreNote(note.id),
                                      ).unwrap();
                                      toast.success("Note restored");
                                    } catch (err) {
                                      console.error(err);
                                      toast.error("Failed to restore note");
                                    }
                                  }}
                                >
                                  <RotateCcw size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-destructive/70 active:bg-destructive/10 active:text-destructive"
                                  aria-label="Delete forever"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Permanently delete",
                                      description: `Permanently delete "${note.label || "Untitled"}"? This cannot be undone.`,
                                      confirmLabel: "Delete forever",
                                      variant: "destructive",
                                    });
                                    if (!ok) return;
                                    try {
                                      await dispatch(
                                        permanentlyDeleteNoteThunk(note.id),
                                      ).unwrap();
                                      toast.success("Note permanently deleted");
                                    } catch (err) {
                                      console.error(err);
                                      toast.error(
                                        "Failed to permanently delete",
                                      );
                                    }
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Spacer so last item clears the floating action bar */}
        <div className="h-24" />
      </div>

      {/* Mobile Action Bar — identical API to Prompts */}
      <MobileActionBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        totalCount={uniqueNotes.length}
        filteredCount={filteredNotes.length}
        onPrimaryAction={handleCreateNote}
        primaryActionLabel="New Note"
        primaryActionIcon={<Plus className="h-5 w-5" />}
        showFilterButton={true}
        showVoiceSearch={true}
        isFilterModalOpen={isFilterOpen}
        setIsFilterModalOpen={setIsFilterOpen}
        searchPlaceholder="Search notes..."
      />

      {/* Notes-specific filter bottom sheet */}
      <NotesFilterSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        notes={uniqueNotes}
        filters={filters}
        filteredCount={filteredNotes.length}
        onApply={onFiltersChange}
      />
    </div>
  );
}
