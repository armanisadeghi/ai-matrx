"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import {
  type ArtifactRendererProps,
  artifactDedupKey,
} from "../artifact-renderers";
import { isMaterializedArtifactId } from "../artifactId";

const FlashcardsBlock = lazy(
  () =>
    import("@/components/mardown-display/blocks/flashcards/FlashcardsBlock"),
);

const CanvasFlashcardsView = lazy(() =>
  import("@/features/flashcards/components/CanvasFlashcardsView").then((m) => ({
    default: m.CanvasFlashcardsView,
  })),
);

export default function FlashcardsArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  mode,
  conversationId,
  messageId,
  blockIndex,
}: ArtifactRendererProps) {
  const pointerArtifactId =
    data &&
    typeof data === "object" &&
    data !== null &&
    "artifactId" in data &&
    typeof (data as { artifactId?: string }).artifactId === "string"
      ? (data as { artifactId: string }).artifactId
      : undefined;

  const resolvedArtifactId = isMaterializedArtifactId(artifactId)
    ? artifactId
    : isMaterializedArtifactId(pointerArtifactId)
      ? pointerArtifactId
      : artifactId;

  const content = typeof data === "string" ? data : raw;

  const sd =
    (serverData as FlashcardsBlockData | undefined) ??
    (data && typeof data !== "string" && !("artifactId" in (data as object))
      ? (data as FlashcardsBlockData)
      : undefined);

  if (mode === "canvas") {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <CanvasFlashcardsView
          artifactId={resolvedArtifactId}
          content={typeof content === "string" ? content : undefined}
          serverData={sd}
          conversationId={conversationId}
          messageId={messageId}
        />
      </Suspense>
    );
  }

  if (!content && !sd) return null;

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <FlashcardsBlock
        content={typeof content === "string" ? content : undefined}
        serverData={sd}
        taskId={artifactDedupKey(taskId, resolvedArtifactId)}
        artifactId={resolvedArtifactId}
        messageId={messageId}
        conversationId={conversationId}
        blockIndex={blockIndex}
      />
    </Suspense>
  );
}
