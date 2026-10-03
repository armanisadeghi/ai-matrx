"use client";

import { RunToolPicker } from "@ai-matrx/chat/agents/components/inputs/smart-input/RunToolPicker";
import { PickerView } from "./ResourcePickerSubViewHeader";

interface ToolsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

/** Back sits beside the picker's own search box — no title row. */
export function ToolsResourcePicker({
  conversationId,
  onBack,
}: ToolsResourcePickerProps) {
  return (
    <PickerView className="overflow-hidden">
      <RunToolPicker conversationId={conversationId} onBack={onBack} />
    </PickerView>
  );
}
