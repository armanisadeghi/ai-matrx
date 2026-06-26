"use client";

import type { ComponentType } from "react";
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
  icon,
  compact,
}: {
  taskId: string;
  taskTitle?: string;
  location: string;
  size?: "icon" | "sm";
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
  icon?: ComponentType<{ className?: string }>;
  compact?: boolean;
}) {
  const label = taskTitle?.trim() || "Task";

  return (
    <CopyForAiButton
      label={label}
      size={size}
      className={className}
      showLabel={showLabel}
      disabled={disabled}
      icon={icon}
      compact={compact}
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
