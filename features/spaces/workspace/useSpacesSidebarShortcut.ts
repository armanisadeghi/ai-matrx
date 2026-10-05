"use client";

// features/spaces/workspace/useSpacesSidebarShortcut.ts — Cmd+\ collapses the Spaces sidebar.
//
// The shell chat also listens for Cmd+\ on every page. On /spaces the key is the sidebar's: this
// listener runs in the CAPTURE phase (before any bubble-phase listener, whatever mounted first) and
// marks the key handled with preventDefault; the shell chat skips a defaultPrevented key.

import { useEffect, useEffectEvent } from "react";

export function useSpacesSidebarShortcut(onToggle: () => void): void {
  const toggle = useEffectEvent(onToggle);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.key !== "\\") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}
