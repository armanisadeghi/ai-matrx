"use client";

import { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseTimelineMarkdown } from "@/components/mardown-display/blocks/timeline/parseTimelineMarkdown";
import {
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import TimelineBlock from "@/components/mardown-display/blocks/timeline/TimelineBlock";
import type { ArtifactRendererProps } from "../types";
/**
 * Unified renderer for `timeline` artifacts — the ONE renderer used by chat,
 * canvas, and artifact-card surfaces. Resolves the payload (serverData ?? canvas
 * object ?? parsed raw markdown) and renders the real TimelineBlock.
 */
export default function TimelineArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const timeline = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseTimelineMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!timeline) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TimelineBlock
        timeline={timeline}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
