"use client";

import { RunSkillPicker } from "@/features/agents/components/inputs/smart-input/RunSkillPicker";
import {
  RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";

interface SkillsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

export function SkillsResourcePicker({
  conversationId,
  onBack,
}: SkillsResourcePickerProps) {
  return (
    <div
      className={`flex ${RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS} flex-col`}
    >
      <ResourcePickerSubViewHeader title="Skills" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <RunSkillPicker conversationId={conversationId} />
      </div>
    </div>
  );
}
