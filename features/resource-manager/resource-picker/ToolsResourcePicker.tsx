"use client";

import { RunToolPicker } from "@ai-matrx/chat/agents/components/inputs/smart-input/RunToolPicker";
import { PickerView, ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

interface ToolsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

/** The attach menu's Tools view: Back + THE Tools surface (RunToolPicker). */
export function ToolsResourcePicker({
  conversationId,
  onBack,
}: ToolsResourcePickerProps) {
  return (
    <PickerView className="overflow-hidden">
      <ResourcePickerSubViewHeader title="Tools" onBack={onBack} />
      <RunToolPicker conversationId={conversationId} />
    </PickerView>
  );
}
