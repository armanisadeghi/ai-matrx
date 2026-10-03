"use client";

import { RunSkillPicker } from "@ai-matrx/chat/agents/components/inputs/smart-input/RunSkillPicker";
import { PickerView } from "./ResourcePickerSubViewHeader";

interface SkillsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

/** Back sits beside the picker's own search box — no title row. */
export function SkillsResourcePicker({
  conversationId,
  onBack,
}: SkillsResourcePickerProps) {
  return (
    <PickerView className="overflow-hidden">
      <RunSkillPicker conversationId={conversationId} onBack={onBack} />
    </PickerView>
  );
}
