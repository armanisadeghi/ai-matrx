"use client";

/**
 * features/window-panels/windows/google-calendar/GoogleAgendaWindow.tsx
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT. The body is `AgendaPanel` — the same
 * component the home screen and the Person record render — in `variant="bare"`,
 * because the window IS the chrome and a second border around a component that
 * carries its own is the wrapper defect. There is no calendar logic in this file
 * and there must never be: a bespoke body here would drift from the home
 * screen's the first time either changed.
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgendaPanel } from "@/features/google-workspace/calendar/AgendaPanel";

export interface GoogleAgendaWindowProps {
  isOpen: boolean;
  onClose?: () => void;
  id?: string;
}

export function GoogleAgendaWindow({
  isOpen,
  onClose,
  id = "google-agenda-window",
}: GoogleAgendaWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel
      id={id}
      overlayId="googleAgendaWindow"
      title="Agenda"
      width={520}
      height={620}
      minWidth={340}
      minHeight={280}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <AgendaPanel
        // The window's own header already names it; a second heading inside the
        // body would say "Agenda" twice.
        title="Next up"
        variant="bare"
        className="min-h-0 flex-1"
      />
    </WindowPanel>
  );
}

export default GoogleAgendaWindow;
