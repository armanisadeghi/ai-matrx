"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const DiffBlock = lazy(() => import("@/components/mardown-display/blocks/diff/DiffBlock"));

/** Unified renderer for `diff` artifacts — forwards the raw payload to DiffBlock. */
export default function DiffArtifact({ raw, data, isStreamActive }: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <DiffBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
