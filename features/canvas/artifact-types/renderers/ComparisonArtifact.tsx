"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseComparisonJSON } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";
import {
  type ArtifactRendererProps,
  resolveJsonPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";
import type { ComparisonTableState } from "@/components/mardown-display/blocks/comparison/ComparisonTableBlock";

const ComparisonTableBlock = lazy(
  () => import("@/components/mardown-display/blocks/comparison/ComparisonTableBlock"),
);

/**
 * Unified renderer for `comparison` (comparison_table) artifacts — the ONE
 * renderer used by chat, canvas, and artifact-card surfaces. Resolves the
 * payload (serverData ?? canvas object ?? parsed raw JSON) and renders the real
 * ComparisonTableBlock.
 */
export default function ComparisonArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const { state, loaded, save } = useArtifactState<
    ComparisonTableState & Record<string, unknown>
  >(artifactId, "generic");

  const comparison = useMemo(
    () =>
      resolveJsonPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseComparisonJSON,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!comparison) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (artifactId && !loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ComparisonTableBlock
        comparison={comparison}
        taskId={artifactDedupKey(taskId, artifactId)}
        initialState={state ?? undefined}
        onStateChange={save as (state: ComparisonTableState) => void}
      />
    </Suspense>
  );
}
