"use client";

import React, { Suspense, lazy, useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  type ArtifactRendererProps,
  resolveJsonPayload,
  artifactDedupKey,
} from "../artifact-renderers";

const Slideshow = lazy(
  () => import("@/components/mardown-display/blocks/presentations/Slideshow"),
);

/** Theme default matching the legacy presentation cases (BlockRenderer / ArtifactBlock). */
const DEFAULT_THEME = { primaryColor: "#2563eb", secondaryColor: "#1e40af" };

/**
 * Unified renderer for `presentation` artifacts — the ONE renderer used by chat,
 * canvas, and artifact-card surfaces. Resolves the payload object (serverData ??
 * canvas object ?? parsed raw JSON via JSON.parse) and derives slides + theme
 * from the `{presentation:{slides, theme}}` envelope (also tolerating an already
 * flattened `{slides, theme}` shape).
 */
export default function PresentationArtifact({
  raw,
  data,
  serverData,
  taskId,
  artifactId,
  isStreamActive,
}: ArtifactRendererProps) {
  const payload = useMemo(
    () =>
      resolveJsonPayload<any>({
        serverData,
        data,
        raw,
        isStreamActive,
        parse: JSON.parse,
      }),
    [serverData, data, raw, isStreamActive],
  );

  const slides = payload?.presentation?.slides ?? payload?.slides ?? payload;
  const theme = payload?.presentation?.theme ?? payload?.theme ?? DEFAULT_THEME;

  if (!payload || !Array.isArray(slides)) {
    return isStreamActive ? <MatrxMiniLoader /> : null;
  }

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <Slideshow
        slides={slides}
        theme={theme}
        taskId={artifactDedupKey(taskId, artifactId)}
      />
    </Suspense>
  );
}
