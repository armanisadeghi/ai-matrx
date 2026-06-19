"use client";

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const StreamingTableRenderer = lazy(() =>
  import("@/components/mardown-display/blocks/table/StreamingTableRenderer").then(
    (m) => ({ default: m.StreamingTableRenderer }),
  ),
);

/**
 * Unified renderer for `table` artifacts — tabular data IS structured,
 * collaborable data (your original UDT-tables insight), so it materializes:
 * persisted, versioned (canvas_items version chain), render-by-id, never dying
 * as chat text. Renders the editable StreamingTableRenderer.
 *
 * Two-way domain sync (the materialized table ↔ a real `udt_datasets` table via
 * `features/data-tables/save-to-table.ts`) is the next adapter layer — see
 * FEATURE.md. This wave delivers the persistence + identity foundation.
 */
export default function TableArtifact({
  raw,
  data,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <StreamingTableRenderer content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
