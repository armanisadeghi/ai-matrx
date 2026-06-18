"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseResearchMarkdown } from "@/components/mardown-display/blocks/research/parseResearchMarkdown";
import {
  type ArtifactRendererProps,
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";

const ResearchBlock = lazy(
  () => import("@/components/mardown-display/blocks/research/ResearchBlock"),
);

/**
 * Unified renderer for `research` artifacts — the ONE renderer used by chat,
 * canvas, and artifact-card surfaces. Resolves the payload (serverData ?? canvas
 * object ?? parsed raw markdown) and renders the real ResearchBlock.
 */
export default function ResearchArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const research = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseResearchMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!research) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ResearchBlock
        research={research}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
