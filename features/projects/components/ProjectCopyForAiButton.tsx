"use client";

import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { fetchProjectExportBundle } from "@/features/tasks/services/aiExportService";
import { serializeProjectForAi } from "@/features/tasks/utils/serializeProjectTaskForAi";
import { recordUnavailable } from "@/lib/records/recordUnavailable";

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
          throw recordUnavailable({
            entity: "project",
            reason: "unknown",
            recordId: projectId,
            token: "project",
          });
        }
        return serializeProjectForAi(bundle, location);
      }}
    />
  );
}
