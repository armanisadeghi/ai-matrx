"use client";

// Layer 2: NoteMetadataBar
// Shows folder, tags, scope assignments, org/project/task context, save status, word count.
// Title is handled by the tab (Layer 3) — NOT duplicated here.
// Props: noteId only. Everything from Redux.

import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { createPortal } from "react-dom";
import {
  FolderOpen,
  ChevronDown,
  X,
  Plus,
  Building2,
  Network,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { updateNoteFolder, updateNoteTags } from "../redux/slice";
import {
  selectNoteFolder,
  selectNoteTags,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
  selectNoteContent,
  selectAllFolders,
  selectNoteById,
} from "../redux/selectors";
import {
  selectOrganizationName,
  selectProjectName,
  selectTaskName,
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import { ScopeTagsDisplay } from "@/features/agent-context/components/ScopeTagsDisplay";
import TaskChipRow from "@/features/tasks/widgets/TaskChipRow";
import { cn } from "@/lib/utils";
import { NoteContextSection } from "./NoteContextSection";
import { computeNoteStats, formatStatNumber } from "../utils/noteStats";

interface NoteMetadataBarProps {
  noteId: string;
}

export function NoteMetadataBar({ noteId }: NoteMetadataBarProps) {
  const dispatch = useAppDispatch();

  const folder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const tags = useAppSelector(selectNoteTags(noteId));
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const isSaving = useAppSelector(selectNoteIsSavingById(noteId));
  const content = useAppSelector(selectNoteContent(noteId)) ?? "";
  const allFolders = useAppSelector(selectAllFolders);
  const note = useAppSelector(selectNoteById(noteId));

  // Current hierarchy context (from appContextSlice)
  const ctxOrgId = useAppSelector(selectOrganizationId);
  const ctxOrgName = useAppSelector(selectOrganizationName);
  const ctxProjId = useAppSelector(selectProjectId);
  const ctxProjName = useAppSelector(selectProjectName);
  const ctxTaskId = useAppSelector(selectTaskId);
  const ctxTaskName = useAppSelector(selectTaskName);

  // Note's assigned context
  const noteOrgId = note?.organization_id ?? null;
  const noteProjId = note?.project_id ?? null;
  const noteTaskId = note?.task_id ?? null;

  const [folderOpen, setFolderOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [scopePickerOpen, setScopePickerOpen] = useState(false);

  // Folder dropdown is portaled to <body> with fixed positioning: the
  // metadata row clips overflow and the menu opens upward, so an in-flow
  // absolute menu gets cut off. We anchor it to the trigger's rect instead.
  const folderBtnRef = useRef<HTMLButtonElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const [folderMenuPos, setFolderMenuPos] = useState<{
    left: number;
    bottom: number;
  } | null>(null);

  const recomputeFolderMenuPos = useCallback(() => {
    const rect = folderBtnRef.current?.getBoundingClientRect();
    if (rect) {
      setFolderMenuPos({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 4,
      });
    }
  }, []);

  const toggleFolderMenu = useCallback(() => {
    setFolderOpen((open) => {
      if (open) return false;
      recomputeFolderMenuPos();
      return true;
    });
  }, [recomputeFolderMenuPos]);

  // While open: close on outside click or Escape. Scroll/resize only
  // *reposition* the menu (the trigger lives in a fixed bottom bar, so it
  // doesn't move with content scroll — closing on every scroll was wrong).
  useEffect(() => {
    if (!folderOpen) return undefined;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        folderMenuRef.current?.contains(target) ||
        folderBtnRef.current?.contains(target)
      ) {
        return;
      }
      setFolderOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFolderOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", recomputeFolderMenuPos, true);
    window.addEventListener("resize", recomputeFolderMenuPos);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", recomputeFolderMenuPos, true);
      window.removeEventListener("resize", recomputeFolderMenuPos);
    };
  }, [folderOpen, recomputeFolderMenuPos]);

  // Derived content metrics — single memo keyed on content so this only
  // recomputes when the note text actually changes (never on unrelated
  // re-renders). Word/char/line/reading-time all come from one shared util.
  const stats = useMemo(() => computeNoteStats(content), [content]);

  const saveStatus = isSaving ? "Saving..." : isDirty ? "Unsaved" : "Saved";
  const statusColor = isSaving
    ? "text-yellow-500"
    : isDirty
      ? "text-amber-500"
      : "text-green-500";

  const handleFolderChange = useCallback(
    (f: string) => {
      dispatch(updateNoteFolder({ id: noteId, folder: f }));
      setFolderOpen(false);
    },
    [dispatch, noteId],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      dispatch(
        updateNoteTags({ id: noteId, tags: tags.filter((t) => t !== tag) }),
      );
    },
    [dispatch, noteId, tags],
  );

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      dispatch(updateNoteTags({ id: noteId, tags: [...tags, trimmed] }));
    }
    setTagInput("");
    setAddingTag(false);
  }, [dispatch, noteId, tags, tagInput]);

  return (
    <>
      {/* Context panel — renders ABOVE the bar (like the folder dropdown),
          rather than expanding the bar inline. The official assignment field
          (scopes live via ctx_scope_assignments; project/task FKs via the note
          save pipeline). Replaces the old glassy NoteContextPicker. */}
      {scopePickerOpen && (
        <div className="relative z-10 border-t border-border/20 px-2 bg-background shrink-0">
          <NoteContextSection noteId={noteId} />
        </div>
      )}

      <div className="relative z-10 flex items-center gap-2.5 py-1.5 px-4 border-t border-border/20 shrink-0 overflow-hidden min-h-[2.25rem] bg-background">
        {/* Folder selector */}
        <div className="shrink-0">
          <button
            ref={folderBtnRef}
            onClick={toggleFolderMenu}
            className="flex items-center gap-1 text-xs text-foreground hover:text-primary cursor-pointer transition-colors [&_svg]:w-3.5 [&_svg]:h-3.5"
          >
            <FolderOpen />
            <span className="max-w-[120px] truncate">{folder}</span>
            <ChevronDown className="w-3! h-3! opacity-60" />
          </button>
        </div>

        {/* Context toggle — shows summary pill, expands full picker above */}
        <button
          onClick={() => setScopePickerOpen((v) => !v)}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 text-xs rounded-full cursor-pointer transition-colors shrink-0",
            noteOrgId || noteProjId || noteTaskId
              ? "bg-primary/10 text-primary"
              : "text-foreground hover:text-primary border border-dashed border-border",
          )}
          title="Set context for this note"
        >
          <Network className="w-3 h-3" />
          {noteTaskId
            ? ctxTaskName && noteTaskId === ctxTaskId
              ? ctxTaskName
              : "Task"
            : noteProjId
              ? ctxProjName && noteProjId === ctxProjId
                ? ctxProjName
                : "Project"
              : noteOrgId
                ? ctxOrgName && noteOrgId === ctxOrgId
                  ? ctxOrgName
                  : "Org"
                : "Context"}
        </button>
        <ScopeTagsDisplay
          entityType="note"
          entityId={noteId}
          className="shrink-0 [&_.badge]:text-[0.625rem] [&_.badge]:py-0 [&_.badge]:px-1.5"
        />
        {/* Task links + quick attach */}
        <TaskChipRow
          entityType="note"
          entityId={noteId}
          label={undefined}
          size="xs"
          className="shrink-0"
        />

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto">
          <span className="text-xs font-medium text-foreground shrink-0">
            Tags
          </span>
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 px-2 py-0.5 text-xs bg-muted rounded-full text-foreground shrink-0"
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="cursor-pointer text-muted-foreground hover:text-foreground [&_svg]:w-2.5 [&_svg]:h-2.5"
              >
                <X />
              </button>
            </span>
          ))}
          {addingTag ? (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddTag();
                if (e.key === "Escape") {
                  setAddingTag(false);
                  setTagInput("");
                }
              }}
              onBlur={handleAddTag}
              className="w-28 px-2 py-1 text-xs bg-muted rounded-md border border-border outline-none focus:border-primary shrink-0"
              placeholder="Add tag…"
              style={{ fontSize: "16px" }}
            />
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="flex items-center justify-center w-5 h-5 rounded-md text-foreground hover:text-primary hover:bg-accent cursor-pointer [&_svg]:w-3.5 [&_svg]:h-3.5 shrink-0"
            >
              <Plus />
            </button>
          )}
        </div>

        {/* Status + word count */}
        <span className={cn("text-xs font-medium shrink-0", statusColor)}>
          {saveStatus}
        </span>
        <span
          className="text-xs text-foreground shrink-0 tabular-nums"
          title={`${formatStatNumber(stats.words)} words · ${formatStatNumber(
            stats.characters,
          )} characters · ${formatStatNumber(stats.lines)} lines · ~${
            stats.readingTimeMinutes
          } min read`}
        >
          {formatStatNumber(stats.words)} words ·{" "}
          {formatStatNumber(stats.characters)} chars
        </span>
      </div>

      {/* Folder dropdown — portaled to <body> so it escapes the metadata
          row's overflow clip and sits above window panels. */}
      {folderOpen &&
        folderMenuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={folderMenuRef}
            className="fixed z-[10000] min-w-[120px] max-h-[240px] overflow-auto py-1 bg-card/95 backdrop-blur-2xl border border-border rounded-lg shadow-lg"
            style={{ left: folderMenuPos.left, bottom: folderMenuPos.bottom }}
          >
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
          </div>,
          document.body,
        )}
    </>
  );
}
