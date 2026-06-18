"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseTroubleshootingMarkdown } from "@/components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";

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

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TroubleshootingBlock
        troubleshooting={troubleshooting}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
