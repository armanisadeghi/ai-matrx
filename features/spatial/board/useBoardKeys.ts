"use client";

import { useEffect, useRef } from "react";
import { boardOwnsKey } from "../engine/key-target";

/** ⌘Z / ⇧⌘Z (and Ctrl on Windows) and Delete / Backspace on the board. */
export function useBoardKeys({
  undo,
  redo,
  deleteSelected,
  enabled,
}: {
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
  enabled: () => boolean;
}) {
  const handlers = useRef({ undo, redo, deleteSelected, enabled });
  useEffect(() => {
    handlers.current = { undo, redo, deleteSelected, enabled };
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
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        handlers.current.deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
