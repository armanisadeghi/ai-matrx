"use client";

/**
 * Unified artifact renderers — ONE renderer per type, shared by all three
 * surfaces (in-chat BlockRenderer, CanvasBody, ArtifactBlock).
 *
 * Each entry in RENDERERS is a thin adapter that resolves the payload
 * (serverData ?? canvas data ?? parse(raw)) and renders the real underlying
 * component with its correct prop name, adapting to `mode` where canvas / inline
 * / artifact genuinely need different chrome or components (e.g. mermaid's
 * editable canvas workbench vs the inline viewer).
 *
 * Migration is INCREMENTAL + SAFE: a type is routed through this unified path
 * only once it appears in RENDERERS; until then the legacy switch cases in each
 * surface keep handling it. `hasArtifactRenderer` is the gate every surface
 * checks before delegating.
 */

import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

export interface ArtifactRendererProps {
  /** Chrome/scope hint — NOT a different component (each adapter handles modes internally). */
  mode: "inline" | "artifact" | "canvas";
  /** Raw payload string (streaming, or canvas content.data when stored as a string). */
  raw?: string;
  /** Pre-parsed data (canvas content.data object, or any already-parsed payload). */
  data?: unknown;
  /** Server-parsed data from the stream (Python content_block.data). */
  serverData?: unknown;
  metadata?: Record<string, unknown>;
  artifactId?: string;
  conversationId?: string;
  messageId?: string;
  /** Block position within the message — used by quiz/mermaid state persistence. */
  blockIndex?: number;
  taskId?: string;
  isStreamActive?: boolean;
  /**
   * True when rendered on a PUBLIC / shared surface (anonymous viewer). Renderers
   * that execute or script-enable author content (html, react) MUST downgrade to
   * a safe, sandboxed, non-executing view when this is set — never run untrusted
   * author HTML/React in a visitor's session. Defaults to false (owner view).
   */
  isPublic?: boolean;
}

type ArtifactRendererComponent = React.ComponentType<ArtifactRendererProps>;

/**
 * canvasType → unified renderer (lazy). Populated per type across Wave B.
 */
const RENDERERS: Record<
  string,
  React.LazyExoticComponent<ArtifactRendererComponent>
> = {
  comparison: lazy(() => import("./renderers/ComparisonArtifact")),
  flashcards: lazy(() => import("./renderers/FlashcardsArtifact")),
  timeline: lazy(() => import("./renderers/TimelineArtifact")),
  research: lazy(() => import("./renderers/ResearchArtifact")),
  resources: lazy(() => import("./renderers/ResourcesArtifact")),
  progress: lazy(() => import("./renderers/ProgressArtifact")),
  troubleshooting: lazy(() => import("./renderers/TroubleshootingArtifact")),
  recipe: lazy(() => import("./renderers/RecipeArtifact")),
  diagram: lazy(() => import("./renderers/DiagramArtifact")),
  "decision-tree": lazy(() => import("./renderers/DecisionTreeArtifact")),
  presentation: lazy(() => import("./renderers/PresentationArtifact")),
  math_problem: lazy(() => import("./renderers/MathProblemArtifact")),
  quiz: lazy(() => import("./renderers/QuizArtifact")),
  mermaid: lazy(() => import("./renderers/MermaidArtifact")),
  svg: lazy(() => import("./renderers/SvgArtifact")),
  chart: lazy(() => import("./renderers/ChartArtifact")),
  questionnaire: lazy(() => import("./renderers/QuestionnaireArtifact")),
  tasks: lazy(() => import("./renderers/TasksArtifact")),
  html: lazy(() => import("./renderers/HtmlArtifact")),
  react: lazy(() => import("./renderers/ReactArtifact")),
  iframe: lazy(() => import("./renderers/IframeArtifact")),
  code: lazy(() => import("./renderers/CodeArtifact")),
  image: lazy(() => import("./renderers/ImageArtifact")),
};

export function hasArtifactRenderer(canvasType: string | null | undefined): boolean {
  return !!canvasType && canvasType in RENDERERS;
}

/**
 * Render a unified artifact. Returns null if the type has no unified renderer
 * yet (caller then falls through to its legacy switch).
 */
export function ArtifactRender({
  canvasType,
  ...props
}: ArtifactRendererProps & { canvasType: string }) {
  const R = RENDERERS[canvasType];
  if (!R) return null;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <R {...props} />
    </Suspense>
  );
}

// ── Payload resolution helpers (shared by every adapter) ────────────────────

interface ResolveArgs<T> {
  serverData?: unknown;
  data?: unknown;
  raw?: string;
  isStreamActive?: boolean;
  parse: (s: string) => T;
}

/**
 * For JSON-payload types (comparison, diagram, quiz, presentation, math_problem,
 * decision-tree). Server/canvas pre-parsed objects pass through; a raw string is
 * parsed ONLY once streaming is complete (parsing incomplete JSON mid-stream
 * yields garbage), matching the legacy `isBlockLoading` guard.
 */
export function resolveJsonPayload<T>(args: ResolveArgs<T>): T | null {
  const { serverData, data, raw, isStreamActive, parse } = args;
  if (serverData != null) return serverData as T;
  if (data != null && typeof data !== "string") return data as T;
  const rawStr = typeof data === "string" ? data : raw;
  if (!rawStr) return null;
  if (isStreamActive) return null; // wait for completion before parsing raw JSON
  try {
    return parse(rawStr);
  } catch {
    return null;
  }
}

/**
 * For markdown-payload types (flashcards, timeline, research, resources,
 * progress, troubleshooting, recipe). Their parsers are streaming-tolerant, so a
 * raw string is parsed even mid-stream (progressive render).
 */
export function resolveMarkdownPayload<T>(args: ResolveArgs<T>): T | null {
  const { serverData, data, raw, parse } = args;
  if (serverData != null) return serverData as T;
  if (data != null && typeof data !== "string") return data as T;
  const rawStr = typeof data === "string" ? data : raw;
  if (!rawStr) return null;
  try {
    return parse(rawStr);
  } catch {
    return null;
  }
}

/** Stable dedup/persistence key from taskId or artifactId. */
export function artifactDedupKey(
  taskId?: string,
  artifactId?: string,
): string | undefined {
  return taskId ?? (artifactId ? `artifact:${artifactId}` : undefined);
}
