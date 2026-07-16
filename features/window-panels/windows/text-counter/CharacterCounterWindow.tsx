"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CharacterCounter } from "@/features/text-counter/CharacterCounter";

export interface CharacterCounterWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
}

export default function CharacterCounterWindow({ isOpen, onClose, initialText }: CharacterCounterWindowProps) {
  if (!isOpen) return null;
  return (
    <WindowPanel id="character-counter-window" overlayId="characterCounterWindow" title="Character Counter" onClose={onClose} width={980} height={720} minWidth={520} minHeight={440} bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
      <CharacterCounter initialText={initialText} className="h-full" compact />
    </WindowPanel>
  );
}
