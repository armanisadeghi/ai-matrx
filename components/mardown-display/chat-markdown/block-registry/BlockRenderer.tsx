"use client";
import React, { useCallback, useMemo } from "react";
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
import {
  applyIrKindRoute,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "@/features/content-ir/react/kind-route";
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";
import { useEnsureKindRenderable } from "@/features/content-ir/react/ensure-kind-renderable";
import { resolveKindLoadingComponent } from "@/features/content-ir/react/loading/kind-loading-registry";
import { resolveLoadingSlugForKind } from "@/features/content-ir/react/loading/resolve-loading-slug";
import { earlyKeysFromValue } from "@/features/content-ir/react/loading/kind-loading.types";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import {
  resolveAnnouncedKindLoading,
  resolveProvisionalKindRender,
} from "@/features/content-ir/react/partial-kind-route";
import {
  ProvisionalKindBoundary,
  ProvisionalKindFrame,
} from "@/features/content-ir/react/ProvisionalKindBoundary";
import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
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
  /** Owning message context forwarded to canonical artifact renderers. */
  conversationId?: string;
  messageId?: string;
  taskId?: string;
  isLastReasoningBlock?: boolean;
  /** Generic handler: replaces `original` substring with `replacement` in the full content string. */
  replaceBlockContent: (original: string, replacement: string) => void;
  handleOpenEditor: () => void;
  /**
   * Streaming partial kinds ONLY. Set on the recursive render of a
   * PROVISIONAL block so the loading gates below (which exist to hide a
   * half-arrived payload) stand down and the real kind component renders the
   * provisional value. Never set by an ordinary caller.
   */
  suppressLoadingGate?: boolean;
}

/**
 * canvasType → its dedicated streaming skeleton — LEGACY (non-kind) blocks
 * ONLY. A block carrying a `metadata.__ir` envelope went through the kind
 * system and follows the ONE loading sequence instead (kind loader → real
 * component from its first renderable frame); this table serves the old
 * envelope-less blocks (history messages, direct typed fences) so their
 * behavior stays untouched. Do not add kinds here — the per-kind streaming
 * knob is the bridge ({provisional: true} + its too-thin gate).
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
/**
 * How much of a KINDLESS region may stream before we stop waiting for a
 * `__kind` that clearly is not coming. The discriminator is taught as the
 * FIRST key, so on any well-formed kind payload it resolves within the first
 * chunk or two; a region that has already streamed this many characters
 * without one is genuinely kindless JSON, and the reader deserves to WATCH it
 * arrive rather than stare at a skeleton until the end (Arman, live Study
 * Pack run, 2026-08-25: a kindless node "made me sit there and watch a
 * spinner for a very long time" and then dumped JSON at once).
 */
const KINDLESS_PATIENCE_CHARS = 300;

export function pendingStructuredEnvelope(block: {
  type: string;
  content?: string | null;
  metadata?: Record<string, unknown>;
}): CanonicalBlockIR | null {
  if (block.type !== "code") return null;
  const envelope = readEnvelope(block.metadata);
  if (!envelope || envelope.root.status !== "streaming") return null;
  if (envelope.root.kind) {
    // Identified but UNROUTED. This function sees the block AFTER the kind
    // route ran, so a still-"code" type means the route had nothing to say
    // yet — the schema is cold-fetching, or the definition/component rows are
    // still in flight (the ensure-hook's fetches land a beat after the kind
    // streams in). That beat used to render ONE raw-JSON frame before the
    // registry repaint swapped the real component in (caught live,
    // 2026-08-26). Identified + streaming + unrouted → the loader, always;
    // the window is bounded by the stream, and a COMPLETE unrouted region
    // still falls through to the code block (the honest final answer).
    return envelope;
  }
  // No kind yet: give the discriminator a beat to arrive, then concede this
  // region is plain JSON and let the code block below stream it LIVE. The
  // loader must be a promise of a component, never a lid over content.
  return (block.content ?? "").length < KINDLESS_PATIENCE_CHARS
    ? envelope
    : null;
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
  // Declared → derived → generic, resolved by the ONE module that owns that
  // order (`resolve-loading-slug.ts`). It also contains the trap: an INVALID
  // declaration must fall through to derivation rather than short-circuiting
  // to the shapeless generic skeleton, which is why this is never re-inlined
  // as a `??` chain.
  const slug = resolveLoadingSlugForKind(kind).slug;
  const early = earlyKeysFromValue(envelope.root.value, kind);
  // createElement over JSX: the loader is a STATIC module-level component
  // selected from the registry at render time (not created during render) —
  // this form makes that legible to react-hooks/static-components.
  // The full partial value rides along (KindLoadingProps.value) so data-fed
  // smart loaders can perform the arrival; skeleton loaders ignore it.
  return React.createElement(resolveKindLoadingComponent(slug), {
    ...early,
    value: envelope.root.value ?? null,
  });
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
 *  1.5 PROVISIONAL KIND (streaming partial kinds) — a block carrying a
 *     `metadata.__ir_partial` `partial` event for an opted-in kind renders
 *     that provisional value through the SAME component the final value uses,
 *     marked "still arriving". Terminal events produce nothing here, so the
 *     final value replaces the provisional render in one frame.
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
  suppressLoadingGate = false,
}) => {
  // Late-arrival repaint, GRANULAR: subscribe to THIS block's envelope kind
  // only — a schema/component that lands after this block rendered (cold
  // fetch losing the race with region end) re-runs the route on the frozen
  // envelope, while arrivals for OTHER kinds never touch this block.
  const envelopeKind = readEnvelope(rawBlock.metadata)?.root.kind || null;
  const kindRouteVersion = useContentIrKindVersion(envelopeKind);
  // Fetch-from-render (the convergence seam): rendering a kind block IS the
  // demand for its schema + component, on EVERY arrival path — live stream,
  // DB reload, workflow. Before this, only the live accumulator requested
  // them, so history blocks sat unrendered until something else warmed the
  // registry ("works after you navigate away and come back"). Idempotent —
  // both registries dedupe in-flight requests and remember misses.
  useEnsureKindRenderable(envelopeKind);

  // Stage 1 — content-ir kind routing: a block whose metadata.__ir envelope
  // resolved a registered kind renders as that kind's component
  // (envelope-derived serverData) — e.g. bare/fenced JSON flashcard_set, which
  // the legacy detectors can only call "code". Everything else passes through
  // untouched.
  // Explicit useMemo is CORRECT here: React Compiler is OFF in this repo
  // (next.config.js reactCompiler: false), and the route must re-execute
  // only when the block itself or its kind's registry version changes —
  // not on every parent render.
  const block = useMemo(() => {
    void kindRouteVersion; // registry-arrival invalidation key
    return applyIrKindRoute(rawBlock);
  }, [rawBlock, kindRouteVersion]);

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

  // Stage 1.5 — STREAMING PARTIAL KINDS: the server announced what this region
  // is and what has arrived so far (`metadata.__ir_partial`). A provisional
  // value for an opted-in kind renders through the SAME component the final
  // value renders in, so the block fills in instead of sitting behind a
  // skeleton — and the terminal events (`superseded` / `retracted`) produce no
  // provisional render at all, so the swap to the final value happens in the
  // same frame with no flicker. Withheld by default per kind; a component that
  // throws anyway is caught and falls back to this kind's loading skeleton.
  // Contract: common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md
  const provisional = suppressLoadingGate
    ? null
    : resolveProvisionalKindRender(rawBlock, { streamActive: isStreamActive });
  if (provisional) {
    return (
      <ProvisionalKindBoundary
        key={index}
        kind={provisional.kind}
        fallback={<PendingStructuredBlock envelope={provisional.envelope} />}
      >
        <ProvisionalKindFrame>
          <BlockRenderer
            requestId={requestId}
            block={provisional.block}
            index={index}
            isStreamActive={isStreamActive}
            onContentChange={onContentChange}
            conversationId={conversationId}
            messageId={messageId}
            taskId={taskId}
            isLastReasoningBlock={isLastReasoningBlock}
            replaceBlockContent={replaceBlockContent}
            handleOpenEditor={handleOpenEditor}
            suppressLoadingGate
          />
        </ProvisionalKindFrame>
      </ProvisionalKindBoundary>
    );
  }

  // Stage 1.6 — ANNOUNCED, not yet renderable. The server named this region's
  // kind but there is nothing renderable in it yet (the value is still too
  // thin, the kind withholds provisional values, or nothing can route it).
  // Show THAT KIND's loading state rather than the region's raw text.
  //
  // This is the only kind signal a WORKFLOW run page has: its lane is
  // `block_shadowed`, so no streaming `__ir` is ever built for the region and
  // Stage 2 below cannot fire. Without it a node's structured answer rendered
  // as raw JSON until it finished — Arman, 2026-08-21.
  const announced = suppressLoadingGate
    ? null
    : resolveAnnouncedKindLoading(rawBlock, { streamActive: isStreamActive });
  if (announced) {
    return <PendingStructuredBlock key={index} envelope={announced.envelope} />;
  }

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

  // Stage 2.5 — kind identified, COMPONENT not resolvable yet. The route
  // sent this streaming region to the generic fallback because no component
  // answered — which mid-stream almost always means the cold fetch (fired by
  // the seam above) hasn't landed, not that the kind has no component. Per
  // the ONE loading sequence: show the kind's loader, never a JSON tree,
  // while the stream is live. Bounded by the stream itself: if the component
  // truly never comes, the block completes and the generic viewer (the
  // sanctioned R6 floor) renders the final value below.
  if (block.type === GENERIC_STRUCTURED_COMPONENT_KEY && !suppressLoadingGate) {
    const genericEnvelope = readEnvelope(block.metadata);
    if (genericEnvelope?.root.kind && genericEnvelope.root.status === "streaming") {
      return <PendingStructuredBlock key={index} envelope={genericEnvelope} />;
    }
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
      // (Regression guard: forcing `isStreamActive={false}` + a loader for all
      // types is what made tables/flashcards batch — see the doctrine that all
      // render blocks stream live.)
      // `suppressLoadingGate` is the provisional render (Stage 1.5): the
      // point is to REPLACE this skeleton with the real component fed the
      // provisional value.
      const loading = !suppressLoadingGate && isBlockLoading(block);
      // ONE LOADING SEQUENCE for kind blocks (Arman, 2026-08-24): a block
      // that came through the kind system (`metadata.__ir`) never hits the
      // legacy type-keyed loader gate. If its bridge produced a renderable
      // frame (serverData) mid-stream, the REAL component renders it live and
      // fills in; if the bridge declined (value below its first renderable
      // unit, or a wait-for-complete kind), the kind's DECLARED loader shows.
      // The per-kind knob is the bridge itself ({provisional: true} + its
      // own too-thin gate) — never a hardcoded type list here.
      const kindEnvelope = loading ? readEnvelope(block.metadata) : null;
      if (loading && kindEnvelope?.root.kind) {
        if (block.serverData === undefined) {
          return <PendingStructuredBlock key={index} envelope={kindEnvelope} />;
        }
        // Renderable frame → fall through to the real component, live.
      } else if (loading) {
        // Legacy blocks (no envelope — old messages, direct typed fences)
        // keep the bespoke type-keyed skeletons unchanged.
        const Loader = ARTIFACT_LOADING_COMPONENTS[_def.canvasType];
        if (Loader) {
          return <Loader key={index} />;
        }
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
