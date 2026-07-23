"use client";

import { ActiveDrillDeck } from "@/features/scopes/components/active-context/drill-deck/ActiveDrillDeck";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export interface DrillDeckContextWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Compact Surface-A working-context window. The body is the canonical
 * Drill Deck; WindowPanel owns all surrounding chrome and window behavior.
 */
export function DrillDeckContextWindow({
  isOpen,
  onClose,
}: DrillDeckContextWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id="drill-deck-context-window"
      title="Working Context"
      onClose={onClose}
      minWidth={300}
      minHeight={360}
      width={380}
      height={560}
      position="center"
      overlayId="drillDeckContextWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <ActiveDrillDeck className="h-full rounded-none border-0" />
    </WindowPanel>
  );
}
