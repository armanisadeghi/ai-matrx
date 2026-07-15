"use client";

// NotePresenceBanner — collaboration-presence chrome for a notes instance.
// Shows "{name} is editing this note" (with a live typing-dots animation)
// when a realtime UPDATE attributed another user (via `updated_by`) to the
// active note, or a slim "editing another note" strip otherwise.
// Takes ONLY instanceId; reads presence + the active note from Redux. Renders
// nothing when there's no presence to show. ZERO PROP DRILLING.

import React from "react";
import { Pencil } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectInstanceActiveTab,
  selectNoteEditor,
  selectAnyNoteEditorActive,
} from "../redux/selectors";
import { editorDisplayName } from "../utils/editorDisplayName";

const NO_EDITOR = () => undefined;

export interface NotePresenceBannerProps {
  instanceId: string;
}

export function NotePresenceBanner({ instanceId }: NotePresenceBannerProps) {
  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));
  const activeEditor = useAppSelector(
    activeTabId ? selectNoteEditor(activeTabId) : NO_EDITOR,
  );
  const anyEditorActive = useAppSelector(selectAnyNoteEditorActive);

  if (activeTabId && activeEditor) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1">
        <Pencil className="h-3 w-3 text-amber-600 dark:text-amber-400 notes-editing-pencil" />
        <span className="text-[0.6875rem] text-amber-700 dark:text-amber-300">
          {editorDisplayName(activeEditor)} is editing this note
        </span>
        <span className="notes-editing-dots text-amber-700 dark:text-amber-300">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }

  if (anyEditorActive) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-blue-500/10 bg-blue-500/5 px-4 py-0.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
        </span>
        <span className="text-[0.625rem] text-blue-600/70 dark:text-blue-400/70">
          Someone is editing another note
        </span>
      </div>
    );
  }

  return null;
}
