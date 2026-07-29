"use client";

import { DiffBlock } from "@/components/mardown-display/blocks/diff/DiffBlock";
import type { ArtifactRendererProps } from "../types";

/**
 * Unified renderer for `diff` artifacts — forwards the raw payload to DiffBlock.
 * DiffBlock is a light shell (it next/dynamic-loads its heavy DiffCanvas), and
 * this renderer is itself lazy-loaded by the artifact registry, so a static
 * import here is correct — no redundant React.lazy (doctrine: next/dynamic only).
 */
export default function DiffArtifact({
  raw,
  data,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return <DiffBlock content={content} isStreamActive={isStreamActive} />;
}
