"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ListPlus } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchTasksForEntity,
  selectTasksForEntity,
} from "@/features/tasks/redux/taskAssociationsSlice";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { parseMarkdownChecklist } from "@/components/mardown-display/blocks/tasks/tasklist-parser";
import TaskChecklist from "@/components/mardown-display/blocks/tasks/TaskChecklist";
import TaskChipRow from "@/features/tasks/widgets/TaskChipRow";
import TaskPreviewWindow from "@/features/tasks/components/TaskPreviewWindow";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isMaterializedArtifactId } from "../artifactId";
import { type ArtifactRendererProps } from "../artifact-renderers";

/**
 * Unified renderer for `tasks` — a DATA-TOUCHING artifact (vision R7).
 *
 * Tasks are NEVER auto-created. The materialized artifact is a *tracked
 * proposal*: it shows the agent's checklist plus an explicit **Convert to
 * tasks** action. Convert creates real `ctx_tasks` via the canonical
 * `platform.associations` bridge (`associate_with_task`: source=`artifact`,
 * target=`task`) — the SAME path `TaskPreviewWindow` / `TaskChipRow` use everywhere
 * else — so there is exactly one task-linkage model, not a parallel one.
 *
 * After Convert the real tasks are the source of truth and the artifact is a
 * live mirror of them (`TaskChipRow` reflects their status; edits round-trip
 * through the normal task surfaces).
 */

const ARTIFACT_ENTITY = "artifact";

export default function TasksArtifact({
  raw,
  data,
  artifactId,
  conversationId,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;

  // Pre-materialization (streaming / inline): there is no persisted artifact to
  // link against yet, so show the proposed checklist only. Convert appears once
  // the block has materialized into a `canvas_items` row (a real UUID id).
  if (!isMaterializedArtifactId(artifactId)) {
    return <TaskChecklist content={content} hideTitle hideActions />;
  }

  return (
    <TasksArtifactTracked
      content={content}
      canvasItemId={artifactId as string}
      conversationId={conversationId}
    />
  );
}

function TasksArtifactTracked({
  content,
  canvasItemId,
  conversationId,
}: {
  content: string;
  canvasItemId: string;
  conversationId?: string;
}) {
  const dispatch = useAppDispatch();
  const linkedTasks = useAppSelector(
    selectTasksForEntity(ARTIFACT_ENTITY, canvasItemId),
  );
  const [convertOpen, setConvertOpen] = useState(false);
  const parsedItems = useMemo(() => parseMarkdownChecklist(content), [content]);

  // Reverse lookup: which real tasks were created from this artifact. Idempotent
  // (cached per entity key in the slice).
  useEffect(() => {
    dispatch(
      fetchTasksForEntity({
        entityType: ARTIFACT_ENTITY,
        entityId: canvasItemId,
      }),
    );
  }, [dispatch, canvasItemId]);

  const isLinked = linkedTasks.length > 0;

  return (
    <div className="space-y-2">
      <TaskChecklist content={content} hideTitle hideActions />

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-1 pt-2">
        {isLinked ? (
          <TaskChipRow
            entityType={ARTIFACT_ENTITY}
            entityId={canvasItemId}
            label="Tasks from this artifact"
            size="xs"
          />
        ) : (
          <>
            <span className="text-xs text-muted-foreground">
              Proposed — not yet tracked as tasks
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-xs"
              onClick={() => setConvertOpen(true)}
            >
              <ListPlus className="h-3.5 w-3.5" />
              Convert to tasks
            </Button>
          </>
        )}
      </div>

      <TaskPreviewWindow
        open={convertOpen}
        onOpenChange={setConvertOpen}
        parsedItems={parsedItems}
        source={{
          entity_type: ARTIFACT_ENTITY,
          entity_id: canvasItemId,
          metadata: conversationId
            ? { source_conversation_id: conversationId }
            : undefined,
        }}
        onCreated={(ids) => {
          // The association rows are the task truth; stamp the artifact's
          // external link so discovery + the model's context can see it's
          // converted without a join. Non-blocking — the link is a convenience
          // marker, the associations already exist.
          void canvasArtifactService.setExternalLink(canvasItemId, {
            externalSystem: "ctx_tasks",
            externalId: canvasItemId,
          });
          toast.success(
            `Converted to ${ids.length} task${ids.length !== 1 ? "s" : ""}`,
            { description: "Open /tasks to view or edit — status stays in sync here." },
          );
        }}
      />
    </div>
  );
}
