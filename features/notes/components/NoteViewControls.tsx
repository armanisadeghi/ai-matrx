"use client";

// NoteViewControls — header chrome unit for a notes instance.
// View-mode menu + version-history toggle. Takes ONLY instanceId; reads the
// active note + its editor mode + the instance's history state from Redux.
// Renders nothing when no note is active. ZERO PROP DRILLING — drops into any
// WindowPanel `actionsRight` slot or a page header alike.

import React, { useCallback } from "react";
import {
  FileText,
  SplitSquareHorizontal,
  PilcrowRight,
  Columns,
  Eye,
  History,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setNoteEditorMode, setInstanceHistoryOpen } from "../redux/slice";
import {
  selectInstanceActiveTab,
  selectInstanceHistoryOpen,
  selectNoteEditorMode,
} from "../redux/selectors";
import { cn } from "@/lib/utils";
import { NoteCleanupButton } from "./cleanup/NoteCleanupButton";

export const NOTE_VIEW_MODES = [
  { mode: "plain", label: "Edit", icon: FileText },
  { mode: "split", label: "Split", icon: SplitSquareHorizontal },
  { mode: "wysiwyg", label: "Rich", icon: PilcrowRight },
  { mode: "markdown-split", label: "MD Split", icon: Columns },
  { mode: "preview", label: "Preview", icon: Eye },
] as const;

export type NoteViewMode = (typeof NOTE_VIEW_MODES)[number]["mode"];

export interface NoteViewControlsProps {
  instanceId: string;
  className?: string;
}

export function NoteViewControls({
  instanceId,
  className,
}: NoteViewControlsProps) {
  const dispatch = useAppDispatch();
  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));
  const historyOpen = useAppSelector(selectInstanceHistoryOpen(instanceId));
  const editorMode =
    useAppSelector(
      activeTabId ? selectNoteEditorMode(activeTabId) : () => "plain",
    ) ?? "plain";

  const setMode = useCallback(
    (mode: NoteViewMode) => {
      if (activeTabId) dispatch(setNoteEditorMode({ id: activeTabId, mode }));
    },
    [dispatch, activeTabId],
  );

  const toggleHistory = useCallback(() => {
    dispatch(setInstanceHistoryOpen({ instanceId, open: !historyOpen }));
  }, [dispatch, instanceId, historyOpen]);

  if (!activeTabId) return null;

  const current =
    NOTE_VIEW_MODES.find((m) => m.mode === editorMode) ?? NOTE_VIEW_MODES[0];
  const CurrentIcon = current.icon;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Change view mode"
            className="flex cursor-pointer items-center gap-1 rounded bg-accent/50 px-2 py-0.5 text-[0.6875rem] font-medium text-foreground transition-colors hover:bg-accent [&_svg]:h-3.5 [&_svg]:w-3.5"
          >
            <CurrentIcon />
            <span>{current.label}</span>
            <ChevronDown className="opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[150px]">
          {NOTE_VIEW_MODES.map(({ mode, label, icon: Icon }) => (
            <DropdownMenuItem
              key={mode}
              onSelect={() => setMode(mode)}
              className={cn(
                "gap-2 text-xs",
                editorMode === mode && "bg-accent text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{label}</span>
              {editorMode === mode && (
                <Check className="ml-auto h-3 w-3 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <NoteCleanupButton noteId={activeTabId} />

      <button
        type="button"
        onClick={toggleHistory}
        title="Version history"
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-[0.6875rem] font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
          historyOpen
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <History />
      </button>
    </div>
  );
}
