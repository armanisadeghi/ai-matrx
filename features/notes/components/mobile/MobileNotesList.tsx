"use client";

import React, { useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { FolderOpen, Clock, Tag, Plus } from "lucide-react";
import { useNotesRedux } from "../../hooks/useNotesRedux";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
  selectScopeSelectionsContext,
} from "@/lib/redux/slices/appContextSlice";
import { useEntitiesByScopes } from "@/features/scopes/hooks/useEntitiesByScopes";
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
  const { notes, findOrCreateEmptyNote, isLoading } = useNotesRedux();

  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Active context for filtering
  const activeOrgId = useAppSelector(selectOrganizationId);
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
      result = result.filter((n) => n.organization_id === activeOrgId);
    if (scopeFilteredNoteIds)
      result = result.filter((n) => scopeFilteredNoteIds.has(n.id));
    if (activeProjectId)
      result = result.filter((n) => n.project_id === activeProjectId);
    if (activeTaskId) result = result.filter((n) => n.task_id === activeTaskId);
    return result;
  }, [notes, activeOrgId, activeProjectId, activeTaskId]);

  // Filtered + sorted notes
  const filteredNotes = useMemo(() => {
    let result = uniqueNotes;

    if (filters.folder !== "all") {
      result = result.filter(
        (n) => (n.folder_name || "Draft") === filters.folder,
      );
    }

    if (filters.tags.length > 0) {
      result = result.filter((n) =>
        filters.tags.every((tag) => n.tags?.includes(tag)),
      );
    }

    if (filters.sharedOnly) {
      // Canonical sharing lives in the `permissions` table, not on the note
      // row (the legacy `shared_with` column has been dropped). The in-memory
      // notes list carries no permission data, so this filter currently has
      // nothing to match against — sharing surfacing is a follow-up.
      result = [];
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.label.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
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
  }, [uniqueNotes, filters, searchQuery]);

  const handleCreateNote = async () => {
    try {
      const folder = filters.folder === "all" ? "Draft" : filters.folder;
      const note = await findOrCreateEmptyNote(folder);
      if (note) onNoteSelect(note);
    } catch (error) {
      console.error("Error creating note:", error);
    }
  };

  const formatDate = (dateString: string) => {
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
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
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
                onClick={() => onNoteSelect(note)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground mb-0.5 truncate">
                    {note.label || "Untitled Note"}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2 leading-relaxed">
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
