"use client";

// NoteRecordTools — the tools that act on the ONE open note: document
// outline, version history, and clean-up. Rendered inside a
// `TapTargetButtonGroup` by the /notes page header (both its shell-header and
// inline forms) and by `NoteWorkspace`, so every host has the same buttons.

import { useCallback } from "react";
import { HistoryTapButton, ListTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setInstanceOutlineOpen } from "../redux/slice";
import { selectInstanceOutlineOpen } from "../redux/selectors";
import { NoteCleanupButton } from "./cleanup/NoteCleanupButton";
import { useNoteHistoryTab } from "../canvas/noteHistoryKind";

export interface NoteRecordToolsProps {
  instanceId: string;
  noteId: string;
}

export function NoteRecordTools({
  instanceId,
  noteId,
}: NoteRecordToolsProps) {
  // Version history is a canvas tab beside the note; pressed while in front.
  const history = useNoteHistoryTab(noteId);
  const dispatch = useAppDispatch();
  const outlineOpen = useAppSelector(selectInstanceOutlineOpen(instanceId));
  const toggleOutline = useCallback(() => {
    dispatch(setInstanceOutlineOpen({ instanceId, open: !outlineOpen }));
  }, [dispatch, instanceId, outlineOpen]);

  return (
    <>
      <ListTapButton
        variant="group"
        onClick={toggleOutline}
        ariaLabel="Outline"
        tooltip="Document outline"
        pressed={outlineOpen}
      />
      <HistoryTapButton
        variant="group"
        onClick={history.toggle}
        ariaLabel="Versions"
        tooltip="Version history"
        pressed={history.isVisible}
      />
      <NoteCleanupButton noteId={noteId} asTapGroup />
    </>
  );
}
