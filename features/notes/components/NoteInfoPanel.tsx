"use client";

// NoteInfoPanel — the single "everything about this note" surface.
//
// Consolidates what used to be spread across the tab strip and the bottom
// metadata bar into one place:
//   - Content stats (words, characters, lines, paragraphs, reading time)
//   - Timestamps + version info
//   - Folder (editable)
//   - Full hierarchy context (org → scopes → project → task) via the
//     canonical NoteContextPicker
//   - Tags (read-only here; editing stays in the metadata bar)
//   - Identifiers (note id, owner, org/project/task ids) with copy
//
// Props: noteId only. Everything is read from Redux. Designed to live inside
// a WindowPanel (see NoteInfoWindow) but is a plain component with no window
// chrome of its own, so it can be embedded anywhere.

import React, { useCallback, useMemo, useState } from "react";
import {
  FileText,
  FolderOpen,
  ChevronDown,
  Hash,
  Clock,
  Copy,
  Check,
  Globe,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { updateNoteFolder } from "../redux/slice";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteTags,
  selectAllFolders,
} from "../redux/selectors";
import { cn } from "@/lib/utils";
import { computeNoteStats, formatStatNumber } from "../utils/noteStats";
import { NoteContextSection } from "./NoteContextSection";

interface NoteInfoPanelProps {
  noteId: string;
  className?: string;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground/70">
      <Icon className="w-3 h-3" />
      {label}
    </div>
  );
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5">
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[0.625rem] text-muted-foreground">{label}</span>
    </div>
  );
}

function CopyableRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!value) return;
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        toast.success(`${label} copied`);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => toast.error("Copy failed"));
  }, [value, label]);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1">
      <span className="text-[0.6875rem] text-muted-foreground shrink-0">
        {label}
      </span>
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[0.6875rem] font-mono text-foreground/80 truncate">
          {value ?? "—"}
        </span>
        {value && (
          <button
            onClick={handleCopy}
            className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-foreground hover:bg-accent shrink-0 cursor-pointer"
            title={`Copy ${label}`}
          >
            {copied ? (
              <Check className="w-2.5 h-2.5 text-green-500" />
            ) : (
              <Copy className="w-2.5 h-2.5" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function NoteInfoPanel({ noteId, className }: NoteInfoPanelProps) {
  const dispatch = useAppDispatch();

  const note = useAppSelector(selectNoteById(noteId));
  const content = useAppSelector(selectNoteContent(noteId)) ?? "";
  const tags = useAppSelector(selectNoteTags(noteId));
  const allFolders = useAppSelector(selectAllFolders);

  const [folderOpen, setFolderOpen] = useState(false);

  // Single memo keyed on content — only recomputes when the note text
  // changes, never on unrelated re-renders.
  const stats = useMemo(() => computeNoteStats(content), [content]);

  const folder = note?.folder_name ?? "Draft";
  const isPublic = note?.is_public ?? false;

  const handleFolderChange = useCallback(
    (f: string) => {
      dispatch(updateNoteFolder({ id: noteId, folder: f }));
      setFolderOpen(false);
    },
    [dispatch, noteId],
  );

  if (!note) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Note not loaded
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col text-foreground", className)}>
      {/* ── Title ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 border-b border-border/40">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">
          {note.label || "Untitled"}
        </span>
        <span
          className={cn(
            "ml-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] shrink-0",
            isPublic
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
          )}
          title={isPublic ? "This note is public" : "This note is private"}
        >
          {isPublic ? (
            <Globe className="w-2.5 h-2.5" />
          ) : (
            <Lock className="w-2.5 h-2.5" />
          )}
          {isPublic ? "Public" : "Private"}
        </span>
      </div>

      {/* ── Content stats ─────────────────────────────────────────────── */}
      <SectionHeader icon={Hash} label="Content" />
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-1">
        <StatTile value={formatStatNumber(stats.words)} label="Words" />
        <StatTile
          value={formatStatNumber(stats.characters)}
          label="Characters"
        />
        <StatTile
          value={formatStatNumber(stats.charactersNoSpaces)}
          label="No spaces"
        />
        <StatTile value={formatStatNumber(stats.lines)} label="Lines" />
        <StatTile
          value={formatStatNumber(stats.paragraphs)}
          label="Paragraphs"
        />
        <StatTile
          value={`~${stats.readingTimeMinutes} min`}
          label="Read time"
        />
      </div>

      {/* ── Folder ────────────────────────────────────────────────────── */}
      <SectionHeader icon={FolderOpen} label="Folder" />
      <div className="relative px-3 pb-1">
        <button
          onClick={() => setFolderOpen((v) => !v)}
          className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs rounded-md border border-border/50 bg-muted/30 hover:bg-accent/50 transition-colors cursor-pointer"
        >
          <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="truncate">{folder}</span>
          <ChevronDown className="w-3 h-3 opacity-50 ml-auto" />
        </button>
        {folderOpen && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 max-h-[200px] overflow-auto py-1 bg-card/95 backdrop-blur-2xl border border-border rounded-lg shadow-lg">
            {allFolders.map((f) => (
              <button
                key={f}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors",
                  f === folder
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent",
                )}
                onClick={() => handleFolderChange(f)}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Context (org → scopes → project → task) ──────────────────── */}
      <SectionHeader icon={Hash} label="Context" />
      <div className="px-1">
        <NoteContextSection noteId={noteId} />
      </div>

      {/* ── Tags ──────────────────────────────────────────────────────── */}
      {tags.length > 0 && (
        <>
          <SectionHeader icon={Hash} label="Tags" />
          <div className="flex flex-wrap gap-1 px-3 pb-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 text-[0.625rem] bg-muted rounded-full text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </>
      )}

      {/* ── Timeline ──────────────────────────────────────────────────── */}
      <SectionHeader icon={Clock} label="Timeline" />
      <div className="px-3 pb-1 space-y-0.5">
        <div className="flex items-center justify-between text-[0.6875rem]">
          <span className="text-muted-foreground">Created</span>
          <span className="tabular-nums">
            {formatTimestamp(note.created_at)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[0.6875rem]">
          <span className="text-muted-foreground">Updated</span>
          <span className="tabular-nums">
            {formatTimestamp(note.updated_at)}
          </span>
        </div>
        <div className="flex items-center justify-between text-[0.6875rem]">
          <span className="text-muted-foreground">Version</span>
          <span className="tabular-nums">v{note.version}</span>
        </div>
      </div>

      {/* ── Identifiers ──────────────────────────────────────────────── */}
      <SectionHeader icon={Hash} label="Identifiers" />
      <div className="pb-3">
        <CopyableRow label="Note ID" value={note.id} />
        <CopyableRow label="Owner ID" value={note.user_id} />
        {note.organization_id && (
          <CopyableRow label="Org ID" value={note.organization_id} />
        )}
        {note.project_id && (
          <CopyableRow label="Project ID" value={note.project_id} />
        )}
        {note.task_id && <CopyableRow label="Task ID" value={note.task_id} />}
      </div>
    </div>
  );
}
