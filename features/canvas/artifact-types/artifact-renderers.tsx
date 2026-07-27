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

import React, { Suspense } from "react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import ComparisonArtifact from "./renderers/ComparisonArtifact";
import FlashcardsArtifact from "./renderers/FlashcardsArtifact";
import TimelineArtifact from "./renderers/TimelineArtifact";
import ResearchArtifact from "./renderers/ResearchArtifact";
import ResourcesArtifact from "./renderers/ResourcesArtifact";
import ProgressArtifact from "./renderers/ProgressArtifact";
import TroubleshootingArtifact from "./renderers/TroubleshootingArtifact";
import RecipeArtifact from "./renderers/RecipeArtifact";
import DiagramArtifact from "./renderers/DiagramArtifact";
import DecisionTreeArtifact from "./renderers/DecisionTreeArtifact";
import PresentationArtifact from "./renderers/PresentationArtifact";
import MathProblemArtifact from "./renderers/MathProblemArtifact";
import QuizArtifact from "./renderers/QuizArtifact";
import MermaidArtifact from "./renderers/MermaidArtifact";
import SvgArtifact from "./renderers/SvgArtifact";
import ChartArtifact from "./renderers/ChartArtifact";
import MapArtifact from "./renderers/MapArtifact";
import StatsArtifact from "./renderers/StatsArtifact";
import DiffArtifact from "./renderers/DiffArtifact";
import QuestionnaireArtifact from "./renderers/QuestionnaireArtifact";
import TasksArtifact from "./renderers/TasksArtifact";
import HtmlArtifact from "./renderers/HtmlArtifact";
import ReactArtifact from "./renderers/ReactArtifact";
import TableArtifact from "./renderers/TableArtifact";
import TranscriptArtifact from "./renderers/TranscriptArtifact";
import StructuredInfoArtifact from "./renderers/StructuredInfoArtifact";
import TreeArtifact from "./renderers/TreeArtifact";
import IframeArtifact from "./renderers/IframeArtifact";
import CodeArtifact from "./renderers/CodeArtifact";
import ImageArtifact from "./renderers/ImageArtifact";
import { kindServerDataFromStoredValue } from "@/features/content-ir/react/kind-route";

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
   * Inline-edit write-back. Restores the per-type `case` behavior the legacy
   * switch had: an editable block (table, code, …) calls this with its new
   * content and the chat wires it to `replaceBlockContent` →
   * `commitInlineContentEdit` → `cx_message.content` + server-cache bust, so the
   * user's edit persists and the model's next-turn history matches what they see.
   * The artifact system must not strip this — normal-view editing stays identical.
   */
  onContentChange?: (newContent: string) => void;
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
  ArtifactRendererComponent
> = {
  comparison: ComparisonArtifact,
  flashcards: FlashcardsArtifact,
  timeline: TimelineArtifact,
  research: ResearchArtifact,
  resources: ResourcesArtifact,
  progress: ProgressArtifact,
  troubleshooting: TroubleshootingArtifact,
  recipe: RecipeArtifact,
  diagram: DiagramArtifact,
  "decision-tree": DecisionTreeArtifact,
  presentation: PresentationArtifact,
  math_problem: MathProblemArtifact,
  quiz: QuizArtifact,
  mermaid: MermaidArtifact,
  svg: SvgArtifact,
  chart: ChartArtifact,
  map: MapArtifact,
  stats: StatsArtifact,
  diff: DiffArtifact,
  questionnaire: QuestionnaireArtifact,
  tasks: TasksArtifact,
  html: HtmlArtifact,
  react: ReactArtifact,
  table: TableArtifact,
  transcript: TranscriptArtifact,
  structured_info: StructuredInfoArtifact,
  tree: TreeArtifact,
  iframe: IframeArtifact,
  code: CodeArtifact,
  image: ImageArtifact,
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
  // Structured (kind) artifact rehydration: a STRUCTURED row stores the
  // zero-loss `__kind` value object as `content.data` (Track 2B). That value
  // is the CANONICAL shape, not the legacy serverData the components consume —
  // derive serverData through the kind registry's legacy bridge
  // (`kindServerDataFromStoredValue`, the same seam ArtifactRefBlock uses)
  // so every adapter's `serverData ?? data ?? parse(raw)` resolution renders
  // the bridge output, identical to the live stream. No-ops for string
  // payloads, non-kind objects, and callers that already supplied serverData.
  const structuredServerData =
    props.serverData == null
      ? kindServerDataFromStoredValue(props.data)
      : null;
  const finalProps = structuredServerData
    ? { ...props, serverData: structuredServerData }
    : props;
  return (
    <Suspense fallback={<MatrxMiniLoader />}>
      <R {...finalProps} />
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
