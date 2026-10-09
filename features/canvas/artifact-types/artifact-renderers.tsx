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

import { BlockStateHost } from "@/features/block-state/BlockStateContext";
import { isMaterializedArtifactId } from "./artifactId";
import React, { Suspense, lazy } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import ComparisonArtifact from "./renderers/ComparisonArtifact";
import FlashcardsArtifact from "./renderers/FlashcardsArtifact";
import TimelineArtifact from "./renderers/TimelineArtifact";
import ResearchArtifact from "./renderers/ResearchArtifact";
import ResourcesArtifact from "./renderers/ResourcesArtifact";
import ProgressArtifact from "./renderers/ProgressArtifact";
import TroubleshootingArtifact from "./renderers/TroubleshootingArtifact";
import RecipeArtifact from "./renderers/RecipeArtifact";

import DecisionTreeArtifact from "./renderers/DecisionTreeArtifact";
import PresentationArtifact from "./renderers/PresentationArtifact";
import MathProblemArtifact from "./renderers/MathProblemArtifact";
import QuizArtifact from "./renderers/QuizArtifact";

import SvgArtifact from "./renderers/SvgArtifact";
import ChartArtifact from "./renderers/ChartArtifact";
import MapArtifact from "./renderers/MapArtifact";
import StatsArtifact from "./renderers/StatsArtifact";
import DiffArtifact from "./renderers/DiffArtifact";
import QuestionnaireArtifact from "./renderers/QuestionnaireArtifact";
import TasksArtifact from "./renderers/TasksArtifact";
import HtmlArtifact from "./renderers/HtmlArtifact";

import TableArtifact from "./renderers/TableArtifact";
import TranscriptArtifact from "./renderers/TranscriptArtifact";
import StructuredInfoArtifact from "./renderers/StructuredInfoArtifact";
import TreeArtifact from "./renderers/TreeArtifact";
import IframeArtifact from "./renderers/IframeArtifact";

import ImageArtifact from "./renderers/ImageArtifact";
import KindValueArtifact from "./renderers/KindValueArtifact";
import { kindServerDataFromStoredValue } from "@ai-matrx/rich-content/kinds/react/kind-route";
import { storedKindValue } from "./storedKindValue";
import type { ArtifactRendererProps } from "./types";
import { ArtifactBlockAttach } from "@/features/canvas/output/ArtifactBlockAttach";

type ArtifactRendererComponent = React.ComponentType<ArtifactRendererProps>;

/**
 * canvasType → unified renderer (lazy). Populated per type across Wave B.
 */
const RENDERERS: Record<string, ArtifactRendererComponent> = {
  comparison: ComparisonArtifact,
  flashcards: FlashcardsArtifact,
  timeline: TimelineArtifact,
  research: ResearchArtifact,
  resources: ResourcesArtifact,
  progress: ProgressArtifact,
  troubleshooting: TroubleshootingArtifact,
  recipe: RecipeArtifact,
  // heavy engine — stays behind its own boundary (runtime tiering; in-gate, so React.lazy is the build-cheap form)
  diagram: lazy(() => import("./renderers/DiagramArtifact")),
  "decision-tree": DecisionTreeArtifact,
  presentation: PresentationArtifact,
  math_problem: MathProblemArtifact,
  quiz: QuizArtifact,
  // heavy engine — stays behind its own boundary (runtime tiering; in-gate, so React.lazy is the build-cheap form)
  mermaid: lazy(() => import("./renderers/MermaidArtifact")),
  svg: SvgArtifact,
  chart: ChartArtifact,
  map: MapArtifact,
  stats: StatsArtifact,
  diff: DiffArtifact,
  questionnaire: QuestionnaireArtifact,
  tasks: TasksArtifact,
  html: HtmlArtifact,
  // heavy engine — stays behind its own boundary (runtime tiering; in-gate, so React.lazy is the build-cheap form)
  react: lazy(() => import("./renderers/ReactArtifact")),
  table: TableArtifact,
  transcript: TranscriptArtifact,
  structured_info: StructuredInfoArtifact,
  tree: TreeArtifact,
  iframe: IframeArtifact,
  // heavy engine — stays behind its own boundary (runtime tiering; in-gate, so React.lazy is the build-cheap form)
  code: lazy(() => import("./renderers/CodeArtifact")),
  image: ImageArtifact,
  kind_value: KindValueArtifact,
};

export function hasArtifactRenderer(
  canvasType: string | null | undefined,
): boolean {
  return !!canvasType && canvasType in RENDERERS;
}

/**
 * Render a unified artifact. Returns null if the type has no unified renderer
 * yet (caller then falls through to its legacy switch).
 */
/**
 * A finished artifact block in a chat message offers "Attach to chat"
 * (rendered-output P2 WP4). Not in the canvas (its pane menu has it), not while
 * streaming, not on a public page; HTML carries its own page attach.
 */
function attachable(canvasType: string, props: ArtifactRendererProps): boolean {
  return (
    props.mode !== "canvas" &&
    Boolean(props.conversationId) &&
    !props.isStreamActive &&
    !props.isPublic &&
    canvasType !== "html"
  );
}

function artifactTitle(canvasType: string, metadata: Record<string, unknown> | undefined): string {
  const title = metadata?.title;
  return typeof title === "string" && title.trim() ? title.trim() : canvasType.replace(/[_-]+/g, " ");
}

export function ArtifactRender({
  canvasType,
  ...props
}: ArtifactRendererProps & { canvasType: string }) {
  const R = RENDERERS[canvasType];
  if (!R) return null;
  // Structured (kind) artifact rehydration: a STRUCTURED row stores the
  // zero-loss `__kind` value object as `content.data` (Track 2B). That value
  // is the CANONICAL shape, not the legacy serverData the components consume —
  // derive serverData through the kind registry's legacy bridge
  // (`kindServerDataFromStoredValue`, the same seam ArtifactRefBlock uses)
  // so every adapter's `serverData ?? data ?? parse(raw)` resolution renders
  // the bridge output, identical to the live stream. A JSON-STRING kind value
  // (a row that missed the structured write) reads as its object
  // (`storedKindValue`); no-ops for other strings, non-kind objects, and
  // callers that already supplied serverData. `raw` is read too: surfaces that
  // hand the payload as text (ArtifactBlock in a note preview) carry a
  // `{"__kind":…}` body there, and must render exactly like chat.
  const structuredServerData =
    props.serverData == null
      ? kindServerDataFromStoredValue(
          storedKindValue(props.data ?? props.raw),
        )
      : null;
  const finalProps = structuredServerData
    ? { ...props, serverData: structuredServerData }
    : props;
  // The ONE host of block state: every interactive kind below reads its record,
  // identity and kind through `useBlockState()` — never through ids it plumbs itself.
  return (
    <BlockStateHost
      kind={canvasType}
      messageId={finalProps.messageId}
      conversationId={finalProps.conversationId}
      blockIndex={finalProps.blockIndex}
      canvasItemId={isMaterializedArtifactId(finalProps.artifactId) ? finalProps.artifactId!.trim() : null}
      content={finalProps.serverData ?? finalProps.data ?? finalProps.raw}
      streaming={!!finalProps.isStreamActive}
    >
      {attachable(canvasType, finalProps) ? (
        <ArtifactBlockAttach
          type={canvasType}
          data={finalProps.serverData ?? finalProps.data ?? finalProps.raw}
          title={artifactTitle(canvasType, finalProps.metadata)}
          conversationId={finalProps.conversationId!}
          messageId={finalProps.messageId}
          blockIndex={finalProps.blockIndex}
          artifactId={finalProps.artifactId}
        >
          <Suspense fallback={<MatrxMiniLoader />}>
            <R {...finalProps} />
          </Suspense>
        </ArtifactBlockAttach>
      ) : (
        <Suspense fallback={<MatrxMiniLoader />}>
          <R {...finalProps} />
        </Suspense>
      )}
    </BlockStateHost>
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
