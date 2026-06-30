"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { ProjectCopyForAiButton } from "@/features/projects/components/ProjectCopyForAiButton";
import { useUserProjects } from "@/features/projects/hooks";
import { selectSessionProjectId } from "@/features/war-room/redux/selectors";

/** Room-level project export — visible when the whole room is tied to one project. */
export function RoomProjectCopyForAiButton({
  sessionId,
}: {
  sessionId: string;
}) {
  const roomProjectId = useAppSelector(selectSessionProjectId(sessionId));
  const { projects } = useUserProjects();
  const projectName =
    roomProjectId && projects.find((p) => p.id === roomProjectId)?.name;

  if (!roomProjectId) return null;

  return (
    <ProjectCopyForAiButton
      projectId={roomProjectId}
      projectName={projectName ?? undefined}
      location="War Room — room project"
      size="icon"
      className="size-7 shrink-0"
    />
  );
}
