"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const StructuredPlanBlock = lazy(
  () => import("@/components/mardown-display/blocks/plan/StructuredPlanBlock"),
);

/**
 * Unified renderer for `structured_info` artifacts (transcription + tasks
 * combined). Durable structured content → materializes (persisted, versioned,
 * render-by-id). Renders the existing StructuredPlanBlock viewer. Edit mode +
 * domain sync are the next adapter layer — see FEATURE.md.
 */
export default function StructuredInfoArtifact({
  raw,
  data,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StructuredPlanBlock content={content} />
    </Suspense>
  );
}
