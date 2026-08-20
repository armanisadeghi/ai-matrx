"use client";

import { RunSkillPicker } from "@/features/agents/components/inputs/smart-input/RunSkillPicker";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface SkillsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

export function SkillsResourcePicker({
  conversationId,
  onBack,
}: SkillsResourcePickerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ResourcePickerSubViewHeader title="Skills" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <RunSkillPicker conversationId={conversationId} />
      </div>
    </div>
  );
}
