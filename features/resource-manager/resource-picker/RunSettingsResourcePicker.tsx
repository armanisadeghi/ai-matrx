"use client";

import { RunSettingsEditor } from "@/features/agents/components/run-controls/RunSettingsEditor";
import {
  RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";

interface RunSettingsResourcePickerProps {
  conversationId: string;
  onBack: () => void;
}

/** Settings tab content without model — model lives in the attach menu footer. */
export function RunSettingsResourcePicker({
  conversationId,
  onBack,
}: RunSettingsResourcePickerProps) {
  return (
    <div
      className={`flex ${RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS} flex-col`}
    >
      <ResourcePickerSubViewHeader title="Settings" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        <RunSettingsEditor conversationId={conversationId} />
      </div>
    </div>
  );
}
