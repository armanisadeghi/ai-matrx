"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const SvgBlock = dynamic(() => import("@/components/mardown-display/blocks/svg/SvgBlock"), { ssr: false, loading: () => <MatrxMiniLoader /> });

/**
 * Unified renderer for `svg` artifacts — a self-contained vector graphic is
 * durable, referenceable content (like a diagram), so it materializes. SvgBlock
 * parses its own raw markup; this adapter forwards the payload across chat /
 * canvas / artifact-card surfaces.
 */
export default function SvgArtifact({
  raw,
  data,
  isStreamActive,
}: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <SvgBlock content={content} isStreamActive={isStreamActive} />
    </Suspense>
  );
}
