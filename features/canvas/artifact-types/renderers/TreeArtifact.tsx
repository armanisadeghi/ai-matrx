"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { type ArtifactRendererProps } from "../artifact-renderers";

const TreeBlock = dynamic(() => import("@/components/mardown-display/blocks/tree/TreeBlock"), { ssr: false, loading: () => <MatrxMiniLoader /> });

/**
 * Unified renderer for `tree` artifacts — a hierarchy is durable structured
 * content, so it materializes (persisted, versioned, render-by-id). Renders the
 * existing TreeBlock viewer. An interactive/syncing tree editor is the next
 * layer (you asked for a tree that syncs) — see FEATURE.md.
 */
export default function TreeArtifact({ raw, data }: ArtifactRendererProps) {
  const content = typeof data === "string" ? data : raw;
  if (!content) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <TreeBlock content={content} />
    </Suspense>
  );
}
