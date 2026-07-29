"use client";

import React, { Suspense, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { parseResourcesMarkdown } from "@/components/mardown-display/blocks/resources/parseResourcesMarkdown";
import {
  resolveMarkdownPayload,
  artifactDedupKey,
} from "../artifact-renderers";
import ResourceCollectionBlock from "@/components/mardown-display/blocks/resources/ResourceCollectionBlock";
import type { ArtifactRendererProps } from "../types";
/**
 * Unified renderer for `resources` artifacts — the ONE renderer used by chat,
 * canvas, and artifact-card surfaces. Resolves the payload (serverData ?? canvas
 * object ?? parsed raw markdown) and renders the real ResourceCollectionBlock.
 */
export default function ResourcesArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const collection = useMemo(
    () =>
      resolveMarkdownPayload({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: parseResourcesMarkdown,
      }),
    [serverData, data, raw, isStreamActive],
  );

  if (!collection) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ResourceCollectionBlock
        collection={collection}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
