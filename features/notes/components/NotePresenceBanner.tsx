"use client";

// NotePresenceBanner — collaboration-presence chrome for a notes instance.
// Shows "another user is editing this note" / "other users are active".
// Takes ONLY instanceId; reads presence + the active note from Redux. Renders
// nothing when there's no presence to show. ZERO PROP DRILLING.

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectInstanceActiveTab,
  selectOtherUsersActive,
  selectActiveNoteEditedByOthers,
} from "../redux/selectors";

export interface NotePresenceBannerProps {
  instanceId: string;
}

export function NotePresenceBanner({ instanceId }: NotePresenceBannerProps) {
  const activeTabId = useAppSelector(selectInstanceActiveTab(instanceId));
  const othersActive = useAppSelector(selectOtherUsersActive);
  const activeNoteEditedByOthers = useAppSelector(
    selectActiveNoteEditedByOthers,
  );

  if (activeTabId && activeNoteEditedByOthers) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <span className="text-[0.6875rem] text-amber-700 dark:text-amber-300">
          Another user is editing this note
        </span>
      </div>
    );
  }

  if (othersActive && !activeNoteEditedByOthers) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-blue-500/10 bg-blue-500/5 px-4 py-0.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
        </span>
        <span className="text-[0.625rem] text-blue-600/70 dark:text-blue-400/70">
          Other users are active in notes
        </span>
      </div>
    );
  }

  return null;
}
