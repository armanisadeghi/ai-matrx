"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  type ArtifactRendererProps,
  artifactDedupKey,
} from "../artifact-renderers";

const TasksBlock = lazy(
  () => import("@/components/mardown-display/blocks/tasks/TasksBlock"),
);

/**
 * Unified renderer for `tasks`. TasksBlock parses its own raw content
 * (markdown checklist), so this adapter doesn't pre-parse — it forwards the
 * raw string directly. The `taskId` / `artifactId` pair is resolved to a
 * stable dedup key via `artifactDedupKey` and forwarded as `messageId`
 * (the closest TasksBlock prop for provenance linkage).
 */
export default function TasksArtifact({
  raw,
  data,
  taskId,
  artifactId,
  conversationId,
  messageId,
  blockIndex,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;

  if (!content) return null;

  // TasksBlock accepts: content, messageId, conversationId, blockIndex.
  // Pass messageId as-is when available; fall back to the artifact dedup key
  // so the chip row has a stable provenance anchor.
  const effectiveMessageId =
    messageId ?? artifactDedupKey(taskId, artifactId);

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TasksBlock
        content={content}
        messageId={effectiveMessageId}
        conversationId={conversationId}
        blockIndex={blockIndex}
      />
    </Suspense>
  );
}
