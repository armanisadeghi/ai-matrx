"use client";

/**
 * components/official/topic-tree/useTopicTreeKeyboard.ts — the whole keyboard
 * model of CONTRACTS §4.1, in one place.
 *
 * ↑/↓ select · ←/→ collapse/expand (→ on a leaf or an already-open parent moves
 * to the next row) · Enter activate · F2 rename · Space check · Home/End ·
 * type-ahead by label.
 *
 * WHY MOVEMENT ALSO SELECTS. The contract says "↑/↓ select", not "↑/↓ move
 * focus": a tree whose arrow keys move a focus ring without changing what the
 * detail panel shows makes the user press Enter after every step. Finder,
 * VS Code's explorer and Linear all select as they move; the roving focus is
 * kept as a separate piece of state only so the caret survives a re-render
 * where the host has not yet echoed the selection back.
 */

import { useRef } from "react";

import type { TopicTreeRow } from "./types";

/** How long a type-ahead buffer survives without a keystroke. Windows' own value. */
export const TOPIC_TREE_TYPEAHEAD_MS = 700;

export interface TopicTreeKeyboardArgs {
  rows: readonly TopicTreeRow[];
  focusedIndex: number;
  /** Moves the roving focus AND fires `onSelect` for that row. */
  moveTo: (index: number, modifiers: { shiftKey: boolean; metaKey: boolean }) => void;
  onToggleExpand: (id: string) => void;
  onActivate?: (id: string) => void;
  onCheck?: (id: string) => void;
  /** Present only when the host supplied `onRenameCommit`. */
  startRename?: (id: string) => void;
}

export function useTopicTreeKeyboard({
  rows,
  focusedIndex,
  moveTo,
  onToggleExpand,
  onActivate,
  onCheck,
  startRename,
}: TopicTreeKeyboardArgs) {
  const typeahead = useRef<{ buffer: string; at: number }>({ buffer: "", at: 0 });

  return function onKeyDown(event: React.KeyboardEvent): void {
    if (rows.length === 0) return;
    const index = focusedIndex >= 0 && focusedIndex < rows.length ? focusedIndex : 0;
    const row = rows[index];
    if (!row) return;
    const modifiers = { shiftKey: event.shiftKey, metaKey: event.metaKey };

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(Math.min(rows.length - 1, index + 1), modifiers);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveTo(Math.max(0, index - 1), modifiers);
        return;
      case "ArrowRight":
        event.preventDefault();
        if (row.hasChildren && !row.expanded) onToggleExpand(row.id);
        // A leaf — and an already-open parent, whose next row IS its first
        // child — steps forward instead of doing nothing.
        else if (index < rows.length - 1) moveTo(index + 1, modifiers);
        return;
      case "ArrowLeft": {
        event.preventDefault();
        if (row.hasChildren && row.expanded) {
          onToggleExpand(row.id);
          return;
        }
        if (row.parentId === null) return;
        const parent = rows.findIndex((candidate) => candidate.id === row.parentId);
        if (parent >= 0) moveTo(parent, modifiers);
        return;
      }
      case "Home":
        event.preventDefault();
        moveTo(0, modifiers);
        return;
      case "End":
        event.preventDefault();
        moveTo(rows.length - 1, modifiers);
        return;
      case "Enter":
        event.preventDefault();
        onActivate?.(row.id);
        return;
      case "F2":
        event.preventDefault();
        startRename?.(row.id);
        return;
      case " ":
      case "Spacebar":
        // Space scrolls the page by default; swallowing it is required whether
        // or not this tree has checkboxes.
        event.preventDefault();
        onCheck?.(row.id);
        return;
      default:
        break;
    }

    // Type-ahead. Single printable characters only, so Ctrl/Cmd shortcuts and
    // every named key above fall through untouched.
    if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
    const now = Date.now();
    const buffer =
      now - typeahead.current.at > TOPIC_TREE_TYPEAHEAD_MS
        ? event.key.toLowerCase()
        : typeahead.current.buffer + event.key.toLowerCase();
    typeahead.current = { buffer, at: now };

    // Search forward from the row AFTER the current one and wrap, so repeating
    // the same letter cycles through every row that starts with it.
    const start = buffer.length === 1 ? index + 1 : index;
    for (let step = 0; step < rows.length; step += 1) {
      const candidate = (start + step + rows.length) % rows.length;
      const label = rows[candidate]?.label.toLowerCase() ?? "";
      if (label.startsWith(buffer)) {
        event.preventDefault();
        moveTo(candidate, modifiers);
        return;
      }
    }
  };
}
