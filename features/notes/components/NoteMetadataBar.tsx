"use client";

// Layer 2: NoteMetadataBar — editor CHROME only (folder, context, tags).
//
// Content metrics + save status live in NoteStatsFooter (WindowPanel footer /
// /notes bottom strip). Do NOT reintroduce a stats bar here — that was the
// double-footer / mid-pane hover bug.
//
// Props: noteId only (+ optional variant). Everything from Redux.

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FolderOpen, ChevronDown, X, Plus, Network } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { updateNoteFolder, updateNoteTags } from "../redux/slice";
import {
  selectNoteFolder,
  selectNoteTags,
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

interface NoteMetadataBarProps {
  noteId: string;
  /**
   * `chrome` (default) — thin strip above the stats footer; owns its own
   * top border. `slot` — for rare cases where a parent already frames it.
   */
  variant?: "chrome" | "slot";
}

export function NoteMetadataBar({
  noteId,
  variant = "chrome",
}: NoteMetadataBarProps) {
  const dispatch = useAppDispatch();

  const folder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const tags = useAppSelector(selectNoteTags(noteId));
  const allFolders = useAppSelector(selectAllFolders);
  const note = useAppSelector(selectNoteById(noteId));

  const ctxOrgId = useAppSelector(selectOrganizationId);
  const ctxOrgName = useAppSelector(selectOrganizationName);
  const ctxProjId = useAppSelector(selectProjectId);
  const ctxProjName = useAppSelector(selectProjectName);
  const ctxTaskId = useAppSelector(selectTaskId);
  const ctxTaskName = useAppSelector(selectTaskName);

  const noteOrgId = note?.organization_id ?? null;
  const noteProjId = note?.project_id ?? null;
  const noteTaskId = note?.task_id ?? null;

  const [folderOpen, setFolderOpen] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [scopePickerOpen, setScopePickerOpen] = useState(false);

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
      {scopePickerOpen && (
        <div className="relative z-10 shrink-0 border-t border-border/20 bg-background px-2">
          <NoteContextSection noteId={noteId} />
        </div>
      )}

      <div
        className={cn(
          "relative z-10 flex min-h-0 shrink-0 items-center gap-1.5 overflow-hidden px-2 py-0.5",
          variant === "chrome" && "border-t border-border/20 bg-background",
        )}
      >
        <div className="shrink-0">
          <button
            type="button"
            ref={folderBtnRef}
            onClick={toggleFolderMenu}
            className="flex cursor-pointer items-center gap-1 text-[0.6875rem] text-foreground transition-colors hover:text-primary [&_svg]:h-3 [&_svg]:w-3"
          >
            <FolderOpen />
            <span className="max-w-[100px] truncate">{folder}</span>
            <ChevronDown className="!h-2.5 !w-2.5 opacity-60" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setScopePickerOpen((v) => !v)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center gap-1 rounded-full px-1.5 py-0 text-[0.6875rem] transition-colors",
            noteOrgId || noteProjId || noteTaskId
              ? "bg-primary/10 text-primary"
              : "border border-dashed border-border text-muted-foreground hover:text-primary",
          )}
          title="Set context for this note"
        >
          <Network className="h-3 w-3" />
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
          className="shrink-0 [&_.badge]:px-1.5 [&_.badge]:py-0 [&_.badge]:text-[0.625rem]"
        />
        <TaskChipRow
          entityType="note"
          entityId={noteId}
          label={undefined}
          size="xs"
          className="shrink-0"
        />

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0 text-[0.625rem] text-foreground"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="cursor-pointer text-muted-foreground hover:text-foreground [&_svg]:h-2.5 [&_svg]:w-2.5"
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
              className="w-24 shrink-0 rounded-md border border-border bg-muted px-1.5 py-0.5 text-[0.6875rem] outline-none focus:border-primary"
              placeholder="Add tag…"
              style={{ fontSize: "16px" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingTag(true)}
              className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary [&_svg]:h-3 [&_svg]:w-3"
              title="Add tag"
            >
              <Plus />
            </button>
          )}
        </div>
      </div>

      {folderOpen &&
        folderMenuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={folderMenuRef}
            className="fixed z-[10000] max-h-[240px] min-w-[120px] overflow-auto rounded-lg border border-border bg-card/95 py-1 shadow-lg backdrop-blur-2xl"
            style={{ left: folderMenuPos.left, bottom: folderMenuPos.bottom }}
          >
            {allFolders.map((f) => (
              <button
                key={f}
                type="button"
                className={cn(
                  "w-full cursor-pointer px-3 py-1.5 text-left text-xs transition-colors",
                  f === folder
                    ? "bg-primary/10 font-medium text-primary"
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
