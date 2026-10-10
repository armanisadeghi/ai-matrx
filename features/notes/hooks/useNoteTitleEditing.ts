"use client";

// useNoteTitleEditing — THE rename behaviour for a note's title, wherever the
// title is shown: the /notes tab (NoteTabItem), a single note's tool row and a
// host's own header (NoteTitleField — a Board tile). One copy of the naming
// rules, so every place that renames a note renames it the same way:
//   - typing saves after a 500ms pause (never an empty label mid-typing);
//   - while the field is focused the typed buffer wins over any incoming
//     label (auto-label, realtime) — the "system freaks out about naming" bug;
//   - blur commits a non-empty entry at once; an emptied field, or Escape
//     (revert), keeps the saved name;
//   - the note is flagged as being named while focused, so auto-label waits.

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { updateNoteLabel } from "../redux/slice";
import { selectNoteLabel } from "../redux/selectors";
import { setNoteLabelEditing } from "../utils/labelEditing";

export function useNoteTitleEditing(noteId: string, onInteract?: () => void) {
  const dispatch = useAppDispatch();
  const label = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";
  const [localLabel, setLocalLabel] = useState(label);
  const [titleFocused, setTitleFocused] = useState(false);
  // Edit INTENT, not focus: right-click also focuses an input, and a focused
  // live input makes the v3 menu yield to the native one — so the field stays
  // readOnly through focus and opens only on a left click (or Enter).
  const [titleEditing, setTitleEditing] = useState(false);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set by revert(): the blur that follows keeps the saved name.
  const revertingRef = useRef(false);
  // The name when renaming began — what Escape goes back to (the debounce may
  // already have saved part of what was typed).
  const labelAtFocusRef = useRef(label);

  // Redux label → local, NEVER while the person is typing the title.
  const [lastSyncedLabel, setLastSyncedLabel] = useState(label);
  if (!titleFocused && label !== lastSyncedLabel) {
    setLastSyncedLabel(label);
    setLocalLabel(label);
  }

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalLabel(value);
      onInteract?.();
      if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
      labelTimerRef.current = setTimeout(() => {
        labelTimerRef.current = null;
        if (!value.trim()) return;
        setLastSyncedLabel(value);
        dispatch(updateNoteLabel({ id: noteId, label: value }));
      }, 500);
    },
    [dispatch, noteId, onInteract],
  );

  // Unmount while focused (tab closed, tile removed mid-rename) must not leave
  // the naming flag stuck — a stuck flag permanently disables auto-label.
  useEffect(() => () => setNoteLabelEditing(noteId, false), [noteId]);

  const onFocus = useCallback(() => {
    labelAtFocusRef.current = label;
    setTitleFocused(true);
    setNoteLabelEditing(noteId, true);
    onInteract?.();
  }, [label, noteId, onInteract]);

  const onBlur = useCallback(() => {
    setTitleFocused(false);
    setTitleEditing(false);
    setNoteLabelEditing(noteId, false);
    if (labelTimerRef.current) {
      clearTimeout(labelTimerRef.current);
      labelTimerRef.current = null;
    }
    if (revertingRef.current) {
      revertingRef.current = false;
      const original = labelAtFocusRef.current;
      setLastSyncedLabel(original);
      setLocalLabel(original);
      if (original !== label) dispatch(updateNoteLabel({ id: noteId, label: original }));
      return;
    }
    const trimmed = localLabel.trim();
    if (trimmed) {
      setLastSyncedLabel(trimmed);
      if (trimmed !== label) dispatch(updateNoteLabel({ id: noteId, label: trimmed }));
      if (trimmed !== localLabel) setLocalLabel(trimmed);
    } else {
      setLastSyncedLabel(label);
      setLocalLabel(label);
    }
  }, [dispatch, noteId, localLabel, label]);

  /** Escape: drop the typed name (call before blurring the field). */
  const revert = useCallback(() => {
    revertingRef.current = true;
    if (labelTimerRef.current) {
      clearTimeout(labelTimerRef.current);
      labelTimerRef.current = null;
    }
  }, []);

  return { label, localLabel, titleFocused, titleEditing, setTitleEditing, onChange, onFocus, onBlur, revert };
}
