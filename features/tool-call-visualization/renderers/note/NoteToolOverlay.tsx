"use client";

/**
 * NoteToolOverlay — the full-screen ("Expand") body for the `note` tool.
 *
 * Rendered inside the overlay's Results tab (the shell owns the title bar +
 * tabs), so this is purely the rich body: a spacious identity header, the full
 * note (Preview or Edit), a complete metadata grid, and a prominent path into
 * the real notes window.
 */

import React, { useState } from "react";
import { ExternalLink, PanelRight } from "lucide-react";

import type { ToolRendererProps } from "../../types";
import { isTerminal } from "../_shared";
import { ResultValue } from "../../result-fields/ResultValue";
import { ToolErrorCard } from "../../result-fields/ToolErrorCard";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import { useOpenNotesWindow } from "@/features/overlays/openers/notesWindow";

import { useNoteToolData, type NoteToolMode } from "./useNoteToolData";
import {
  IdCopyChip,
  MetaItem,
  ModeToggle,
  NoteEditArea,
  NoteIdentityHeader,
  NotePreview,
  SaveStatusBadge,
} from "./NoteToolParts";

export const NoteToolOverlay: React.FC<ToolRendererProps> = ({
  entry,
  onOpenOverlay,
  toolGroupId,
}) => {
  const [mode, setMode] = useState<NoteToolMode>("preview");
  const data = useNoteToolData(entry);
  const openNotesWindow = useOpenNotesWindow();

  if (entry.status === "error") {
    return (
      <ToolErrorCard
        entry={entry}
        onOpenOverlay={onOpenOverlay}
        toolGroupId={toolGroupId}
      />
    );
  }

  if (!data.noteId) {
    if (!isTerminal(entry)) {
      return (
        <div className="py-4 text-sm text-muted-foreground">Saving note…</div>
      );
    }
    return <ResultValue value={entry.result} density="full" />;
  }

  const editDisabled = !data.isLoaded;
  const showContent = data.content !== undefined || data.isLoaded;

  return (
    <div className="flex flex-col gap-4">
      {/* Identity + mode */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <NoteIdentityHeader label={data.label} size="lg" />
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
      <div className="rounded-lg border border-border bg-card p-4">
        {!showContent ? (
          <div className="space-y-2.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        ) : mode === "edit" ? (
          <NoteEditArea
            value={data.content ?? ""}
            onChange={data.setContent}
            onBlur={data.flushSave}
            minHeightPx={320}
          />
        ) : (
          <NotePreview content={data.content} collapsible={false} />
        )}
      </div>

      {/* Metadata — stacked rows */}
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex flex-col gap-2">
          <MetaItem label="Note ID">
            <IdCopyChip id={data.noteId} />
          </MetaItem>
          {data.updatedAt ? (
            <MetaItem label="Updated">
              <span title={formatAbsoluteDate(data.updatedAt)}>
                {formatRelativeTime(data.updatedAt)}
              </span>
            </MetaItem>
          ) : null}
          {data.createdAt ? (
            <MetaItem label="Created">
              <span title={formatAbsoluteDate(data.createdAt)}>
                {formatRelativeTime(data.createdAt)}
              </span>
            </MetaItem>
          ) : null}
          <MetaItem label="Folder">{data.folder ?? "—"}</MetaItem>
          <MetaItem label="Words">{data.stats.words.toLocaleString()}</MetaItem>
          <MetaItem label="Characters">
            {data.stats.characters.toLocaleString()}
          </MetaItem>
          <MetaItem label="Reading time">
            {data.stats.readingTimeMinutes > 0
              ? `${data.stats.readingTimeMinutes} min`
              : "—"}
          </MetaItem>
          {data.version != null ? (
            <MetaItem label="Version">v{data.version}</MetaItem>
          ) : null}
        </div>

        {data.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Tags
            </span>
            {data.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Primary actions */}
      <div className="flex justify-end gap-2">
        <a
          href={`/notes/${data.noteId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-4 w-4" />
          New tab
        </a>
        <button
          type="button"
          onClick={() =>
            openNotesWindow({ initialNoteId: data.noteId!, title: data.label })
          }
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <PanelRight className="h-4 w-4" />
          Open in Notes
        </button>
      </div>
    </div>
  );
};
