"use client";

import { Suspense } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { FlashcardsBlockData } from "@ai-matrx/agents/generated/stream-events";
import { artifactDedupKey } from "../artifact-renderers";
import {
  isMaterializedArtifactId,
  readArtifactPointerId,
} from "../artifactId";
import FlashcardsBlock from "@/components/mardown-display/blocks/flashcards/FlashcardsBlock";
import { CanvasFlashcardsView as CanvasFlashcardsView } from "@/features/flashcards/components/CanvasFlashcardsView";
import type { ArtifactRendererProps } from "../types";
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
  metadata,
  isStreamActive,
}: ArtifactRendererProps) {
  const pointerArtifactId = readArtifactPointerId(data);

  const resolvedArtifactId = isMaterializedArtifactId(artifactId)
    ? artifactId
    : (pointerArtifactId ?? artifactId);

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

  // Still being written only while the stream is live AND this artifact's own
  // region has not closed. A closed `<artifact>`, a saved row (no stream
  // flag) or an ended stream — however it ended — is settled.
  const streaming = isStreamActive === true && metadata?.isComplete !== true;

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
        isStreamActive={streaming}
      />
    </Suspense>
  );
}
