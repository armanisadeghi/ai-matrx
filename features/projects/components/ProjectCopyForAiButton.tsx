"use client";

import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { fetchProjectExportBundle } from "@/features/tasks/services/aiExportService";
import { serializeProjectForAi } from "@/features/tasks/utils/serializeProjectTaskForAi";

export function ProjectCopyForAiButton({
  projectId,
  projectName,
  location,
  size = "sm",
  className,
  showLabel = true,
  disabled,
}: {
  projectId: string;
  projectName?: string;
  location: string;
  size?: "icon" | "sm";
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
}) {
  const label = projectName?.trim() || "Project";

  return (
    <CopyForAiButton
      label={label}
      size={size}
      className={className}
      showLabel={showLabel}
      disabled={disabled}
      agent={async () => {
        const bundle = await fetchProjectExportBundle(projectId);
        if (!bundle) {
          throw new Error("Project not found");
        }
        return serializeProjectForAi(bundle, location);
      }}
    />
  );
}
