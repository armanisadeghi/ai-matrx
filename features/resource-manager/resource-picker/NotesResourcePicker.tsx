"use client";

import React, { useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import { ChevronRight, Search, Loader2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNotes } from "@/features/notes/hooks/useNotes";
import {
  getFolderIconAndColor,
  getAllFolders,
} from "@/features/notes/utils/folderUtils";
import type { Note } from "@/features/notes/types";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface NotesResourcePickerProps {
  onBack: () => void;
  onSelect: (note: Note) => void;
}

export function NotesResourcePicker({
  onBack,
  onSelect,
}: NotesResourcePickerProps) {
  const { notes, isLoading } = useNotes();
  const searchInputRef = usePickerInputFocus();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Count notes per folder
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notes.forEach((note) => {
      const folderName = note.folder_name;
      if (folderName == null) return;
      counts[folderName] = (counts[folderName] || 0) + 1;
    });
    return counts;
  }, [notes]);

  // Get all folders (excluding empty ones)
  const folders = useMemo(() => {
    const allFolders = getAllFolders(notes);
    return allFolders.filter((folder) => folderCounts[folder] > 0);
  }, [notes, folderCounts]);

  // Get notes for selected folder
  const folderNotes = useMemo(() => {
    if (!selectedFolder) return [];
    return notes.filter((note) => note.folder_name === selectedFolder);
  }, [notes, selectedFolder]);

  const isSearching = searchQuery.trim().length > 0;

  const noteMatchesQuery = (note: Note, query: string) =>
    note.label.toLowerCase().includes(query) ||
    (note.content ?? "").toLowerCase().includes(query) ||
    idMatchesQuery(note, query);

  // Filter notes/folders by search
  const filteredFolders = useMemo(() => {
    if (!isSearching) return folders;
    const query = searchQuery.toLowerCase();
    return folders.filter(
      (folder) =>
        folder.toLowerCase().includes(query) ||
        notes.some(
          (note) =>
            note.folder_name === folder && noteMatchesQuery(note, query),
        ),
    );
  }, [folders, notes, searchQuery, isSearching]);

  const searchMatchedNotes = useMemo(() => {
    if (!isSearching) return [];
    const query = searchQuery.toLowerCase();
    return notes.filter((note) => noteMatchesQuery(note, query));
  }, [notes, searchQuery, isSearching]);

  // Reset expanded note when folder or search changes
  React.useEffect(() => {
    setExpandedNoteId(null);
  }, [selectedFolder, searchQuery]);

  const filteredNotes = useMemo(() => {
    if (!isSearching) return folderNotes;
    const query = searchQuery.toLowerCase();
    return folderNotes.filter((note) => noteMatchesQuery(note, query));
  }, [folderNotes, searchQuery, isSearching]);

  return (
    <div className="flex flex-col max-h-[460px]">
      <ResourcePickerSubViewHeader
        title={selectedFolder || "Notes"}
        onBack={selectedFolder ? () => setSelectedFolder(null) : onBack}
      />

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7 pr-2 bg-background border-border"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : selectedFolder ? (
          // Show notes in folder
          <div className="p-1">
            {filteredNotes.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                {searchQuery ? "No notes found" : "No notes in this folder"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredNotes.map((note) => {
                  const isExpanded = expandedNoteId === note.id;

                  return (
                    <div
                      key={note.id}
                      className="rounded overflow-hidden border border-transparent hover:border-border transition-all"
                    >
                      <div className="flex items-start gap-2 px-2 py-1.5">
                        {/* Main clickable area - selects the note */}
                        <button
                          onClick={() => onSelect(note)}
                          className="flex-1 text-left hover:bg-muted/60 transition-colors rounded px-1 py-0.5 -mx-1 -my-0.5 min-w-0"
                        >
                          <div className="text-xs font-medium text-foreground truncate mb-0.5">
                            {note.label}
                          </div>
                          {!isExpanded && (
                            <>
                              <div className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                                {note.content || "Empty note"}
                              </div>
                              {note.tags && note.tags.length > 0 && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {note.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </button>

                        {/* Chevron - toggles expansion */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedNoteId(isExpanded ? null : note.id);
                          }}
                          className="flex-shrink-0 p-1 -mr-1 hover:bg-muted/60 rounded transition-colors"
                          title={isExpanded ? "Hide details" : "Show details"}
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-2 bg-background/50">
                          <div className="max-h-32 overflow-y-auto scrollbar-thin rounded bg-background p-2 border-border">
                            <div className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                              {note.content || "Empty note"}
                            </div>
                          </div>

                          {note.tags && note.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {note.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : isSearching ? (
          // Search: matching folders + matching notes (flat)
          <div className="p-1 space-y-2">
            {filteredFolders.length === 0 && searchMatchedNotes.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                No results found
              </div>
            ) : (
              <>
                {filteredFolders.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Folders
                    </div>
                    {filteredFolders.map((folder) => {
                      const { icon: Icon, color } =
                        getFolderIconAndColor(folder);
                      const count = folderCounts[folder] || 0;

                      return (
                        <button
                          key={folder}
                          onClick={() => setSelectedFolder(folder)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors group"
                        >
                          <Icon
                            className="w-4 h-4 flex-shrink-0"
                            style={{ color: color || undefined }}
                          />
                          <span className="flex-1 text-xs font-medium text-foreground text-left truncate">
                            {folder}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {count}
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {searchMatchedNotes.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      Notes
                    </div>
                    {searchMatchedNotes.map((note) => {
                      const isExpanded = expandedNoteId === note.id;

                      return (
                        <div
                          key={note.id}
                          className="rounded overflow-hidden border border-transparent hover:border-border transition-all"
                        >
                          <div className="flex items-start gap-2 px-2 py-1.5">
                            <button
                              onClick={() => onSelect(note)}
                              className="flex-1 text-left hover:bg-muted/60 transition-colors rounded px-1 py-0.5 -mx-1 -my-0.5 min-w-0"
                            >
                              <div className="text-xs font-medium text-foreground truncate mb-0.5">
                                {note.label}
                              </div>
                              {!isExpanded && (
                                <>
                                  <div className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                                    {note.content || "Empty note"}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                                    {note.folder_name}
                                  </div>
                                </>
                              )}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedNoteId(isExpanded ? null : note.id);
                              }}
                              className="flex-shrink-0 p-1 -mr-1 hover:bg-muted/60 rounded transition-colors"
                              title={
                                isExpanded ? "Hide details" : "Show details"
                              }
                            >
                              <ChevronDown
                                className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                              />
                            </button>
                          </div>

                          {isExpanded && (
                            <div className="px-2 pb-2 space-y-2 bg-background/50">
                              <div className="max-h-32 overflow-y-auto scrollbar-thin rounded bg-background p-2 border-border">
                                <div className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                                  {note.content || "Empty note"}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          // Browse folders
          <div className="p-1">
            {filteredFolders.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">
                No folders found
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredFolders.map((folder) => {
                  const { icon: Icon, color } = getFolderIconAndColor(folder);
                  const count = folderCounts[folder] || 0;

                  return (
                    <button
                      key={folder}
                      onClick={() => setSelectedFolder(folder)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors group"
                    >
                      <Icon
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: color || undefined }}
                      />
                      <span className="flex-1 text-xs font-medium text-foreground text-left truncate">
                        {folder}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {count}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
