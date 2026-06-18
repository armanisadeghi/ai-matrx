"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseProgressMarkdown } from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";

const ProgressTrackerBlock = lazy(
  () => import("@/components/mardown-display/blocks/progress/ProgressTrackerBlock"),
);

/**
 * Unified renderer for `progress` (progress_tracker) artifacts — the ONE
 * renderer used by chat, canvas, and artifact-card surfaces. Resolves the
 * payload (serverData ?? canvas object ?? parsed raw markdown) and renders the
 * real ProgressTrackerBlock.
 */
export default function ProgressArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const tracker = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseProgressMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!tracker) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ProgressTrackerBlock
        tracker={tracker}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
