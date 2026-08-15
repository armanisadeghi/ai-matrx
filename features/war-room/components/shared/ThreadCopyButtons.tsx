"use client";

// features/war-room/components/shared/ThreadCopyButtons.tsx
//
// The tile's copy control — ONE dropdown, not two AI buttons.
//
// What it fixes: `ThreadCopyForAiButton` exports the tile's ANCHORED project
// or task and renders `null` when the tile has neither, so a canvas tile full
// of notes, files and recordings had no copy path at all. This control always
// renders: the plain click copies the TILE as rendered (identity, anchor,
// active tab, every attached resource), and the anchored project/task export
// is preserved as a menu variant rather than deleted — same
// `aiExportService` bundle, same serializer, now reachable from one control
// alongside a human Copy and a JSON copy the tile never had.

import { useAppSelector } from "@/lib/redux/hooks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type { AiVariant } from "@/components/agent-copy/AiCopyMenu";
import {
  fetchProjectExportBundle,
  fetchTaskExportBundle,
} from "@/features/tasks/services/aiExportService";
import {
  serializeProjectForAi,
  serializeTaskForAi,
} from "@/features/tasks/utils/serializeProjectTaskForAi";
import {
  selectAssignmentsByContainer,
  selectSessionById,
  selectThreadById,
  selectThreadUserStateById,
} from "@/features/war-room/redux/selectors";
import { containerKey } from "@/features/war-room/types";
import type { WarRoomAssignment } from "@/features/war-room/types";
import {
  buildThreadPayload,
  threadRow,
  threadSummary,
  type ThreadCopyInput,
} from "@/features/war-room/lib/copy";
import { threadDisplayTitle } from "@/features/war-room/utils/threadDisplayTitle";
import { useThreadCopyForAiTarget } from "./ThreadCopyForAiButton";

const NO_ASSIGNMENTS: WarRoomAssignment[] = [];

export function ThreadCopyButtons({
  threadId,
  sessionId,
  className,
  size = "xs",
}: {
  threadId: string;
  sessionId?: string | null;
  className?: string;
  size?: "xs" | "icon" | "sm";
}) {
  const thread = useAppSelector(selectThreadById(threadId));
  // The thread row carries no room FK (the room→thread edge lives in
  // associations), so the room comes from the mount that renders the tile.
  const session = useAppSelector(selectSessionById(sessionId ?? null));
  const userStateById = useAppSelector(selectThreadUserStateById);
  const assignmentsByContainer = useAppSelector(selectAssignmentsByContainer);
  // The anchored project/task, resolved exactly as the legacy button did.
  const anchorTarget = useThreadCopyForAiTarget(threadId);

  if (!thread) return null;

  const gather = (): ThreadCopyInput => ({
    thread,
    session,
    assignments:
      assignmentsByContainer[containerKey("thread", threadId)] ??
      NO_ASSIGNMENTS,
    isPinned: userStateById[threadId]?.isPinned ?? false,
    isHidden: userStateById[threadId]?.isHidden ?? false,
    anchorTaskTitle:
      anchorTarget?.kind === "task" ? anchorTarget.name : undefined,
  });

  // The anchored entity's FULL tree (subtasks, comments, attachments, linked
  // notes) — a genuinely different and much larger payload than the tile, so
  // it earns its own menu entry rather than being folded into the default.
  const anchorVariants: AiVariant[] = anchorTarget
    ? [
        {
          id: `anchor-${anchorTarget.kind}`,
          label:
            anchorTarget.kind === "project"
              ? "Anchored project (full tree)"
              : "Anchored task (full tree)",
          hint:
            anchorTarget.kind === "project"
              ? "The whole project: tasks, subtasks, comments, notes"
              : "The whole task: subtasks, comments, attachments, notes",
          build: async () => {
            const location = `War Room — ${session?.title ?? "thread"} tile`;
            if (anchorTarget.kind === "project") {
              const bundle = await fetchProjectExportBundle(anchorTarget.id);
              if (!bundle) throw new Error("Project not found");
              return serializeProjectForAi(bundle, location);
            }
            const bundle = await fetchTaskExportBundle(anchorTarget.id);
            if (!bundle) throw new Error("Task not found");
            return serializeTaskForAi(bundle, location);
          },
        },
      ]
    : [];

  return (
    <CopyButtons
      size={size}
      className={className}
      label={threadDisplayTitle(
        thread,
        anchorTarget?.kind === "task" ? anchorTarget.name : undefined,
      )}
      human={() => threadSummary(gather())}
      json={() => threadRow(gather())}
      agent={() => buildThreadPayload(gather())}
      agentVariant={{
        id: "this-tile",
        label: "This tile",
        hint: "The tile as rendered — anchor, tab and attached resources",
        position: "first",
      }}
      aiVariants={anchorVariants}
    />
  );
}
