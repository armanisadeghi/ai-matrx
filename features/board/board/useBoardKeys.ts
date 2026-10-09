"use client";

import { useEffect, useRef } from "react";
import { boardOwnsKey } from "../engine/key-target";
import type { ArrangeCommand } from "../engine/arrange";
import { arrangeCommandForKey } from "./arrange-board";

/** ⌘Z / ⇧⌘Z (and Ctrl on Windows), Delete / Backspace, ⌘D duplicate and ⌘] / ⌘[ layer order on the board. */
export function useBoardKeys({
  undo,
  redo,
  deleteSelected,
  enabled,
  arrange,
  duplicate,
  reorder,
}: {
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  enabled: () => boolean;
  /** The Arrange shortcuts (`arrangeCommandForKey`): align ⌥A/H/D/W/V/S, tidy ⌃⌥T, by type ⌃⌥G, distribute ⌃⌥H/V. */
  arrange?: (command: ArrangeCommand) => void;
  /** ⌘D — duplicate the selection (Figma). Returns false when nothing could be duplicated (the browser keeps the key). */
  duplicate?: () => boolean;
  /** ⌘] / ⌘[ bring forward / send backward; with ⌥, to front / to back (Figma). */
  reorder?: (dir: "forward" | "backward" | "front" | "back") => void;
}) {
  const handlers = useRef({ undo, redo, deleteSelected, enabled, arrange, duplicate, reorder });
  useEffect(() => {
    handlers.current = { undo, redo, deleteSelected, enabled, arrange, duplicate, reorder };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Keys inside a tile's content (an editor, a grid, a field) are the
      // content's — Backspace there never takes the tile off the board.
      if (!boardOwnsKey(e.target)) return;
      if (!handlers.current.enabled()) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handlers.current.redo();
        else handlers.current.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handlers.current.redo();
      } else if (mod && !e.shiftKey && e.code === "KeyD" && handlers.current.duplicate) {
        if (handlers.current.duplicate()) e.preventDefault();
      } else if (mod && (e.code === "BracketRight" || e.code === "BracketLeft") && handlers.current.reorder) {
        e.preventDefault();
        const up = e.code === "BracketRight";
        handlers.current.reorder(e.altKey ? (up ? "front" : "back") : up ? "forward" : "backward");
      } else if (handlers.current.arrange && arrangeCommandForKey(e)) {
        e.preventDefault();
        handlers.current.arrange(arrangeCommandForKey(e)!);
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        handlers.current.deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
