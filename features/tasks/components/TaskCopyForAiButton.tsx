"use client";

import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { fetchTaskExportBundle } from "@/features/tasks/services/aiExportService";
import { serializeTaskForAi } from "@/features/tasks/utils/serializeProjectTaskForAi";

export function TaskCopyForAiButton({
  taskId,
  taskTitle,
  location,
  size = "sm",
  className,
  showLabel = true,
  disabled,
}: {
  taskId: string;
  taskTitle?: string;
  location: string;
  size?: "icon" | "sm";
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const label = taskTitle?.trim() || "Task";

  return (
    <CopyForAiButton
      label={label}
      size={size}
      className={className}
      showLabel={showLabel}
      disabled={disabled}
      agent={async () => {
        const bundle = await fetchTaskExportBundle(taskId);
        if (!bundle) {
          throw new Error("Task not found");
        }
        return serializeTaskForAi(bundle, location);
      }}
    />
  );
}
