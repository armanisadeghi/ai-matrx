"use client";
import React, { useCallback } from "react";
import { BlockComponents, LoadingComponents } from "./BlockComponentRegistry";
import { resolveArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectHideReasoning,
  selectHideToolResults,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { applyIrKindRoute } from "@/features/content-ir/react/kind-route";
import { useContentIrRegistryVersion } from "@/features/content-ir/react/use-registry-repaint";
import { resolveKindLoadingComponent } from "@/features/content-ir/react/loading/kind-loading-registry";
import { earlyKeysFromValue } from "@/features/content-ir/react/loading/kind-loading.types";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import type { CanonicalBlockIR } from "@/features/content-ir/core/ir-types";
import {
  isBlockLoading,
  resolveBlockDispatch,
  reportUnregisteredBlockType,
  type BlockDispatchContext,
  type RenderBlock,
} from "./block-dispatch";

// The flat render-block shape lives with the dispatch registry now; re-export
// so the existing importers (EnhancedChatMarkdown, SafeBlockRenderer, …) keep
// working unchanged.
export type { RenderBlock } from "./block-dispatch";

interface BlockRendererProps {
  requestId?: string;
  block: RenderBlock;
  index: number;
  isStreamActive?: boolean;
  onContentChange?: (newContent: string) => void;
  /**
   * conversationId + messageId identify the owning cx_message row. Stateful
   * render blocks (quiz, flashcards, form, editable table, etc.) use these
   * via `useMessageBlockPersistence` to round-trip their state into the DB
   * through the `cx_message_edit` RPC. Optional — blocks that don't need
   * persistence ignore them.
   */
  conversationId?: string;
  messageId?: string;
  taskId?: string;
  isLastReasoningBlock?: boolean;
  /** Generic handler: replaces `original` substring with `replacement` in the full content string. */
  replaceBlockContent: (original: string, replacement: string) => void;
  handleOpenEditor: () => void;
}

/**
 * canvasType → its dedicated streaming skeleton. Reuses the existing per-type
 * loading visualizations (QuizLoadingVisualization, etc.) instead of the
 * generic "Initializing Matrx" MatrxMiniLoader, which is meant for app boot and
 * reads as nonsense mid-response. Types without a bespoke skeleton fall back to
 * a neutral pulse (handled at the call site).
 */
const ARTIFACT_LOADING_COMPONENTS: Partial<
  Record<string, () => React.ReactElement>
> = {
  quiz: LoadingComponents.QuizLoading,
  presentation: LoadingComponents.PresentationLoading,
  recipe: LoadingComponents.RecipeLoading,
  timeline: LoadingComponents.TimelineLoading,
  research: LoadingComponents.ResearchLoading,
  resources: LoadingComponents.ResourcesLoading,
  progress: LoadingComponents.ProgressLoading,
  comparison: LoadingComponents.ComparisonLoading,
  troubleshooting: LoadingComponents.TroubleshootingLoading,
  "decision-tree": LoadingComponents.DecisionTreeLoading,
  diagram: LoadingComponents.DiagramLoading,
  math_problem: LoadingComponents.MathProblemLoading,
};

/**
 * The pending window for a streaming JSON region: the envelope exists but the
 * region cannot render its real component yet — either the `__kind`
 * discriminator hasn't streamed in (`kind` empty), or the kind IS identified
 * but its schema is still cold-fetching (`kindState === "pending_schema"`, a
 * db/cloud kind's window). Rendering the raw text here is the "shows the
 * whole JSON, converts only when done" flash — instead the loading library
 * renders (registry-driven, fed by the early keys). Gated on `type ===
 * "code"` so a block the splitter/accumulator already typed keeps its own
 * type-aware loader.
 *
 * Returns the envelope when pending so the caller can select + feed the
 * loading component; null otherwise.
 */
function pendingStructuredEnvelope(block: {
  type: string;
  metadata?: Record<string, unknown>;
}): CanonicalBlockIR | null {
  if (block.type !== "code") return null;
  const envelope = readEnvelope(block.metadata);
  if (!envelope || envelope.root.status !== "streaming") return null;
  if (!envelope.root.kind || envelope.root.kindState === "pending_schema") {
    return envelope;
  }
  return null;
}

/**
 * The registry-driven pending loader: picks the kind's declared
 * `loading_component` slug (kind_definition.metadata, read from the warm/cold
 * registry) — generic default otherwise — and feeds it the early keys the
 * parser has surfaced so far (title, loading_message, …).
 */
const PendingStructuredBlock: React.FC<{ envelope: CanonicalBlockIR }> = ({
  envelope,
}) => {
  const kind = envelope.root.kind || undefined;
  const slug = kind
    ? (kindRegistry.getDefinition(kind)?.loadingComponent ?? null)
    : null;
  const early = earlyKeysFromValue(envelope.root.value, kind);
  // createElement over JSX: the loader is a STATIC module-level component
  // selected from the registry at render time (not created during render) —
  // this form makes that legible to react-hooks/static-components.
  return React.createElement(resolveKindLoadingComponent(slug), early);
};

/**
 * Renders individual content blocks through four ordered stages:
 *
 *  1. KIND ROUTE (Shape blocks, first-class) — `applyIrKindRoute`: a block
 *     whose `metadata.__ir` envelope resolved a REGISTERED kind routes through
 *     the kind registry (`resolveComponent` / legacy bridge) before any
 *     type-keyed dispatch. This is how bare/fenced JSON `flashcard_set` —
 *     which the legacy detectors can only call "code" — becomes real
 *     flashcards, live while streaming.
 *  2. PENDING SKELETON — a still-streaming JSON region with an unresolved
 *     kind shows a neutral skeleton instead of flashing raw text.
 *  3. UNIFIED ARTIFACT RENDERER — standalone materializable blocks render
 *     through the single shared artifact path (chat/canvas/artifact identical).
 *  4. DISPATCH REGISTRY — the declarative, crosswalk-classified table in
 *     block-dispatch.tsx (protocol / scalar_generic / shape / opaque). An
 *     unregistered type SCREAMS (reportUnregisteredBlockType) and renders as
 *     basic markdown — never a silent default.
 *
 * Components are lazy-loaded (see BlockComponentRegistry) for code splitting.
 */
export const BlockRenderer: React.FC<BlockRendererProps> = ({
  requestId,
  block: rawBlock,
  index,
  isStreamActive,
  onContentChange,
  conversationId,
  messageId,
  taskId,
  isLastReasoningBlock,
  replaceBlockContent,
  handleOpenEditor,
}) => {
  // Late-arrival repaint: `applyIrKindRoute` reads module-singleton registries
  // synchronously. Subscribing to their versions makes a schema/component that
  // lands AFTER this block rendered (cold fetch losing the race with region
  // end) re-run the route on the frozen envelope — the block upgrades from
  // raw/generic to its real component without any stream still being open.
  useContentIrRegistryVersion();

  // Stage 1 — content-ir kind routing: a block whose metadata.__ir envelope
  // resolved a registered kind renders as that kind's component
  // (envelope-derived serverData) — e.g. bare/fenced JSON flashcard_set, which
  // the legacy detectors can only call "code". Everything else passes through
  // untouched.
  const block = applyIrKindRoute(rawBlock);

  // Per-conversation display flags. When a surface has `hideReasoning` or
  // `hideToolResults` set on its `instanceUIState`, the matching block
  // types self-gate in their dispatch registrations so there's exactly one
  // source of truth — no scattered conditional-render sites, no missed
  // branches, no need for parents to remember to filter.
  const hideReasoning = useAppSelector(
    conversationId ? selectHideReasoning(conversationId) : () => false,
  );
  const hideToolResults = useAppSelector(
    conversationId ? selectHideToolResults(conversationId) : () => false,
  );

  const renderFallbackContent = useCallback(
    (content: string, language: string = "json") => {
      return (
        <BlockComponents.CodeBlock
          key={index}
          code={content}
          language={language}
          fontSize={16}
          className="my-3"
          isStreamActive={isStreamActive}
        />
      );
    },
    [index, isStreamActive],
  );

  const renderBasicMarkdown = useCallback(
    (content: string) => {
      return (
        <BlockComponents.BasicMarkdownContent
          key={index}
          content={content}
          isStreamActive={isStreamActive}
          onEditRequest={onContentChange ? handleOpenEditor : undefined}
          messageId={messageId}
          showCopyButton={false}
          tableRenderDiagnostic={{
            blockType: block.type,
            conversationId,
            messageId,
            requestId,
          }}
        />
      );
    },
    [
      index,
      isStreamActive,
      onContentChange,
      handleOpenEditor,
      messageId,
      block.type,
      conversationId,
      requestId,
    ],
  );

  // Stage 2 — a JSON region still streaming whose kind is unresolved OR whose
  // schema is still cold-fetching renders its loading component (registry-
  // driven, early-key fed), NOT its raw text. The moment the schema lands the
  // parser upgrades in place and Stage 1 routes to the real component; a
  // region completing genuinely kind-less falls through to the code block
  // below. (Placed after all hooks so the early return never changes hook
  // order.)
  const pendingEnvelope = pendingStructuredEnvelope(block);
  if (pendingEnvelope) {
    return <PendingStructuredBlock key={index} envelope={pendingEnvelope} />;
  }

  // Stage 3 — unified artifact renderer (Wave B): standalone materializable
  // blocks whose type has a unified renderer are rendered through the single
  // shared path (chat/canvas/artifact identical). `artifact` blocks go through
  // the dedicated `artifact` registration below (UUID id → render-by-id; else
  // inline ArtifactBlock chrome). Standalone materializable types (```tasks,
  // ```mermaid, JSON blocks, …) route through the unified renderer here.
  if (block.type !== "artifact") {
    const _def = resolveArtifactDef(block.type);
    if (_def && hasArtifactRenderer(_def.canvasType)) {
      // Gate on the BLOCK's own completion, not the global message stream.
      // Previously every block received the message-wide `isStreamActive`, so a
      // quiz/slide-deck that had fully streamed in still showed its loader until
      // the ENTIRE message finished — the "loading forever" bug. A block is
      // "loading" only while its own content is incomplete (isStreamingBlock /
      // metadata.isComplete === false). While loading, show the type-aware
      // skeleton instead of the generic "Initializing Matrx" loader; once
      // complete, render immediately with isStreamActive=false even if later
      // blocks in the same message are still streaming.
      // STREAM token-by-token for every type EXCEPT the complex ones that can't
      // render partial content meaningfully. Those (recipe, quiz, presentation,
      // … — exactly the types with a bespoke loading animation in
      // ARTIFACT_LOADING_COMPONENTS) show their loader while the block is still
      // streaming. EVERY OTHER type renders its real renderer with the live
      // partial content + `isStreamActive`, so it builds up as tokens arrive
      // (tables, flashcards, mermaid, svg, …) — never batched until complete.
      // (Regression guard: forcing `isStreamActive={false}` + a loader for all
      // types is what made tables/flashcards batch — see the doctrine that all
      // render blocks stream live.)
      const loading = isBlockLoading(block);
      const Loader = ARTIFACT_LOADING_COMPONENTS[_def.canvasType];
      if (loading && Loader) {
        return <Loader key={index} />;
      }
      return (
        <ArtifactRender
          key={index}
          canvasType={_def.canvasType}
          mode="inline"
          raw={block.content}
          serverData={block.serverData}
          metadata={block.metadata as Record<string, unknown> | undefined}
          taskId={taskId}
          conversationId={conversationId}
          messageId={messageId}
          blockIndex={index}
          isStreamActive={loading}
          // Restore the legacy per-type inline-edit write-back (the old switch
          // cases passed this; the unified path must too) — editable blocks
          // persist to cx_message.content + bust the server cache. Gated on
          // not-streaming, exactly like the old `case "table"`.
          onContentChange={
            !loading && replaceBlockContent
              ? (updated: string) => replaceBlockContent(block.content, updated)
              : undefined
          }
        />
      );
    }
  }

  // Stage 4 — the declarative dispatch registry (block-dispatch.tsx),
  // organized by crosswalk classification and exhaustive against the
  // generated block-type unions.
  const ctx: BlockDispatchContext = {
    block,
    index,
    isStreamActive,
    conversationId,
    messageId,
    taskId,
    requestId,
    isLastReasoningBlock,
    hideReasoning,
    hideToolResults,
    replaceBlockContent,
    renderBasicMarkdown,
  };

  const dispatch = resolveBlockDispatch(block.type);
  if (dispatch) {
    return dispatch(ctx);
  }

  // No registration — a genuinely unknown type (Python outran the generated
  // unions, or a registration was deleted). SCREAM, then render the content
  // as basic markdown so nothing the model produced is hidden.
  reportUnregisteredBlockType(block.type, {
    conversationId,
    messageId,
    requestId,
  });
  return block.content ? renderBasicMarkdown(block.content) : null;
};
