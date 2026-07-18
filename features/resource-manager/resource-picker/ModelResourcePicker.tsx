"use client";

import { RunModelPicker } from "@/features/agents/components/run-controls/RunModelPicker";
import {
  RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";

interface ModelResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

export function ModelResourcePicker({
  conversationId,
  onBack,
}: ModelResourcePickerProps) {
  return (
    <div
      className={`flex ${RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS} flex-col`}
    >
      <ResourcePickerSubViewHeader title="Model" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <RunModelPicker conversationId={conversationId} />
      </div>
    </div>
  );
}
