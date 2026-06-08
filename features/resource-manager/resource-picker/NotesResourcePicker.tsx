"use client";

import React, { useState, useMemo } from "react";
import { idMatchesQuery } from "@/utils/search-scoring";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNotes } from "@/features/notes/hooks/useNotes";
import {
  getFolderIconAndColor,
  getAllFolders,
} from "@/features/notes/utils/folderUtils";
import type { Note } from "@/features/notes/types";

interface NotesResourcePickerProps {
  onBack: () => void;
  onSelect: (note: Note) => void;
}

export function NotesResourcePicker({
  onBack,
  onSelect,
}: NotesResourcePickerProps) {
  const { notes, isLoading } = useNotes();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  // Count notes per folder
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    notes.forEach((note) => {
      counts[note.folder_name] = (counts[note.folder_name] || 0) + 1;
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

  // Filter notes/folders by search
  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) return folders;
    const query = searchQuery.toLowerCase();
    return folders.filter(
      (folder) =>
        folder.toLowerCase().includes(query) ||
        notes.some(
          (note) =>
            note.folder_name === folder &&
            (note.label.toLowerCase().includes(query) ||
              note.content.toLowerCase().includes(query) ||
              idMatchesQuery(note, query)),
        ),
    );
  }, [folders, notes, searchQuery]);

  // Reset expanded note when folder or search changes
  React.useEffect(() => {
    setExpandedNoteId(null);
  }, [selectedFolder, searchQuery]);

  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return folderNotes;
    const query = searchQuery.toLowerCase();
    return folderNotes.filter(
      (note) =>
        note.label.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        idMatchesQuery(note, query),
    );
  }, [folderNotes, searchQuery]);

  return (
    <div className="flex flex-col max-h-[460px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 flex-shrink-0"
          onClick={selectedFolder ? () => setSelectedFolder(null) : onBack}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
          {selectedFolder || "Notes"}
        </span>
      </div>

      {/* Search */}
      <div className="px-2 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-xs pl-7 pr-2 bg-background border-gray-300 dark:border-gray-700"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : selectedFolder ? (
          // Show notes in folder
          <div className="p-1">
            {filteredNotes.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
                {searchQuery ? "No notes found" : "No notes in this folder"}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredNotes.map((note) => {
                  const isExpanded = expandedNoteId === note.id;

                  return (
                    <div
                      key={note.id}
                      className="rounded overflow-hidden border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all"
                    >
                      <div className="flex items-start gap-2 px-2 py-2">
                        {/* Main clickable area - selects the note */}
                        <button
                          onClick={() => onSelect(note)}
                          className="flex-1 text-left hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors rounded px-1 py-0.5 -mx-1 -my-0.5 min-w-0"
                        >
                          <div className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate mb-0.5">
                            {note.label}
                          </div>
                          {!isExpanded && (
                            <>
                              <div className="text-[10px] text-gray-500 dark:text-gray-400 line-clamp-2 leading-tight">
                                {note.content || "Empty note"}
                              </div>
                              {note.tags && note.tags.length > 0 && (
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {note.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-400"
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
                          className="flex-shrink-0 p-1 -mr-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded transition-colors"
                          title={isExpanded ? "Hide details" : "Show details"}
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="px-2 pb-2 space-y-2 bg-background/50">
                          <div className="max-h-32 overflow-y-auto scrollbar-thin rounded bg-white dark:bg-zinc-900 p-2 border-border">
                            <div className="text-[11px] text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                              {note.content || "Empty note"}
                            </div>
                          </div>

                          {note.tags && note.tags.length > 0 && (
                            <div className="flex gap-1 flex-wrap">
                              {note.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-gray-400"
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
        ) : (
          // Show folders
          <div className="p-1">
            {filteredFolders.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-8">
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
                      className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors group"
                    >
                      <Icon
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: color || undefined }}
                      />
                      <span className="flex-1 text-xs font-medium text-gray-900 dark:text-gray-100 text-left truncate">
                        {folder}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {count}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 flex-shrink-0" />
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
