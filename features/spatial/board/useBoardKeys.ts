"use client";

import { useEffect, useRef } from "react";

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
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
      )
        return;
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
