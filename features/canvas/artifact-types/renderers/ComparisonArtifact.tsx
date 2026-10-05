"use client";

import React, { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseComparisonJSON } from "@/components/mardown-display/blocks/comparison/parseComparisonJSON";
import { resolveJsonPayload, artifactDedupKey } from "../artifact-renderers";
import type { ArtifactRendererProps } from "../types";
import { useBlockState } from "@/features/block-state/useBlockState";
import type { ComparisonTableState } from "@/components/mardown-display/blocks/comparison/ComparisonTableBlock";
import ComparisonTableBlock from "@/components/mardown-display/blocks/comparison/ComparisonTableBlock";

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
  conversationId,
  messageId,
  blockIndex,
}: ArtifactRendererProps) {
  const { state, loaded, patch: save } = useBlockState<
    ComparisonTableState & Record<string, unknown>
  >();

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
  if (!loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ComparisonTableBlock
        comparison={comparison}
        taskId={artifactDedupKey(taskId, artifactId)}
        artifactId={artifactId}
        conversationId={conversationId}
        messageId={messageId}
        blockIndex={blockIndex}
        initialState={state ?? undefined}
        onStateChange={save as (state: ComparisonTableState) => void}
      />
    </Suspense>
  );
}
