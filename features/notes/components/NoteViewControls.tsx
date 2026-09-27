"use client";

// NoteViewControls — header chrome unit for a notes instance.
// View-mode menu + version-history toggle. Takes ONLY instanceId; reads the
// active note + its editor mode + the instance's history state from Redux.
// Renders nothing when no note is active. ZERO PROP DRILLING — drops into any
// WindowPanel `actionsRight` slot or a page header alike.

import React, { useCallback } from "react";
import {
  Type,
  SplitSquareHorizontal,
  PenLine,
  Eye,
  History,
  ListTree,
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
import {
  setNoteEditorMode,
  setInstanceHistoryOpen,
  setInstanceOutlineOpen,
} from "../redux/slice";
import {
  selectInstanceActiveTab,
  selectInstanceHistoryOpen,
  selectInstanceOutlineOpen,
} from "../redux/selectors";
import { cn } from "@/lib/utils";
import { NoteCleanupButton } from "./cleanup/NoteCleanupButton";
import { useNoteEditorMode } from "../hooks/usePreferredDefaultEditorMode";

/**
 * The note modes, in plain words, in the order a person meets them (Arman,
 * 2026-09-27). ONE list — the page header, this menu and the phone read it.
 *   Split  the quick plain text on the left, the formatted note live on the
 *          right (the desktop default)
 *   Plain  that text alone — nothing is ever formatted for you
 *   Write  the one editor, formatted
 *   Read   read-only, rendered
 * The phone has Plain (its default) and Write — `NOTE_PHONE_VIEW_MODES`.
 */
export const NOTE_VIEW_MODES = [
  { mode: "split", label: "Split", hint: "Plain text on the left, the formatted note live on the right", icon: SplitSquareHorizontal },
  { mode: "plain", label: "Plain", hint: "Quick, unformatted text — nothing is ever formatted for you", icon: Type },
  { mode: "write", label: "Write", hint: "Edit the formatted note", icon: PenLine },
  { mode: "preview", label: "Read", hint: "Read the formatted note", icon: Eye },
] as const;

export const NOTE_PHONE_VIEW_MODES = NOTE_VIEW_MODES.filter(
  (m): m is Extract<(typeof NOTE_VIEW_MODES)[number], { mode: "plain" | "write" }> =>
    m.mode === "plain" || m.mode === "write",
);

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
  const outlineOpen = useAppSelector(selectInstanceOutlineOpen(instanceId));
  const editorMode = useNoteEditorMode(activeTabId);

  const setMode = useCallback(
    (mode: NoteViewMode) => {
      if (activeTabId) dispatch(setNoteEditorMode({ id: activeTabId, mode }));
    },
    [dispatch, activeTabId],
  );

  const toggleHistory = useCallback(() => {
    dispatch(setInstanceHistoryOpen({ instanceId, open: !historyOpen }));
  }, [dispatch, instanceId, historyOpen]);

  const toggleOutline = useCallback(() => {
    dispatch(setInstanceOutlineOpen({ instanceId, open: !outlineOpen }));
  }, [dispatch, instanceId, outlineOpen]);

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
            className="flex cursor-pointer items-center gap-1 rounded bg-accent/50 px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent [&_svg]:h-3.5 [&_svg]:w-3.5"
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
        onClick={toggleOutline}
        title="Outline"
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
          outlineOpen
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <ListTree />
        <span className="sr-only">Outline</span>
      </button>

      <button
        type="button"
        onClick={toggleHistory}
        title="Versions"
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors [&_svg]:h-3.5 [&_svg]:w-3.5",
          historyOpen
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <History />
        <span className="sr-only">Versions</span>
      </button>
    </div>
  );
}
