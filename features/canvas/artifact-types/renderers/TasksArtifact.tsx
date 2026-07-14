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
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { isMaterializedArtifactId } from "../artifactId";
import { type ArtifactRendererProps } from "../artifact-renderers";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";

/**
 * Unified renderer for `tasks` — a DATA-TOUCHING artifact (vision R7).
 *
 * Tasks are NEVER auto-created. The materialized artifact is a *tracked
 * proposal*: it shows the agent's checklist plus an explicit **Convert to
 * tasks** action. Convert creates real `workspace.tasks` via the canonical
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
  // Kind-routed blocks (task_list) deliver the checklist markdown as
  // serverData `{ content }` — a JSON __kind arrival has JSON in `raw`, so the
  // bridge output is the only renderable text for that path.
  const bridgedContent =
    typeof data === "object" &&
    data !== null &&
    typeof (data as { content?: unknown }).content === "string"
      ? (data as { content: string }).content
      : null;
  const content = bridgedContent ?? (typeof data === "string" ? data : raw);
  const materialized = isMaterializedArtifactId(artifactId);

  // Pre-materialization (streaming / inline): there is no persisted artifact to
  // link against yet, so show the proposed checklist only. Only bail on empty
  // content HERE — the materialized path below self-loads its checklist
  // markdown from the canvas row (via `useCanvasItem`), so it must not be gated
  // on a `content`/`raw` prop the canvas never passes (canvas opens with
  // `data: { artifactId }`, no raw string). Bailing early was why an opened
  // canvas panel for a materialized tasks artifact rendered blank (FOUND_DEFECTS
  // D49 — same class as the table fix).
  if (!materialized) {
    if (!content) return null;
    return <TaskChecklist content={content} hideTitle hideActions />;
  }

  return (
    <TasksArtifactMaterialized
      canvasItemId={artifactId as string}
      fallbackContent={content ?? ""}
      conversationId={conversationId}
    />
  );
}

/**
 * Materialized wrapper — self-loads the checklist markdown from the persisted
 * canvas row (mirrors `TableArtifactMaterialized`'s row-backed `content`
 * useMemo) since `TasksArtifactTracked` takes `content` as a required prop and
 * does not read the row itself.
 */
function TasksArtifactMaterialized({
  canvasItemId,
  fallbackContent,
  conversationId,
}: {
  canvasItemId: string;
  fallbackContent: string;
  conversationId?: string;
}) {
  const { row, loading } = useCanvasItem(canvasItemId);

  const content = useMemo(() => {
    const stored = row?.content as
      | { data?: unknown }
      | string
      | null
      | undefined;
    if (
      stored &&
      typeof stored === "object" &&
      "data" in stored &&
      typeof stored.data === "string"
    ) {
      return stored.data;
    }
    if (typeof stored === "string") return stored;
    return fallbackContent;
  }, [row, fallbackContent]);

  if (loading && !row) {
    return <MatrxMiniLoader />;
  }

  if (!content) return null;

  return (
    <TasksArtifactTracked
      content={content}
      canvasItemId={canvasItemId}
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
            // Canonical discriminator after 2026 schema reorg: workspace.tasks → "tasks"
            externalSystem: "tasks",
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
