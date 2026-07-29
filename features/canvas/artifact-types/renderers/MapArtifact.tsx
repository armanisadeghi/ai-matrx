"use client";

import { Suspense } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "../types";
import MapBlock from "@/components/mardown-display/blocks/map/MapBlock";

/** Unified renderer for `map` artifacts — forwards the raw payload to MapBlock. */
export default function MapArtifact({
  raw,
  data,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <MapBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
