"use client";

/**
 * ⌘K / Ctrl+K anywhere in the app shell opens "Search your knowledge".
 *
 * Mounted ONCE by the shell (`DeferredIslands`, rendered by `AppShell` for
 * every core and admin route). Tiny on purpose: it imports only the opener and
 * the overlay selector, and the bar itself loads behind the overlay
 * controller's single lazy edge when first opened (code-splitting rule 3/4).
 *
 * A page that owns ⌘K for its own palette (Markdown Studio, PDF Studio)
 * handles the key first and calls `preventDefault()`; this listener runs on
 * `window` in the bubble phase and respects that, so those pages keep theirs.
 * While the bar is open, the bar owns ⌘K (it opens a result's action panel).
 */

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { useOpenKnowledgeCommandBar } from "@/features/overlays/openers/knowledgeCommandBar";

export function isCommandBarHotkey(e: KeyboardEvent): boolean {
  return (
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    !e.shiftKey &&
    (e.key === "k" || e.key === "K")
  );
}

export default function CommandBarHotkey() {
  const openBar = useOpenKnowledgeCommandBar();
  const isOpen = useAppSelector((s) => selectIsOverlayOpen(s, "knowledgeCommandBar"));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isCommandBarHotkey(e) || e.defaultPrevented || e.repeat) return;
      if (isOpen) return;
      e.preventDefault();
      openBar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, openBar]);

  return null;
}
