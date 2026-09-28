// The notes keyboard shortcuts for ONE notes instance — save, close tab,
// find, find everywhere, find + replace, next/previous match. The /notes
// page listens on `window` (it owns the screen); a host that shows a note
// beside other things (a board tile) listens on its own element, so its keys
// never reach another note. Both call THIS function, so the keys are the same.

import type { AppDispatch } from "@/lib/redux/store";
import {
  markTabInteraction,
  navigateFindMatch,
  openFindReplace,
  removeInstanceTab,
} from "../redux/slice";
import { saveNote } from "../redux/thunks";

/** The part of a DOM or React keyboard event the shortcuts read. */
export interface NoteShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

export interface NoteShortcutContext {
  dispatch: AppDispatch;
  instanceId: string;
  activeTabId: string | null;
  /** Ctrl/⌘+W closes the active tab — only where the note IS a tab. */
  canCloseTab: boolean;
}

/**
 * Standard behavior: a non-empty, single-line selection in the focused
 * textarea/input seeds the find query (multi-line selections are usually
 * unintentional for a find query).
 */
function selectedFindText(): string | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
    return undefined;
  }
  const { selectionStart, selectionEnd, value } = active;
  if (selectionStart == null || selectionEnd == null || selectionEnd <= selectionStart) {
    return undefined;
  }
  const selected = value.slice(selectionStart, selectionEnd);
  return selected.length > 0 && !selected.includes("\n") ? selected : undefined;
}

/** Handles the event when it is a notes shortcut; returns whether it was. */
export function handleNoteShortcut(e: NoteShortcutEvent, ctx: NoteShortcutContext): boolean {
  const { dispatch, instanceId, activeTabId } = ctx;
  const mod = e.ctrlKey || e.metaKey;

  // Ctrl+S — save the active note
  if (mod && e.key === "s") {
    e.preventDefault();
    if (activeTabId) dispatch(saveNote(activeTabId));
    return true;
  }

  // Ctrl+W — close the active tab
  if (ctx.canCloseTab && mod && e.key === "w") {
    e.preventDefault();
    if (activeTabId) {
      dispatch(markTabInteraction({ instanceId }));
      dispatch(removeInstanceTab({ instanceId, noteId: activeTabId }));
    }
    return true;
  }

  // `e.key` honours CapsLock (caps→"F"), so normalize before comparing.
  const keyLower = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  // Ctrl+F — open the find bar (and re-focus + select-all if already open).
  // Shift is excluded so Ctrl+Shift+F below owns "find everywhere".
  if (mod && !e.altKey && !e.shiftKey && keyLower === "f") {
    e.preventDefault();
    dispatch(openFindReplace({ instanceId, showReplace: false, prefillQuery: selectedFindText() }));
    return true;
  }

  // Ctrl+Shift+F / Cmd+Shift+F — find in GLOBAL scope (VS Code's "Search
  // across files"); `openFindReplace` flips the include/exclude rows on.
  if (mod && e.shiftKey && !e.altKey && keyLower === "f") {
    e.preventDefault();
    dispatch(
      openFindReplace({
        instanceId,
        showReplace: false,
        scope: "global",
        prefillQuery: selectedFindText(),
      }),
    );
    return true;
  }

  // Ctrl+H (Win/Linux) or Cmd+Option+F (Mac) — find + replace
  if ((e.ctrlKey && !e.metaKey && e.key === "h") || (e.metaKey && e.altKey && e.key === "f")) {
    e.preventDefault();
    dispatch(openFindReplace({ instanceId, showReplace: true }));
    return true;
  }

  // F3 / Cmd+G — next match. Shift+F3 / Cmd+Shift+G — previous.
  if (e.key === "F3" || (e.metaKey && !e.ctrlKey && e.key === "g")) {
    e.preventDefault();
    dispatch(navigateFindMatch({ instanceId, direction: e.shiftKey ? "prev" : "next" }));
    return true;
  }

  return false;
}
