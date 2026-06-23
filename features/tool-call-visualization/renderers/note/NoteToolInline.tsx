"use client";

/**
 * NoteToolInline — the expanded inline body for the `note` tool call.
 *
 * Layout (top → bottom):
 *   • identity header   — NotebookPen + note label + Edit/Preview toggle
 *   • content           — collapsible Preview (markdown) or editable source
 *   • metadata footer   — full id (+copy), updated, chars, words, folder
 *                         + "Open in Notes" (real notes window) and "Expand"
 *
 * The card stays minimal but is genuinely usable: the Preview is the live note
 * body, Edit writes back through the canonical notes thunks, and "Open in
 * Notes" hands the user the full notes window deep-linked to this note.
 */

import React, { useState } from "react";
import { ExternalLink, Maximize2 } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import { isTerminal } from "../_shared";
import { ResultValue } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { formatRelativeTime } from "@/utils/datetime";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";

import { useNoteToolData, type NoteToolMode } from "./useNoteToolData";
import {
  IdCopyChip,
  ModeToggle,
  NoteEditArea,
  NoteIdentityHeader,
  NotePreview,
  SaveStatusBadge,
} from "./NoteToolParts";

export const NoteToolInline: React.FC<ToolRendererProps> = ({
  entry,
  onOpenOverlay,
  toolGroupId,
}) => {
  const [mode, setMode] = useState<NoteToolMode>("preview");
  const data = useNoteToolData(entry);
  const openNotesWindow = useOpenNotesWindow();

  // ── Non-success states ────────────────────────────────────────────────
  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }

  if (!isTerminal(entry) && !data.noteId) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground animate-in fade-in">
        Saving note…
      </div>
    );
  }

  if (!data.noteId) {
    // Terminal but malformed result — never hide the data.
    return <ResultValue value={entry.result} density="inline" />;
  }

  const editDisabled = !data.isLoaded;
  const showContent = data.content !== undefined || data.isLoaded;

  return (
    <div className="overflow-hidden">
      {/* Identity */}
      <div className="flex items-center gap-2 pb-1.5">
        <div className="min-w-0 flex-1">
          <NoteIdentityHeader label={data.label} size="sm" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === "edit" ? <SaveStatusBadge state={data.saveState} /> : null}
          <ModeToggle
            mode={mode}
            onMode={setMode}
            editDisabled={editDisabled}
          />
        </div>
      </div>

      {/* Content */}
      <div className="pb-1.5">
        {!showContent ? (
          <div className="space-y-2 py-1">
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        ) : mode === "edit" ? (
          <NoteEditArea
            value={data.content ?? ""}
            onChange={data.setContent}
            onBlur={data.flushSave}
          />
        ) : (
          <NotePreview
            content={data.content}
            collapsible
            collapsedMaxPx={240}
          />
        )}
      </div>

      {/* Metadata + actions — stacked; id first with copy */}
      <div className="flex flex-col gap-1 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
        <IdCopyChip id={data.noteId} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {data.updatedAt ? (
            <span title={data.updatedAt}>
              Updated {formatRelativeTime(data.updatedAt)}
            </span>
          ) : null}
          <span>{data.stats.characters.toLocaleString()} chars</span>
          <span>{data.stats.words.toLocaleString()} words</span>
          {data.folder ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground/70">Folder</span>
              <span className="text-foreground">{data.folder}</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1 pt-0.5">
          <button
            type="button"
            onClick={() =>
              openNotesWindow({
                initialNoteId: data.noteId!,
                title: data.label,
              })
            }
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in Notes
          </button>
          {onOpenOverlay ? (
            <button
              type="button"
              onClick={() => onOpenOverlay()}
              title="Expand"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Expand
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
