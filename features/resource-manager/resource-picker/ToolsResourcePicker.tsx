"use client";

import { RunToolPicker } from "@/features/agents/components/inputs/smart-input/RunToolPicker";
import {
  RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";

interface ToolsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

export function ToolsResourcePicker({
  conversationId,
  onBack,
}: ToolsResourcePickerProps) {
  return (
    <div
      className={`flex ${RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS} flex-col`}
    >
      <ResourcePickerSubViewHeader title="Tools" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <RunToolPicker conversationId={conversationId} />
      </div>
    </div>
  );
}
