"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const MapBlock = dynamic(() => import("@/components/mardown-display/blocks/map/MapBlock"), { ssr: false, loading: () => <MatrxMiniLoader /> });

/** Unified renderer for `map` artifacts — forwards the raw payload to MapBlock. */
export default function MapArtifact({ raw, data, isStreamActive }: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <MapBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
