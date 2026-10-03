"use client";

import { RunSkillPicker } from "@ai-matrx/chat/agents/components/inputs/smart-input/RunSkillPicker";
import { PickerView, ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface SkillsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

/** The attach menu's Skills view: Back + THE Skills surface (RunSkillPicker). */
export function SkillsResourcePicker({
  conversationId,
  onBack,
}: SkillsResourcePickerProps) {
  return (
    <PickerView className="overflow-hidden">
      <ResourcePickerSubViewHeader title="Skills" onBack={onBack} />
      <RunSkillPicker conversationId={conversationId} />
    </PickerView>
  );
}
