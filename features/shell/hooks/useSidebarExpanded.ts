"use client";

import { useState, useEffect } from "react";

/**
 * Reads the CSS-checkbox sidebar toggle state (#shell-sidebar-toggle)
 * and returns true when the sidebar is expanded.
 */
export function useSidebarExpanded(): boolean {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const toggle = document.getElementById(
      "shell-sidebar-toggle",
    ) as HTMLInputElement | null;
    if (!toggle) return undefined;

    const sync = () => setExpanded(toggle.checked);
    sync();

    toggle.addEventListener("change", sync);
    return () => toggle.removeEventListener("change", sync);
  }, []);

  return expanded;
}
