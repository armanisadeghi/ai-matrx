"use client";

import { useState } from "react";
import { Loader2, ChevronDown, StickyNote } from "lucide-react";
import { cn } from "@/utils/cn";
import { useNotePicker } from "@/features/notes/hooks/useNotePicker";
import { getFolderIconAndColor } from "@/features/notes/utils/folderUtils";
import type { NotePickerRow } from "@/features/notes/service/notesService";
import type { Note } from "@/features/notes/types";
import { toast } from "@/lib/toast";
import { usePickerInputFocus } from "./usePickerInputFocus";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerSectionLabel,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { ReadFailure } from "@ai-matrx/design-system";

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
      <div key={row.id} className={cn("rounded-lg", isExpanded && "bg-muted/40")}>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <PickerRow
              icon={StickyNote}
              iconClassName="text-yellow-600 dark:text-yellow-400"
              label={row.label}
              secondary={
                showFolder && row.folder_name
                  ? row.folder_name
                  : row.content_preview || "Empty note"
              }
              busy={isPicking}
              disabled={pickingId !== null}
              onClick={() => void pick(row)}
            />
          </div>
          <button
            type="button"
            onClick={() => toggleExpand(row.id)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
            aria-label={isExpanded ? "Hide preview" : "Preview"}
            aria-expanded={isExpanded}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
          </button>
        </div>
        {isExpanded && (
          <div className="space-y-2 px-2 pb-2">
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background p-2.5">
              {body?.loading || !body ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : body.error ? (
                <ReadFailure error={body.error} what="this note" onRetry={() => picker.loadBody(row.id)} />
              ) : (
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {body.data || "Empty note"}
                </div>
              )}
            </div>
            {row.tags && row.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {row.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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

  const spinner = (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
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
      <div>
        <PickerSectionLabel>Folders</PickerSectionLabel>
        {folders.data.map(({ folder_name: folder, note_count: count }) => {
          const { icon: Icon, color } = getFolderIconAndColor(folder);
          return (
            <PickerRow
              key={folder}
              leading={
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="h-4 w-4" style={{ color: color || undefined }} />
                </span>
              }
              label={folder}
              trailing={<span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span>}
              chevron
              onClick={() => openFolder(folder)}
            />
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
        return <PickerEmpty>No notes match</PickerEmpty>;
      }
      return (
        <div>
          {search.data.map((row) => renderNote(row, true))}
          {search.capped && (
            <div className="px-2 py-2 text-center text-xs text-muted-foreground">
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
        return <PickerEmpty>No notes in this folder</PickerEmpty>;
      }
      return (
        <div>
          <PickerSectionLabel>{selectedFolder}</PickerSectionLabel>
          {rows.data.map((row) => renderNote(row, false))}
        </div>
      );
    }

    const { recent } = picker;
    return (
      <div className="space-y-2">
        {recent.error ? (
          <ReadFailure error={recent.error} what="your recent notes" onRetry={picker.retry} />
        ) : recent.loading && recent.data.length === 0 ? (
          spinner
        ) : recent.data.length === 0 ? (
          <PickerEmpty>No notes yet</PickerEmpty>
        ) : (
          <div>
            <PickerSectionLabel>Recent</PickerSectionLabel>
            {recent.data.map((row) => renderNote(row, true))}
          </div>
        )}
        {renderFolders()}
      </div>
    );
  };

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={selectedFolder ? () => setSelectedFolder(null) : onBack}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder="Search notes"
            value={searchQuery}
            loading={isSearching && picker.search.loading}
            onChange={(value) => {
              setExpandedNoteId(null);
              setSearchQuery(value);
            }}
          />
        }
      />
      <PickerViewBody>{renderBody()}</PickerViewBody>
    </PickerView>
  );
}
