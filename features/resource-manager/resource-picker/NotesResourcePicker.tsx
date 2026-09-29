"use client";

import React, { useState } from "react";
import { ChevronRight, Search, Loader2, ChevronDown } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { useNotePicker } from "@/features/notes/hooks/useNotePicker";
import { getFolderIconAndColor } from "@/features/notes/utils/folderUtils";
import type { NotePickerRow } from "@/features/notes/service/notesService";
import type { Note } from "@/features/notes/types";
import { toast } from "@/lib/toast";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";
import { ReadFailure } from "@/components/read-state/ReadFailure";

interface NotesResourcePickerProps {
  onBack: () => void;
  /** Receives the WHOLE note (body included), read when it is picked. */
  onSelect: (note: Note) => void;
}

/**
 * The Notes view of the canonical resource picker ("+" → Notes, the Source
 * input's "A note"). Opens on the most recently changed notes (a knob) and the
 * folders with database-counted totals; folders load when opened, search asks
 * the database, and a body is read only when a note is previewed or picked.
 */
export function NotesResourcePicker({ onBack, onSelect }: NotesResourcePickerProps) {
  const searchInputRef = usePickerInputFocus();
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const picker = useNotePicker(searchQuery);

  const isSearching = searchQuery.trim().length > 0;

  const openFolder = (folder: string) => {
    setExpandedNoteId(null);
    setSelectedFolder(folder);
    picker.openFolder(folder);
  };

  const pick = async (row: NotePickerRow) => {
    if (pickingId) return;
    setPickingId(row.id);
    try {
      onSelect(await picker.loadFullNote(row.id));
    } catch (err) {
      toast.error(
        `Could not attach "${row.label}": ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setPickingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedNoteId === id) {
      setExpandedNoteId(null);
      return;
    }
    setExpandedNoteId(id);
    picker.loadBody(id);
  };

  const renderNote = (row: NotePickerRow, showFolder: boolean) => {
    const isExpanded = expandedNoteId === row.id;
    const body = picker.body(row.id);
    const isPicking = pickingId === row.id;
    return (
      <div
        key={row.id}
        className="rounded overflow-hidden border border-transparent hover:border-border transition-all"
      >
        <div className="flex items-start gap-2 px-2 py-1.5">
          <button
            onClick={() => void pick(row)}
            disabled={pickingId !== null}
            className="flex-1 text-left hover:bg-muted/60 transition-colors rounded px-1 py-0.5 -mx-1 -my-0.5 min-w-0"
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-0.5 min-w-0">
              <span className="truncate">{row.label}</span>
              {isPicking && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />}
            </div>
            {!isExpanded && (
              <>
                <div className="text-[10px] text-muted-foreground line-clamp-2 leading-tight">
                  {row.content_preview || "Empty note"}
                </div>
                {showFolder && row.folder_name && (
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                    {row.folder_name}
                  </div>
                )}
                {!showFolder && row.tags && row.tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {row.tags.slice(0, 3).map((tag) => (
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(row.id);
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
              {body?.loading || !body ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : body.error ? (
                <ReadFailure error={body.error} what="this note" onRetry={() => picker.loadBody(row.id)} />
              ) : (
                <div className="text-[11px] text-foreground whitespace-pre-wrap leading-relaxed">
                  {body.data || "Empty note"}
                </div>
              )}
            </div>
            {row.tags && row.tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {row.tags.map((tag) => (
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
  };

  const sectionLabel = (text: string) => (
    <div className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {text}
    </div>
  );

  const spinner = (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  const renderFolders = () => {
    const { folders } = picker;
    if (folders.loading && folders.data.length === 0) return spinner;
    if (folders.error) {
      return <ReadFailure error={folders.error} what="your note folders" onRetry={picker.retry} />;
    }
    if (folders.data.length === 0) return null;
    return (
      <div className="space-y-0.5">
        {sectionLabel("Folders")}
        {folders.data.map(({ folder_name: folder, note_count: count }) => {
          const { icon: Icon, color } = getFolderIconAndColor(folder);
          return (
            <button
              key={folder}
              onClick={() => openFolder(folder)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/60 transition-colors group"
            >
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: color || undefined }} />
              <span className="flex-1 text-xs font-medium text-foreground text-left truncate">
                {folder}
              </span>
              <span className="text-[10px] text-muted-foreground flex-shrink-0">{count}</span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground flex-shrink-0" />
            </button>
          );
        })}
      </div>
    );
  };

  const renderBody = () => {
    if (isSearching) {
      const { search } = picker;
      if (search.error) {
        return <ReadFailure error={search.error} what="your notes" onRetry={picker.retry} />;
      }
      if (search.loading && search.data.length === 0) return spinner;
      if (search.data.length === 0) {
        return <div className="text-xs text-muted-foreground text-center py-8">No notes match</div>;
      }
      return (
        <div className="space-y-0.5">
          {search.data.map((row) => renderNote(row, true))}
          {search.capped && (
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground text-center">
              Showing the newest {search.data.length} matches — add a word to narrow it.
            </div>
          )}
        </div>
      );
    }

    if (selectedFolder) {
      const rows = picker.folderRows(selectedFolder);
      if (!rows || (rows.loading && rows.data.length === 0)) return spinner;
      if (rows.error) {
        return (
          <ReadFailure
            error={rows.error}
            what={`the notes in ${selectedFolder}`}
            onRetry={() => picker.openFolder(selectedFolder)}
          />
        );
      }
      if (rows.data.length === 0) {
        return <div className="text-xs text-muted-foreground text-center py-8">No notes in this folder</div>;
      }
      return <div className="space-y-0.5">{rows.data.map((row) => renderNote(row, false))}</div>;
    }

    const { recent } = picker;
    return (
      <div className="space-y-2">
        {recent.error ? (
          <ReadFailure error={recent.error} what="your recent notes" onRetry={picker.retry} />
        ) : recent.loading && recent.data.length === 0 ? (
          spinner
        ) : recent.data.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">No notes yet</div>
        ) : (
          <div className="space-y-0.5">
            {sectionLabel("Recent")}
            {recent.data.map((row) => renderNote(row, true))}
          </div>
        )}
        {renderFolders()}
      </div>
    );
  };

  return (
    <div className="flex flex-col max-h-[460px]">
      <ResourcePickerSubViewHeader
        title={selectedFolder || "Notes"}
        onBack={selectedFolder ? () => setSelectedFolder(null) : onBack}
      />

      <div className="px-2 py-1.5 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search all notes..."
            value={searchQuery}
            onChange={(e) => {
              setExpandedNoteId(null);
              setSearchQuery(e.target.value);
            }}
            className="h-7 text-xs pl-7 pr-2 bg-background border-border"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1">{renderBody()}</div>
    </div>
  );
}
