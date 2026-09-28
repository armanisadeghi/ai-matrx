"use client";

// NoteRecordTools — the tools that act on the ONE open note: document
// outline, version history, and clean-up. Rendered inside a
// `TapTargetButtonGroup` by the /notes page header (both its shell-header and
// inline forms) and by `NoteWorkspace`, so every host has the same buttons.

import { useCallback } from "react";
import { HistoryTapButton, ListTapButton } from "@ai-matrx/tap-target/buttons";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setInstanceOutlineOpen } from "../redux/slice";
import { selectInstanceOutlineOpen } from "../redux/selectors";
import { NoteCleanupButton } from "./cleanup/NoteCleanupButton";

export interface NoteRecordToolsProps {
  instanceId: string;
  noteId: string;
  historyOpen: boolean;
  onToggleHistory: () => void;
}

export function NoteRecordTools({
  instanceId,
  noteId,
  historyOpen,
  onToggleHistory,
}: NoteRecordToolsProps) {
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
        className={outlineOpen ? "text-primary" : undefined}
      />
      <HistoryTapButton
        variant="group"
        onClick={onToggleHistory}
        ariaLabel="Versions"
        tooltip="Version history"
        className={historyOpen ? "text-primary" : undefined}
      />
      <NoteCleanupButton noteId={noteId} asTapGroup />
    </>
  );
}
