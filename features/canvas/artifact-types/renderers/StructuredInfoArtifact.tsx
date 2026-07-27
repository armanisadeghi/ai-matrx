"use client";

import React, { Suspense,  useMemo } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";
import { isMaterializedArtifactId } from "../artifactId";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import StructuredPlanBlock from "@/components/mardown-display/blocks/plan/StructuredPlanBlock";

/**
 * Unified renderer for `structured_info` artifacts (transcription + tasks
 * combined). Durable structured content → materializes (persisted, versioned,
 * render-by-id). Renders the existing StructuredPlanBlock viewer. Edit mode +
 * domain sync are the next adapter layer — see FEATURE.md.
 */
export default function StructuredInfoArtifact({
  raw,
  data,
  artifactId,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  const materialized = isMaterializedArtifactId(artifactId);

  // Only bail on empty content HERE — the materialized path below self-loads
  // its markdown from the canvas row (via `useCanvasItem`), so it must not be
  // gated on a `content`/`raw` prop the canvas never passes (canvas opens with
  // `data: { artifactId }`, no raw string). Bailing early was why an opened
  // canvas panel for a materialized structured-info artifact rendered blank
  // (FOUND_DEFECTS D49 — same class as the table fix).
  if (!materialized) {
    if (!content) return null;
    return (
      <Suspense fallback={<MatrxMiniLoader />}>
        <StructuredPlanBlock content={content} />
      </Suspense>
    );
  }

  return (
    <StructuredInfoArtifactMaterialized
      canvasItemId={artifactId as string}
      fallbackContent={content ?? ""}
    />
  );
}

/**
 * Materialized wrapper — self-loads the markdown from the persisted canvas
 * row (mirrors `TableArtifactMaterialized`'s row-backed `content` useMemo),
 * since `StructuredPlanBlock` takes `content` as a required string prop and
 * has no row-awareness of its own.
 */
function StructuredInfoArtifactMaterialized({
  canvasItemId,
  fallbackContent,
}: {
  canvasItemId: string;
  fallbackContent: string;
}) {
  const { row, loading } = useCanvasItem(canvasItemId);

  const content = useMemo(() => {
    const stored = row?.content as
      | { data?: unknown }
      | string
      | null
      | undefined;
    if (
      stored &&
      typeof stored === "object" &&
      "data" in stored &&
      typeof stored.data === "string"
    ) {
      return stored.data;
    }
    if (typeof stored === "string") return stored;
    return fallbackContent;
  }, [row, fallbackContent]);

  if (loading && !row) {
    return <MatrxMiniLoader />;
  }

  if (!content) return null;

  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StructuredPlanBlock content={content} />
    </Suspense>
  );
}
