"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseTroubleshootingMarkdown } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import { useArtifactState } from "../persistence/useArtifactState";
import type { TroubleshootingState } from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock";

const TroubleshootingBlock = lazy(
  () => import("@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock"),
);

/**
 * Unified renderer for `troubleshooting` artifacts — the ONE renderer used by
 * chat, canvas, and artifact-card surfaces. Resolves the payload (serverData ??
 * canvas object ?? parsed raw markdown) and renders the real
 * TroubleshootingBlock.
 */
export default function TroubleshootingArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const { state, loaded, save } = useArtifactState<TroubleshootingState & Record<string, unknown>>(
    artifactId,
    "generic",
  );

  const troubleshooting = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseTroubleshootingMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!troubleshooting) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  // Wait for persisted state to load before rendering so initialState seeds correctly.
  if (artifactId && !loaded) {
    return <MatrxMiniLoader />;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TroubleshootingBlock
        troubleshooting={troubleshooting}
        taskId={artifactDedupKey(taskId, artifactId)}
        initialState={state ?? undefined}
        onStateChange={save as (state: TroubleshootingState) => void}
      />
    </Suspense>
  );
}
