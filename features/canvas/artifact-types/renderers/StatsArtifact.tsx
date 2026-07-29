"use client";

import { Suspense } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import StatsBlock from "@/components/mardown-display/blocks/stats/StatsBlock";
import type { ArtifactRendererProps } from "../types";

/** Unified renderer for `stats` artifacts — forwards the raw payload to StatsBlock. */
export default function StatsArtifact({
  raw,
  data,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StatsBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
