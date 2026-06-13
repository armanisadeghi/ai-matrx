// features/shell/components/sidebar/DirectContextSelection.tsx
//
// THIN SHIM — re-exports the canonical Surface A pickers from
// features/scopes/components/active-context/ for the four call sites
// (shell Sidebar, NoteSidebar, MobileNotesView, ChatSidebar).
//
// Twin render, CSS-switched (styles/shell.css): the inline ActiveScopePicker
// shows in an expanded shell sidebar (and in every non-shell host, where the
// collapsed class never activates); when the shell rail is collapsed to
// icons, inline expansion is unusable — the icon popover takes over.
//
// DO NOT add features or props here. Add them to ActiveScopePicker /
// ActiveContextButton.

"use client";

import { ActiveScopePicker } from "@/features/scopes/components/active-context/ActiveScopePicker";
import { ActiveContextButton } from "@/features/scopes/components/active-context/ActiveContextButton";

export interface DirectContextSelectionProps {
  defaultExpanded?: boolean;
}

export function DirectContextSelection({
  defaultExpanded = false,
}: DirectContextSelectionProps) {
  return (
    <>
      <div className="shell-ctx-inline">
        <ActiveScopePicker defaultExpanded={defaultExpanded} />
      </div>
      <div className="shell-ctx-collapsed">
        <ActiveContextButton size="sm" align="start" iconOnly />
      </div>
    </>
  );
}

export default DirectContextSelection;
