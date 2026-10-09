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
 * A route can also CLAIM the key explicitly with `useClaimSearchKeys`
 * (features/shell/hooks); the bar then stays closed while it is mounted.
 * While the bar is open, the bar owns ⌘K (it opens a result's action panel).
 * Inside an editor (Write, Source, a formatting textarea, any contenteditable)
 * ⌘K is the editor's link chord: the bar never opens over the person's writing.
 */

import { useEffect } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { isSearchKeyClaimed } from "@/features/shell/hooks/searchKeyClaim";
import { useOpenKnowledgeCommandBar } from "@/features/overlays/openers/knowledgeCommandBar";
import { editorOwnsKeyEvent } from "@ai-matrx/rich-editor/format/editor-keys";

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
      // The editor the person is writing in owns ⌘K (its link prompt).
      if (editorOwnsKeyEvent(e)) return;
      // A mounted route that claimed Cmd+K (useClaimSearchKeys) owns it.
      if (isSearchKeyClaimed("k")) return;
      e.preventDefault();
      openBar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, openBar]);

  return null;
}
