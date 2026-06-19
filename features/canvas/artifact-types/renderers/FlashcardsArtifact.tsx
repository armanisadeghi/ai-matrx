"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { FlashcardsBlockData } from "@/types/python-generated/stream-events";
import {
  type ArtifactRendererProps,
  artifactDedupKey,
} from "../artifact-renderers";

const FlashcardsBlock = lazy(
  () => import("@/components/mardown-display/blocks/flashcards/FlashcardsBlock"),
);

// Canvas mode = the full STUDY experience, which persists per-card reviews via
// useFlashcardStudy → user_flashcard_reviews (the set is created on materialize
// by the flashcards adapter). The inline/artifact mode is the lightweight viewer.
const CanvasFlashcardsView = lazy(() =>
  import("@/features/flashcards/components/CanvasFlashcardsView").then((m) => ({
    default: m.CanvasFlashcardsView,
  })),
);

/**
 * Unified renderer for `flashcards`. FlashcardsBlock / CanvasFlashcardsView parse
 * their own raw markdown content, so this adapter forwards `serverData` when
 * present, otherwise the raw string.
 *
 * - mode === "canvas" → CanvasFlashcardsView (study mode, persists progress)
 * - else             → FlashcardsBlock (inline viewer)
 */
export default function FlashcardsArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  mode,
  conversationId,
  messageId,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  const sd =
    (serverData as FlashcardsBlockData | undefined) ??
    (data && typeof data !== "string"
      ? (data as FlashcardsBlockData)
      : undefined);

  if (!content && !sd) return null;

  if (mode === "canvas") {
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <CanvasFlashcardsView
          content={content}
          serverData={sd}
          conversationId={conversationId}
          messageId={messageId}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <FlashcardsBlock
        content={content}
        serverData={sd}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
