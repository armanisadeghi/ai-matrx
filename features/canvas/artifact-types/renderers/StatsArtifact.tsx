"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const StatsBlock = dynamic(() => import("@/components/mardown-display/blocks/stats/StatsBlock"), { ssr: false, loading: () => <MatrxMiniLoader /> });

/** Unified renderer for `stats` artifacts — forwards the raw payload to StatsBlock. */
export default function StatsArtifact({ raw, data, isStreamActive }: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StatsBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
