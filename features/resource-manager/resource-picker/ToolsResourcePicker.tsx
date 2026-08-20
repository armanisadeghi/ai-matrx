"use client";

import { RunToolPicker } from "@/features/agents/components/inputs/smart-input/RunToolPicker";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface ToolsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

export function ToolsResourcePicker({
  conversationId,
  onBack,
}: ToolsResourcePickerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ResourcePickerSubViewHeader title="Tools" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <RunToolPicker conversationId={conversationId} />
      </div>
    </div>
  );
}
