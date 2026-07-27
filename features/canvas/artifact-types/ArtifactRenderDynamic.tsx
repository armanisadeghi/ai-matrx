"use client";

/**
 * ArtifactRenderDynamic — thin front door for consumers OUTSIDE the
 * MarkdownStream gate (e.g. CmsArtifactDetail). ONE dynamic({ssr:false}) edge;
 * the whole unified renderer family stays one statically-imported piece inside
 * artifact-renderers.tsx, built once. (Right-way experiment.)
 */

import dynamic from "next/dynamic";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import type { ArtifactRendererProps } from "./artifact-renderers";

export const ArtifactRenderDynamic = dynamic(
  () => import("./artifact-renderers").then((m) => ({ default: m.ArtifactRender })),
  { ssr: false, loading: () => <MatrxMiniLoader /> },
) as React.ComponentType<ArtifactRendererProps & { canvasType: string }>;
