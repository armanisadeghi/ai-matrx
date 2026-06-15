"use client";

/**
 * SidebarNotesToggle — opens / closes the Notes window from the shell
 * sidebar. Lives in the boot bundle of every authenticated route (via
 * Sidebar.tsx), so it MUST NOT statically import any window-panel
 * component — that would pull the entire registry chunk graph into the
 * boot bundle and trip the lazy-bundle-guard.
 *
 * The window itself (`notesWindow`) is registered in
 * `windowRegistry.ts` and rendered by `UnifiedOverlayController`. We
 * just toggle the overlay's open/close state via Redux. Active state
 * for the button comes from the same selector — no local useState.
 */

import { useCallback } from "react";
import { FileText } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toggleOverlay } from "@/lib/redux/slices/overlaySlice";
import { useOverlayOpen } from "@/features/window-panels/hooks/useOverlay";

export default function SidebarNotesToggle() {
  const dispatch = useAppDispatch();
  const isOpen = useOverlayOpen("notesWindow");

  const toggle = useCallback(() => {
    dispatch(toggleOverlay({ overlayId: "notesWindow" }));
  }, [dispatch]);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`shell-nav-item shell-tactile ${isOpen ? "shell-nav-item-active" : ""}`}
      aria-label="Toggle notes window"
      aria-pressed={isOpen}
      title="Notes"
    >
      <span className="shell-nav-icon">
        <FileText size={18} strokeWidth={1.75} />
      </span>
      <span className="shell-nav-label">Notes</span>
    </button>
  );
}
