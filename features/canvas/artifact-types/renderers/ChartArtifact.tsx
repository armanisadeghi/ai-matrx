"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const ChartBlock = lazy(
  () => import("@/components/mardown-display/blocks/chart/ChartBlock"),
);

/**
 * Unified renderer for `chart` artifacts — a data visualization (JSON spec →
 * recharts) is durable, referenceable content, so it materializes. ChartBlock
 * parses its own JSON spec; this adapter forwards the payload across chat /
 * canvas / artifact-card surfaces.
 */
export default function ChartArtifact({
  raw,
  data,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <ChartBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
