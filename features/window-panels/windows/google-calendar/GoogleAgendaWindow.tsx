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

import { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AgendaPanel } from "@/features/google-workspace/calendar/AgendaPanel";
import { SelectedCalendarReview } from "@/features/google-workspace/calendar/SelectedCalendarReview";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [view, setView] = useState("agenda");
  if (!isOpen) return null;
  return (
    <WindowPanel
      id={id}
      overlayId="googleAgendaWindow"
      title="Calendar"
      width={520}
      height={620}
      minWidth={340}
      minHeight={280}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <Tabs
        value={view}
        onValueChange={setView}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-2 mt-2 grid h-auto grid-cols-2">
          <TabsTrigger value="agenda" className="min-h-9 text-xs">
            Agenda
          </TabsTrigger>
          <TabsTrigger value="selected" className="min-h-9 text-xs">
            Selected calendar
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value="agenda"
          className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <AgendaPanel
            title="Next up"
            variant="bare"
            className="min-h-0 h-full"
          />
        </TabsContent>
        <TabsContent
          value="selected"
          className="min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
        >
          <SelectedCalendarReview />
        </TabsContent>
      </Tabs>
    </WindowPanel>
  );
}

export default GoogleAgendaWindow;
