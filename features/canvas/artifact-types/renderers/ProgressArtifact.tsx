"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseProgressMarkdown } from "@/components/mardown-display/blocks/progress/parseProgressMarkdown";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";
import type { ProgressTrackerState } from "@/components/mardown-display/blocks/progress/ProgressTrackerBlock";

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
  const { state, loaded, save } = useArtifactState<ProgressTrackerState & Record<string, unknown>>(
    artifactId,
    "generic",
  );

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

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (artifactId && !loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ProgressTrackerBlock
        tracker={tracker}
        taskId={artifactDedupKey(taskId, artifactId)}
        initialState={state ?? undefined}
        onStateChange={save as (state: ProgressTrackerState) => void}
      />
    </Suspense>
  );
}
