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

/**
 * Unified renderer for `flashcards`. FlashcardsBlock parses its own raw content
 * (markdown), so this adapter doesn't pre-parse — it forwards `serverData` when
 * present, otherwise the raw string. (Study-progress persistence is wired in
 * Wave D via the flashcards adapter; this Wave B step unifies rendering only.)
 */
export default function FlashcardsArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  const sd =
    (serverData as FlashcardsBlockData | undefined) ??
    (data && typeof data !== "string"
      ? (data as FlashcardsBlockData)
      : undefined);

  if (!content && !sd) return null;

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
