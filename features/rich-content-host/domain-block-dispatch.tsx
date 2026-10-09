"use client";
import { type RenderBlock, type BlockDispatchContext, type BlockRenderFn, DEFAULT_UNLABELED_FENCE_LANGUAGE, audioMimeFromUrl, isBlockLoading, type FeSynthesizedBlockType, type DetectorProtocolBlockType, type ProtocolBlockType, type ScalarGenericBlockType, type ShapeBlockType, type OpaqueBlockType, type KnownBlockType, reportUnregisteredBlockType } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/block-dispatch";
import { BLOCK_DISPATCH as ENGINE_BLOCK_DISPATCH, BLOCK_DISPATCH_CLASSIFICATION as ENGINE_BLOCK_DISPATCH_CLASSIFICATION, registerBlockDispatch } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/block-dispatch";
/**
 * block-dispatch — the declarative render-block dispatch registry.
 *
 * Replaces BlockRenderer's historical ~40-case switch with one data-driven
 * table keyed by block type and organized BY CROSSWALK CLASSIFICATION
 * (scripts/shape/content-vocab-crosswalk.json — the classification authority;
 * regenerate-check via `pnpm check:shapes:crosswalk`):
 *
 *  - protocol        → control tags, lifecycle/ack events, editor plumbing
 *  - scalar_generic  → text / code / tables / media primitives
 *  - shape           → structured content (registered kinds + shape candidates)
 *  - intentionally_opaque → the explicit unknown-data renderer
 *
 * EXHAUSTIVENESS is enforced twice:
 *  1. Compile time — each classification table `satisfies
 *     Record<XBlockType, BlockRenderFn>`, and the classification unions are
 *     asserted (via `AssertNever`) to exactly cover the GENERATED vocabulary
 *     (TypedRenderBlock ∪ ServerOnlyBlockType ∪ ClientOnlyBlockType) plus the
 *     documented FE-synthesized extras. A new generated block type fails the
 *     build here until it is classified and registered.
 *  2. Runtime — `reportUnregisteredBlockType` SCREAMS (console.error +
 *     structured captureError) for any block type with no registration. There
 *     is no silent default hiding an unregistered renderable.
 *
 * ROUTING ORDER (owned by BlockRenderer, the component):
 *  1. Kind route (shape classification, first-class): `applyIrKindRoute` —
 *     a resolved `metadata.__ir` envelope routes through the kind registry
 *     (`resolveComponent(kind, "web", "output")` / legacy bridge) BEFORE any
 *     type-keyed dispatch. See features/content-ir/react/kind-route.ts.
 *  2. Pending-structured skeleton (unresolved streaming JSON region).
 *  3. Unified artifact renderer (resolveArtifactDef + hasArtifactRenderer) —
 *     the single shared path for materializable standalone blocks.
 *  4. This table.
 *
 * Every entry preserves its legacy switch-case body byte-for-byte (props,
 * guards, comments). This file is ROUTING ONLY — no behavior changes.
 *
 * CODE-SPLITTING: all heavy components stay lazy exactly as before — the
 * table references the same lazily-wrapped `BlockComponents` members the
 * switch did (see BlockComponentRegistry.tsx); nothing new is imported
 * statically that wasn't already static in BlockRenderer.
 */

import type { AnswerEditRemarkMeta } from "@ai-matrx/chat/agents/redux/execution-system/instance-resources/remarks";
import React, { Fragment } from "react";
import { ReferenceRoleCaption } from "@ai-matrx/chat/agents/image-roles/ReferenceRoleCaption";
import { DecisionQuestionsTranscriptView } from "@/features/agents/decision-questions/DecisionQuestionsTranscriptView";
import { RemarksTranscriptView } from "@ai-matrx/chat/agents/components/messages-display/user/RemarksTranscriptView";
import { SpeechScriptTranscriptView } from "@ai-matrx/chat/agents/speech-script/SpeechScriptTranscriptView";
import { BlockComponents } from "./domain-block-components";
import type {
  TypedRenderBlock,
  ServerOnlyBlockType,
  ServerProtocolRenderBlock,
  ServerScalarGenericRenderBlock,
  ServerShapeRenderBlock,
  ServerOpaqueRenderBlock,
} from "@ai-matrx/agents/generated/stream-events";
import type { ClientOnlyBlockType } from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/client-blocks";
import { isUnifiedImageBlock } from "@/features/files/blocks/image/guards";
import { parseYouTubeUrl } from "@ai-matrx/rich-content/utils/youtube";
import AudioOutputBlockRenderer from "@/components/mardown-display/blocks/audio/AudioOutputBlockRenderer";
import VideoOutputBlockRenderer from "@/components/mardown-display/blocks/videos/VideoOutputBlockRenderer";
import { isInlineDecision } from "@/components/mardown-display/blocks/inline-decision/types";
import {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "@ai-matrx/rich-content/kinds/react/kind-route";
import WebAnalysisItemBlock from "@/components/mardown-display/blocks/web-analysis/WebAnalysisItemBlock";
import FlowStepResultBlock from "@/components/mardown-display/blocks/result-kinds/FlowStepResultBlock";
import CollectionResultBlock from "@/components/mardown-display/blocks/result-kinds/CollectionResultBlock";
import FileOperationResultBlock from "@/components/mardown-display/blocks/result-kinds/FileOperationResultBlock";
import ValueResultBlock from "@/components/mardown-display/blocks/result-kinds/ValueResultBlock";
import GoogleWorkspaceResultBlock from "@/components/mardown-display/blocks/google-kinds/GoogleWorkspaceResultBlock";
import GoogleMarketingResultBlock from "@/components/mardown-display/blocks/google-kinds/GoogleMarketingResultBlock";
import PlatformRecordBlock from "@/components/mardown-display/blocks/result-kinds/PlatformRecordBlock";
import RelationBlock from "@/components/mardown-display/blocks/result-kinds/RelationBlock";
import PickListBlock from "@/components/mardown-display/blocks/result-kinds/PickListBlock";
import {
  SeoRulingKeywordBlock,
  SeoRulingExampleBlock,
  SeoRulingDimensionBlock,
  SeoRulingMatcherHitBlock,
  SeoRulingCorrectionBlock,
  SeoRulingConfirmationBlock,
  SeoRulingMatcherBlock,
} from "@/components/mardown-display/blocks/seo-ruling-kinds/SeoRulingItemBlocks";
import {
  SeoRulingKeywordSetBlock,
  SeoRulingExampleSetBlock,
  SeoRulingDimensionCatalogBlock,
  SeoRulingMatcherHitSetBlock,
  SeoRulingCorrectionSetBlock,
  SeoRulingConfirmationSetBlock,
  SeoRulingMatcherSetBlock,
} from "@/components/mardown-display/blocks/seo-ruling-kinds/SeoRulingSetBlocks";
import {
  AgentFactoryBuildBlock,
  AgentFactoryContractBlock,
  AgentFactoryInstructionsBlock,
  AgentFactoryProofReviewBlock,
  AgentFactoryToolChoiceBlock,
} from "@/components/mardown-display/blocks/agent-factory-kinds/AgentFactoryKindBlocks";
// Lazy shell (next/dynamic ssr:false inside) — Babel/compiler weight ships in
// its own chunk, fetched only when a block actually routed to a db component.
import DbKindComponent from "@/features/content-ir/react/db-component/DbKindComponent";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  detectVideoMarkdown,
} from "@ai-matrx/rich-content/display/markdown-classification/processors/utils/content-splitter-v2";
import { readEnvelope } from "@ai-matrx/rich-content/kinds/redux/render-block-envelope";

/**
 * Helper to determine if JSON content is genuinely incomplete (still streaming)
 * or just marked incomplete due to formatting issues
 */
function isGenuinelyIncomplete(content: string): boolean {
  const trimmed = content.trim();
  const openBraces = (trimmed.match(/\{/g) || []).length;
  const closeBraces = (trimmed.match(/\}/g) || []).length;

  // If braces are unbalanced, it's genuinely incomplete
  return openBraces > closeBraces;
}

// ── Compile-time exhaustiveness (the satisfies/never gate) ──────────────────

type AssertNever<T extends never> = T;

/** The complete GENERATED vocabulary this renderer must cover. */
type GeneratedBlockType =
  TypedRenderBlock["type"] | ServerOnlyBlockType | ClientOnlyBlockType;

/**
 * Every generated block type MUST be classified. A new type landing in
 * stream-events.ts / client-blocks.ts without a classification here is a
 * COMPILE ERROR — classify it (matching the crosswalk) and register it below.
 */
type _EveryGeneratedTypeIsClassified = AssertNever<
  Exclude<GeneratedBlockType, KnownBlockType>
>;

/**
 * No classification may invent a type: everything classified is either
 * generated, a detector protocol token, or a documented FE-synthesized extra.
 */
type _NoInventedClassifications = AssertNever<
  Exclude<
    KnownBlockType,
    GeneratedBlockType | DetectorProtocolBlockType | FeSynthesizedBlockType
  >
>;

// ── Loud runtime path — no silent default ────────────────────────────────────

const reportedUnregisteredTypes = new Set<string>();

/**
 * A media block whose URL could not be read renders its own text (the line
 * the author wrote) and says so in the console — never an empty gap.
 */
function missingMediaFallback(
  ctx: BlockDispatchContext,
  kind: "image" | "video" | "audio",
): React.ReactElement | null {
  console.warn(
    `[BlockRenderer] ${kind} block without a readable URL — showing its text.`,
    ctx.block.content.slice(0, 200),
  );
  return ctx.block.content ? ctx.renderBasicMarkdown(ctx.block.content) : null;
}

/** Canonical readable fallback for structured handlers missing serverData. */
function renderJsonFallback(block: RenderBlock, index: number) {
  return (
    <BlockComponents.JsonBlock
      key={index}
      content={block.content}
      className="my-3"
    />
  );
}

/**
 * Shared three-branch registration for the search kind family (all thirteen
 * kinds share the uniform `{ value, isComplete }` streaming bridge): bridged
 * serverData → the kind's canonical component; still loading → loader;
 * otherwise readable JSON — never hidden.
 */
const searchKindEntry =
  (Component: React.ComponentType<{ serverData?: unknown }>): BlockRenderFn =>
  function SearchKindEntry({ block, index }) {
    if (block.serverData) {
      return <Component key={index} serverData={block.serverData} />;
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  };

// ── PROTOCOL registrations ───────────────────────────────────────────────────
// Control tags, lifecycle/ack events, editor plumbing. Never Shapes (R2).

const PROTOCOL_BLOCK_DISPATCH = {

  decision: (ctx) => {
    const { block, index, isStreamActive } = ctx;
    const candidateDecision: unknown =
      block.serverData ?? block.metadata?.decision;

    if (
      !isInlineDecision(candidateDecision) ||
      candidateDecision.options.length === 0
    ) {
      return ctx.renderBasicMarkdown(block.content);
    }
    const decisionData = candidateDecision;

    if (block.metadata?.isComplete === false) {
      return (
        <div
          key={index}
          className="my-1.5 px-3.5 py-2.5 border border-border rounded-md bg-card"
        >
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_6px_hsl(var(--primary)/0.4)]" />
            <span className="font-medium text-foreground">
              {decisionData.prompt || "Decision loading..."}
            </span>
          </div>
        </div>
      );
    }

    const metadataRawXml = block.metadata?.rawXml;
    const rawXml =
      typeof metadataRawXml === "string" ? metadataRawXml : block.content;

    return (
      <BlockComponents.InlineDecisionBlock
        key={index}
        decision={decisionData}
        isStreamActive={isStreamActive}
        rawXml={rawXml}
        onResolve={(_decisionId: string, xml: string, chosenText: string, choiceLabel: string | null) => {
          // The choice also rides the next message as a `choice` remark, in
          // the person's words (the one edit stager, via saveAnswerEdit).
          ctx.replaceBlockContent(xml, chosenText, {
            origin: "choice",
            projection: choiceLabel ? `I chose ${choiceLabel}.` : `I chose: ${chosenText}`,
            quote: decisionData.prompt || null,
          });
        }}
      />
    );
  },

  artifact: (ctx) => {
    // R3 recognition: a `<artifact>` whose id is a real canvas UUID is
    // MATERIALIZED → render the live row BY ID (ignore the inline body, which
    // is the model-facing archive). A non-UUID / absent id (the model's
    // `artifact_1`, or mid-stream) renders inline and stays a materialization
    // candidate. This is the single load-bearing branch that lets the canonical
    // `<artifact id>body</artifact>` text be both model-readable and rendered live.
    const { block, index, isStreamActive, messageId, conversationId, taskId } =
      ctx;
    const artifactMeta = block.metadata as
      | {
          artifactId?: string;
          artifactType?: string;
          artifactTitle?: string;
          version?: number;
        }
      | undefined;
    // A body still streaming is not persisted yet: it renders inline from its live envelope
    // (the by-id fallback forces `isComplete` and would draw a half body as an empty set).
    const bodyStreaming = isStreamActive && block.isStreamingBlock === true;
    if (isMaterializedArtifactId(artifactMeta?.artifactId) && !bodyStreaming) {
      return (
        <BlockComponents.ArtifactRefBlock
          key={index}
          serverData={{
            artifact_id: artifactMeta?.artifactId,
            artifact_type: artifactMeta?.artifactType,
            version: artifactMeta?.version,
            title: artifactMeta?.artifactTitle,
          }}
          // Inline archive body — lets ArtifactRefBlock fall back to rendering
          // the content if the UUID is invented / not-yet-persisted / missing,
          // instead of dead-ending on the "couldn't load" card.
          fallbackContent={block.content}
          fallbackMetadata={artifactMeta}
          fallbackServerData={block.serverData}
          messageId={messageId}
          conversationId={conversationId}
          taskId={taskId}
        />
      );
    }
    return (
      <BlockComponents.ArtifactBlock
        key={index}
        content={block.content}
        metadata={block.metadata}
        serverData={block.serverData}
        isStreamActive={isStreamActive}
        messageId={messageId}
        conversationId={conversationId}
        taskId={taskId}
      />
    );
  },

  matrx: ({ block, index, isStreamActive, conversationId }) => (
    // A ```matrx fence — one Matrx Envelope. In-content position resolves only
    // reference/secret (chips); other kinds show a neutral card. Fail-safe:
    // invalid JSON renders raw, never throws. See features/matrx-envelope/.
    // `streaming` lets an UNFINISHED directive render the package's
    // provisional card instead of the growing raw JSON, and read as cut off
    // once the stream has ended.
    // `conversationId`: a side-effect card in a message applies under its
    // conversation — the agent proposal's own key — never a second apply.
    <BlockComponents.MatrxEnvelopeBlock
      key={index}
      content={block.content}
      streaming={isStreamActive === true}
      {...(conversationId ? { conversationId } : {})}
    />
  ),

  matrx_file: ({ block, index }) => (
    // A link/bare URL to one of OUR files. The component re-derives the URL +
    // surrounding text from `content`, discovers the real file type, and
    // renders the universal inline previewer (or degrades to the link).
    <BlockComponents.MatrxFileBlock
      key={index}
      content={block.content}
      src={block.src}
      alt={block.alt}
      metadata={block.metadata}
    />
  ),

  schema_proposal: ({ block, index }) => (
    // A ```json output-schema proposal ({ name, schema, strict? }). Offers
    // "Apply to an agent" → writes agent.definition.output_schema. Fail-safe parse.
    // serverData (the `schema_proposal` kind bridge's clean, __kind-stripped
    // object) is preferred over the content parse when present.
    <BlockComponents.SchemaProposalBlock
      key={index}
      content={block.content}
      serverData={block.serverData}
    />
  ),

  editor_error: ({ block, index }) => (
    <BlockComponents.EditorErrorBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  editor_code_snippet: ({ block, index }) => (
    <BlockComponents.EditorCodeSnippetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  audiocite: ({ block, index }) => (
    <BlockComponents.AudioCitationBlock
      key={index}
      content={block.content}
      metadata={block.metadata as Record<string, string> | undefined}
    />
  ),

  function_result: ({ block, index }) => {
    // Python sends: { function_name, success, result, error, duration_ms }
    // Component wants: { functionName, success, result, error, durationMs }
    // TODO(python): rename function_name → functionName, duration_ms → durationMs.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.FunctionResultBlock
        key={index}
        functionName={(sd.function_name as string) ?? "unknown"}
        success={(sd.success as boolean) ?? false}
        result={sd.result}
        error={(sd.error as string | null) ?? null}
        durationMs={(sd.duration_ms as number | null) ?? null}
      />
    );
  },

  workflow_step: ({ block, index }) => {
    // Python sends: { step_name, status, data }
    // Component wants: { stepName, status, data }
    // TODO(python): rename step_name → stepName.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.WorkflowStepBlock
        key={index}
        stepName={(sd.step_name as string) ?? "unknown"}
        status={(sd.status as string) ?? "unknown"}
        data={(sd.data as Record<string, unknown>) ?? undefined}
      />
    );
  },

  search_error: ({ block, index }) => {
    // Python sends: { error: string; metadata?: Record<string, unknown> }
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.SearchErrorBlock
        key={index}
        error={(sd.error as string) ?? "Unknown search error"}
        metadata={(sd.metadata as Record<string, unknown>) ?? undefined}
      />
    );
  },

  structured_input_warning: ({ block, index }) => {
    // Python sends: { block_type, failures }
    // Component wants: { blockType, failures }
    // TODO(python): rename block_type → blockType.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.StructuredInputWarningBlock
        key={index}
        blockType={(sd.block_type as string) ?? "unknown"}
        failures={(sd.failures as Record<string, unknown>[]) ?? []}
      />
    );
  },

  podcast_stage: ({ block, index }) => {
    // Python sends: { stage, success, error, result_keys }
    // Component wants: { stage, success, error, resultKeys }
    // TODO(python): rename result_keys → resultKeys.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.PodcastStageBlock
        key={index}
        stage={(sd.stage as string) ?? ""}
        success={(sd.success as boolean) ?? false}
        error={(sd.error as string | null) ?? null}
        resultKeys={(sd.result_keys as string[]) ?? []}
      />
    );
  },

  podcast_complete: ({ block, index }) => {
    // Python sends: { show_id, success, episode_count, error }
    // Component wants: { showId, success, episodeCount, error }
    // TODO(python): rename show_id → showId, episode_count → episodeCount.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.PodcastCompleteBlock
        key={index}
        showId={(sd.show_id as string) ?? ""}
        success={(sd.success as boolean) ?? false}
        episodeCount={(sd.episode_count as number) ?? undefined}
        error={(sd.error as string | null) ?? null}
      />
    );
  },

  scrape_batch_complete: ({ block, index }) => {
    // Python sends: { total_scraped }
    // Component wants: { totalScraped }
    // TODO(python): rename total_scraped → totalScraped.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.ScrapeBatchCompleteBlock
        key={index}
        totalScraped={(sd.total_scraped as number) ?? 0}
      />
    );
  },

  value_store_stored: ({ block, index }) => {
    // Conversation Value Store (Pattern 2): a sub-agent result landed in
    // the store — compact "result ready" card; the descriptor's ```matrx
    // fence renders via the envelope chip renderer inside the component.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.ValueStoreStoredBlock
        key={index}
        descriptor={
          (sd.descriptor as React.ComponentProps<
            typeof BlockComponents.ValueStoreStoredBlock
          >["descriptor"]) ?? {}
        }
      />
    );
  },

  directive_receipt: ({ block, index }) => {
    // THE RECEIPT (DD-118). `message` is the SERVER's sentence and is rendered
    // verbatim — an applied write, a deduped re-send and an unconfirmed
    // proposal are three different sentences because the server wrote three
    // different sentences, never because this file decided so.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.DirectiveReceiptBlock
        key={index}
        directive={(sd.directive as string) ?? ""}
        outcome={
          (sd.outcome as React.ComponentProps<
            typeof BlockComponents.DirectiveReceiptBlock
          >["outcome"]) ?? "applied"
        }
        message={(sd.message as string) ?? ""}
        resourceKind={sd.resource_kind as string | undefined}
        resourceIds={sd.resource_ids as string[] | undefined}
        thread={sd.thread}
      />
    );
  },

  context_groomed: ({ block, index }) => {
    // Groom receipt — the MODEL's view was compacted; user view unchanged.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.ContextGroomedBlock
        key={index}
        stubbedKeys={(sd.stubbed_keys as string[]) ?? []}
        retainedKeys={(sd.retained_keys as string[]) ?? []}
      />
    );
  },
} satisfies Partial<Record<ProtocolBlockType, BlockRenderFn>>;

// ── SCALAR_GENERIC registrations ─────────────────────────────────────────────
// Text / code / tables / media primitives.

const SCALAR_GENERIC_BLOCK_DISPATCH = {

  video: (ctx) => {
    const { block, index } = ctx;
    // Route every markdown video through the canonical file-aware renderer.
    // A Matrx signed URL recovers its file_id before actions render, so copy
    // and share can never expose the private playback credential.
    const src = block.src ?? detectVideoMarkdown(block.content).src;
    if (!src) return missingMediaFallback(ctx, "video");
    return <VideoOutputBlockRenderer key={index} data={{ url: src }} />;
  },

  audio: (ctx) => {
    const { block, index } = ctx;
    // Audio that streamed in as a markdown/text link (the splitter's
    // `detectAudioMarkdown`). The URL is on `block.src`, mirroring the
    // markdown `image`/`video` cases. This is the live-stream twin of the
    // server-side `audio_output` case — both go through
    // `AudioOutputBlockRenderer` so the URL is resolved durably (file_id
    // recovery / public-URL preference) and "Copy link" never leaks a raw
    // signed S3 URL, even for an audio-only turn shown mid-stream.
    if (!block.src) return missingMediaFallback(ctx, "audio");
    return (
      <AudioOutputBlockRenderer
        key={index}
        data={{ url: block.src, mimeType: audioMimeFromUrl(block.src) }}
        title={block.alt && block.alt !== "Audio" ? block.alt : undefined}
      />
    );
  },

  audio_output: ({ block, index }) => {
    // Two inbound shapes during the Phase 0/2 transition:
    //  - Legacy `audio_output` event       → snake_case `{ url, mime_type }`
    //  - Canonical `media_block(kind=audio)` → camelCase `UnifiedMediaBlock`
    //    with `cdnUrl` / `signedUrl` / `externalUrl` (no `url`).
    // Read both; prefer the canonical fields when present.
    // TODO: collapse onto `UnifiedMediaBlock` end-to-end when audio gets
    // an `UnifiedAudioBlockRenderer` matching the image one.
    // Resolve the playable URL through the universal file handler instead of
    // echoing the raw `data.url`. The handler prefers the durable public/CDN
    // URL and re-mints expiring URLs from `file_id`, so audio plays during
    // streaming (when Python sends only a `file_id`, no minted URL) AND the
    // "Copy link" action never leaks a raw signed S3 URL. See the renderer
    // for the full durability rationale.
    const sd = (block.serverData ?? {}) as Record<string, unknown>;
    return <AudioOutputBlockRenderer key={index} data={sd} />;
  },

  image_output: ({ block, index }) => {
    // block.serverData IS the UnifiedImageBlock — every inbound path
    // (process-stream.ts, normalize-content-blocks.ts) converts to the
    // canonical shape before storing. See features/files/blocks/image/types.ts.
    // Use the guard to prove the shape rather than force-casting from
    // `Record<string, unknown>` — anything that doesn't pass the guard is
    // a stale entry from before the migration and gets silently skipped.
    if (!isUnifiedImageBlock(block.serverData)) return null;
    const image = block.serverData;
    return (
      <Fragment key={index}>
        <ReferenceRoleCaption role={image.referenceRole} name={image.referenceName} />
        <BlockComponents.ImageOutputBlock block={image} />
      </Fragment>
    );
  },

  video_output: ({ block, index }) => {
    // Resolve through the file handler (`VideoOutputBlockRenderer`) instead
    // of echoing the raw `data.url` — identical durability fix to
    // `audio_output`: the handler prefers the durable public/CDN URL and
    // re-mints expiring URLs from `file_id`, so video plays during streaming
    // (when Python sends only a `file_id`, no minted URL) AND "Copy link"
    // never leaks a raw signed S3 URL. The renderer also resolves the
    // Phase-1c `posterUrl` the same way. See the renderer for the rationale.
    const sd = (block.serverData ?? {}) as Record<string, unknown>;
    return (
      <Fragment key={index}>
        <ReferenceRoleCaption role={sd.reference_role} name={sd.reference_name} />
        <VideoOutputBlockRenderer data={sd} />
      </Fragment>
    );
  },

  youtube: ({ block, index }) => {
    // A YouTube link the splitter promoted from markdown (linked thumbnail,
    // plain link, or bare URL). videoId/start/title/poster live on metadata;
    // renders the same click-to-play embed as the server `media_block` case.
    const md = (block.metadata ?? {}) as Record<string, unknown>;
    const videoId = md.videoId as string | undefined;
    if (!videoId) return null;
    return (
      <BlockComponents.YouTubeEmbedBlock
        key={index}
        videoId={videoId}
        start={md.start as number | undefined}
        title={md.title as string | undefined}
        poster={md.poster as string | undefined}
        publishedAt={(md.publishedAt ?? md.published_at) as string | undefined}
      />
    );
  },

  media_block: ({ block, index }) => {
    // Document and YouTube kinds land here via the `media_block`
    // stream-event branch in process-stream.ts.
    const sd = (block.serverData ?? {}) as Record<string, unknown>;

    // YouTube: render the playable embed through the same component the
    // markdown `youtube` block uses (one component, one look). The Python
    // YouTubeBlock carries `video_id` (snake) and `external_url`; read both
    // casings defensively. Recover the start offset from the watch URL.
    if (sd.kind === "youtube") {
      const videoId = (sd.video_id ?? sd.videoId) as string | undefined;
      if (!videoId) return null;
      const externalUrl = (sd.external_url ?? sd.externalUrl) as
        string | undefined;
      const start = externalUrl
        ? parseYouTubeUrl(externalUrl)?.start
        : undefined;
      const sourceLabel = (sd.source_label ?? sd.sourceLabel) as
        string | undefined;
      return (
        <BlockComponents.YouTubeEmbedBlock
          key={index}
          videoId={videoId}
          start={start}
          title={sourceLabel}
          publishedAt={
            (sd.published_at ?? sd.publishedAt) as string | undefined
          }
        />
      );
    }

    // Document kind has no dedicated inline renderer yet — no-op to avoid
    // flashing a broken card. The data is preserved on the render block.
    // Phase 1c provides DocumentBlock.page1Url (full-res page 1 JPEG) for a
    // future <DocumentBlockInline> reading preview.
    return null;
  },
} satisfies Partial<Record<ScalarGenericBlockType, BlockRenderFn>>;

// ── SHAPE registrations ──────────────────────────────────────────────────────
// Structured content. Registered kinds route through the kind registry seam
// (`applyIrKindRoute`, Stage 1) and/or the unified artifact stage (Stage 3)
// upstream; entries here are either dedicated shape renderers or the preserved
// legacy path behind the unified stage.

const SHAPE_BLOCK_DISPATCH = {

  // Kind-routed (video_prompt_options): the complete-only bridge supplies
  // serverData; while streaming the bridge yields nothing yet, so show the
  // shared mini loader instead of raw JSON. A complete block that still has
  // no serverData falls through to a readable code block (never hidden).
  video_prompt_options: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.VideoPromptOptionsBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (map_topic_proposal_v1 — the tree the topical-map author
  // proposes, Lane G / R12): same complete-only bridge shape as above. The
  // block renders THE ONE proposal component (`MapTopicProposalView`) over the
  // shared `TopicTree`; a complete block with no serverData falls through to
  // readable JSON (never hidden).
  // Kind-routed (`decision_answers`) — the typed answers a decision holder
  // returns. Complete-only: a half-streamed distribution draws bars that do
  // not sum and a top answer that moves while it arrives.
  // The typed asks on a user turn — read-only in a transcript, live or reloaded.
  // The payload rides `serverData.payload` (normalize-content-blocks.ts).
  decision_questions: ({ block, index }) => (
    <DecisionQuestionsTranscriptView
      key={index}
      payload={(block.serverData?.payload as Record<string, unknown> | undefined) ?? null}
    />
  ),
  // The person's remarks that rode along with a user turn (quote + words /
  // choice / diff / answers), one compact row each.
  input_remarks: ({ block, index }) => (
    <RemarksTranscriptView
      key={index}
      payload={(block.serverData?.payload as Record<string, unknown> | undefined) ?? null}
    />
  ),
  speech_script: ({ block, index }) => (
    <SpeechScriptTranscriptView
      key={index}
      payload={(block.serverData?.payload as Record<string, unknown> | undefined) ?? null}
    />
  ),

  decision_answers: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.DecisionAnswersBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  map_topic_proposal: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MapTopicProposalBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (the news engine's six reader-facing kinds — digest, triage,
  // angle set, opportunity report, newsworthiness verdict, client context —
  // one block, routed inside by `__kind`). Complete-only.
  news_monitor_kind: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.NewsMonitorKindBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (`pr_play_menu` — the PR Director's menu of plays, each a
  // button). Complete-only: a half-streamed play has no action yet. The
  // conversation id rides along so a pressed play is that chat's next turn.
  pr_play_menu: ({ block, index, conversationId }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PrPlayMenuBlock
          key={index}
          serverData={block.serverData}
          conversationId={conversationId}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (list_change_proposal_v1 — THE PRIMITIVE: an agent proposes
  // changes to a list and the person accepts or rejects them right here).
  // Complete-only, like the proposal above: deciding on a half-parsed list
  // would write a row the model had not finished. `messageId` is passed
  // through because that is where the decisions are remembered
  // (chat.message.metadata); without it the component says so instead of
  // offering controls whose result would evaporate.
  list_change_proposal: ({ block, index, durableMessageId }) => {
    if (block.serverData) {
      return (
        <BlockComponents.ListChangeProposalBlock
          key={index}
          serverData={block.serverData}
          // Decisions are remembered ON the message row: the DATABASE id only.
          messageId={durableMessageId}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (keyword_relationship_research → keyword_research): the
  // bridge is STREAMING — serverData exists (and grows) mid-stream, so the
  // component renders each keyword chip live. Loader only before the first
  // parsed field; a complete block with no serverData stays readable JSON.
  keyword_research: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.KeywordResearchBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (keyword_classification_batch_v1 →
  // keyword_classification_batch): STREAMING bridge, same contract as
  // keyword_research above — classification cards render one by one.
  keyword_classification_batch: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.KeywordClassificationBatchBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  keyword_serp_intent_analysis: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.KeywordSerpIntentAnalysisBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (seo_keyword_relationship_research_result →
  // seo_keyword_research_result): an ENVELOPE kind. COMPLETE bridge — a
  // settled node result has no half-state — and the component DELEGATES the
  // nested artifact back to the registry rather than drawing keywords itself.
  seo_keyword_research_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.SeoKeywordResearchResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (page_brief → page_brief): STREAMING bridge, same contract as
  // the two above — the angle, brief, and warnings appear as they parse.
  page_brief: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PageBriefBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },
  cms_html_page_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.CmsHtmlPageResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) return <MatrxMiniLoader key={index} />;
    return renderJsonFallback(block, index);
  },
  // Kind-routed (`applet_build_result` — the Applet builder's answer). PARTIAL-READY: the
  // app's name and pages fill in as they stream; the code stays behind "Show the code".
  applet_build_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.AppletBuildResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) return <MatrxMiniLoader key={index} />;
    return renderJsonFallback(block, index);
  },
  // Kind-routed — the Spaces agents' answers (`spaces.build`, `spaces.design_database`,
  // `spaces.move_in`). Complete-only: Spaces acts on the finished answer.
  space_build_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.SpaceBuildResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) return <MatrxMiniLoader key={index} />;
    return renderJsonFallback(block, index);
  },
  space_database_design: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.SpaceDatabaseDesignBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) return <MatrxMiniLoader key={index} />;
    return renderJsonFallback(block, index);
  },
  space_notion_import: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.SpaceNotionImportBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) return <MatrxMiniLoader key={index} />;
    return renderJsonFallback(block, index);
  },

  // Kind-routed (media_chapters → media_chapters): STREAMING bridge, same
  // contract as page_brief — each chapter row appears as its object closes.
  // No `onSeek` here: chat has no player to seek. Surfaces that own one
  // (EpisodeChaptersPanel) render the same component with the handler.
  media_chapters: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MediaChaptersBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed media deliverables. Same contract as media_chapters:
  // STREAMING bridges (each image/clip appears as its object closes), a mini
  // loader before the first parsed field, and a readable code block if a
  // complete block somehow carries no serverData — never hidden content.
  generated_image_set: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.GeneratedImageSetBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  generated_video_set: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.GeneratedVideoSetBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  generated_audio: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.GeneratedAudioBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  podcast_episode: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PodcastEpisodeBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // `media_asset` (Arman's 2026-09-08 media-kind ruling) — ONE durable media
  // handle. ADDITIVE ONLY: this fires when a producer supplies the structured
  // kind. The bare-URL markdown paths above (`image` / `audio` / `video`,
  // fed by the splitter's detectImageMarkdown / extractAudioLink /
  // detectVideoMarkdown) are untouched and still handle everything that
  // arrives without structure — that degradation floor is the ruling.
  media_asset: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MediaAssetBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (memory_aid → memory_aid): STREAMING bridge — mnemonics /
  // analogies / palace loci appear one at a time as their objects close.
  memory_aid: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MemoryAidBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (memory_hint → memory_hint): the one-glance per-flashcard
  // aid; the component shows a writing row until the aid text parses.
  memory_hint: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MemoryHintBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (masterwork_checkup_finding): COMPLETE bridge — one gated
  // Final Checkup finding, rendered in Arman's four-step order. Same
  // three-branch contract as every other kind-routed entry.
  masterwork_checkup_finding: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MasterworkCheckupFindingBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (masterwork_result): COMPLETE bridge — what a Masterwork run
  // handed over, and THE place a stored rule id cited in the ruling becomes
  // the rule's own name with a door to it (walk 12, D14). Same three-branch
  // contract as every other kind-routed entry.
  masterwork_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.MasterworkResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (case_disclosure): COMPLETE bridge — the sealed case's growing
  // ledger. Same three-branch contract as every other kind-routed entry.
  case_disclosure: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.CaseDisclosureBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (refusal): COMPLETE bridge — an honest "not yet". NEVER an
  // error branch and never a toast: the desk declined, said what is missing
  // and how to get it, and that is a finished result. Same three-branch
  // contract as every other kind-routed entry.
  refusal: ({ block, index }) => {
    if (block.serverData) {
      return <BlockComponents.RefusalBlock key={index} serverData={block.serverData} />;
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (unfolding_ruling): COMPLETE bridge — where the desk committed.
  unfolding_ruling: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.UnfoldingRulingBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (serial_observation_timeline): COMPLETE bridge — one unfolded
  // case, drawn step by step. A sealed (held-out) case never carries its
  // resolution into the rendered value at all. Same three-branch contract as
  // every other kind-routed entry.
  serial_observation_timeline: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.SerialObservationTimelineBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (agent_result): COMPLETE bridge — what an agent RUN produced,
  // with the run's numbers behind one collapsed row and the envelope's
  // `messages` nowhere in the data. Same three-branch contract as every other
  // kind-routed entry.
  agent_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.AgentResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (node_outcome / run_result): the RUNTIME WRAPPERS. COMPLETE
  // bridges. Each transparently delegates the nested payload back to the
  // registry — never wrapper chrome or a payload renderer of its own.
  node_outcome: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.NodeOutcomeBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  run_result: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.RunResultBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (episode_title_options): STREAMING bridge — each title card
  // appears as it parses. Same loader / readable-JSON fallback contract as
  // the kind-routed entries above.
  episode_title_options: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.EpisodeTitleOptionsBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (seo_package): STREAMING bridge — the title arrives with its
  // character budget already measured and each FAQ question lands as its
  // object closes. Same loader / readable-JSON fallback contract as above.
  seo_package: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.SeoPackageBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (Website Factory per-page pipeline): STREAMING bridges, same
  // contract as the block above — each step's sections / issues / sources
  // appear as they parse, and a partially arrived step is readable, never JSON.
  plan_page_research: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PlanPageResearchBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  plan_page_outline: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PlanPageOutlineBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  plan_page_draft: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PlanPageDraftBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  plan_page_review: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.PlanPageReviewBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  cms_page_build: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.CmsPageBuildBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (ingested_sources): STREAMING bridge — the intake regrouped
  // into the sources a person recognizes, with a loud shortfall card when a
  // handed-in source could not be read. Same three-branch contract as every
  // other kind-routed entry.
  ingested_sources: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.IngestedSourcesBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (study_notes): STREAMING bridge — sections appear as they
  // parse, so the document builds itself on screen.
  study_notes: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.StudyNotesBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (lesson_script_set → lesson_scripts): STREAMING bridge —
  // lesson sections appear as their objects close; a section whose narration
  // is still streaming shows its own in-card skeleton.
  lesson_scripts: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.LessonScriptsBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed (study_pack_set → study_pack): STREAMING bridge — the pack
  // header renders immediately and each member artifact is DELEGATED to its
  // own kind's component as it arrives (skeletons from the kind loading
  // registry for the rest).
  study_pack: ({ block, index }) => {
    if (block.serverData) {
      return (
        <BlockComponents.StudyPackBlock
          key={index}
          serverData={block.serverData}
        />
      );
    }
    if (isBlockLoading(block)) {
      return <MatrxMiniLoader key={index} />;
    }
    return renderJsonFallback(block, index);
  },

  // Kind-routed search kind family (Search Kinds Pilot): STREAMING bridges —
  // serverData is the uniform `{ value, isComplete }` wrapper; the collection
  // delegates every nested instance to its kind's canonical component. Same
  // loader / readable-JSON fallback contract as the entries above.
  // Kind-routed scraper / web_page family (Scraper Kinds Run): same uniform
  // `{ value, isComplete }` bridge, so the SAME entry shape serves it.
  scraped_page: searchKindEntry(BlockComponents.ScrapedPageBlock),
  scraper_batch_result: searchKindEntry(
    BlockComponents.ScraperBatchResultBlock,
  ),
  scraper_crawl_result: searchKindEntry(
    BlockComponents.ScraperCrawlResultBlock,
  ),
  page_link: searchKindEntry(BlockComponents.PageLinkBlock),
  link_buckets: searchKindEntry(BlockComponents.LinkBucketsBlock),
  page_image: searchKindEntry(BlockComponents.PageImageBlock),
  page_video: searchKindEntry(BlockComponents.PageVideoBlock),
  page_audio: searchKindEntry(BlockComponents.PageAudioBlock),
  page_heading: searchKindEntry(BlockComponents.PageHeadingBlock),
  page_section: searchKindEntry(BlockComponents.PageSectionBlock),
  page_list: searchKindEntry(BlockComponents.PageListBlock),
  page_block: searchKindEntry(BlockComponents.PageBlockBlock),
  code_block: searchKindEntry(BlockComponents.CodeBlockKindBlock),
  redirect_hop: searchKindEntry(BlockComponents.RedirectHopBlock),
  content_fingerprint: searchKindEntry(BlockComponents.ContentFingerprintBlock),
  page_metadata: searchKindEntry(BlockComponents.PageMetadataBlock),
  page_removal: searchKindEntry(BlockComponents.PageRemovalBlock),
  page_cleaning_report: searchKindEntry(
    BlockComponents.PageCleaningReportBlock,
  ),
  web_search_results: searchKindEntry(BlockComponents.WebSearchResultsBlock),
  web_result: searchKindEntry(BlockComponents.WebResultBlock),
  news_result: searchKindEntry(BlockComponents.NewsResultBlock),
  video_result: searchKindEntry(BlockComponents.VideoResultBlock),
  faq_item: searchKindEntry(BlockComponents.FaqItemBlock),
  discussion_result: searchKindEntry(BlockComponents.DiscussionResultBlock),
  local_place: searchKindEntry(BlockComponents.LocalPlaceBlock),
  entity_card: searchKindEntry(BlockComponents.EntityCardBlock),
  ai_answer: searchKindEntry(BlockComponents.AiAnswerKindBlock),
  rating: searchKindEntry(BlockComponents.RatingBlock),
  opening_hours: searchKindEntry(BlockComponents.OpeningHoursBlock),
  postal_address: searchKindEntry(BlockComponents.PostalAddressBlock),
  geo_coordinates: searchKindEntry(BlockComponents.GeoCoordinatesBlock),

  // Kind-routed rank / SERP-landscape family (Rank Kinds Run): identical
  // uniform `{ value, isComplete }` bridge, so the SAME three-branch entry
  // serves it — never a second copy of this registration shape.
  seo_rank_serp_landscape: searchKindEntry(
    BlockComponents.SeoRankSerpLandscapeBlock,
  ),
  serp_placement: searchKindEntry(BlockComponents.SerpPlacementBlock),
  seo_rank_reading: searchKindEntry(BlockComponents.SeoRankReadingBlock),
  seo_rank_target: searchKindEntry(BlockComponents.SeoRankTargetBlock),
  seo_rank_portfolio: searchKindEntry(BlockComponents.SeoRankPortfolioBlock),
  seo_rank_target_removal: searchKindEntry(
    BlockComponents.SeoRankTargetRemovalBlock,
  ),
  provider_run_receipt: searchKindEntry(
    BlockComponents.ProviderRunReceiptBlock,
  ),

  // Kind-routed commerce family. The former skeptic_challenge draft is not a
  // second shape: its emitter returns value_assessment and dispatches there.
  intake_photo_grouping: searchKindEntry(
    BlockComponents.IntakePhotoGroupingBlock,
  ),
  item_vision_extraction: searchKindEntry(
    BlockComponents.ItemVisionExtractionBlock,
  ),
  lot_detection: searchKindEntry(BlockComponents.LotDetectionBlock),
  product_research: searchKindEntry(BlockComponents.ProductResearchBlock),
  value_assessment: searchKindEntry(BlockComponents.ValueAssessmentBlock),
  asset_grading: searchKindEntry(BlockComponents.AssetGradingBlock),
  media_list_ranking_result: searchKindEntry(BlockComponents.MediaListRankingBlock),
  media_candidate_verdict: searchKindEntry(BlockComponents.MediaCandidateVerdictBlock),
  enrichment_verification: searchKindEntry(
    BlockComponents.EnrichmentVerificationBlock,
  ),
  pricing_proposal: searchKindEntry(BlockComponents.PricingProposalBlock),
  listing_draft: searchKindEntry(BlockComponents.ListingDraftBlock),
  review_verdict: searchKindEntry(BlockComponents.ReviewVerdictBlock),
  publish_preflight: searchKindEntry(BlockComponents.PublishPreflightBlock),

  // Kind-routed Lulu print lane family: same uniform `{ value, isComplete }`
  // bridge, so the SAME three-branch entry serves it.
  lulu_print_cost_calculation: searchKindEntry(
    BlockComponents.LuluPrintCostBlock,
  ),
  lulu_shipping_options: searchKindEntry(
    BlockComponents.LuluShippingOptionsBlock,
  ),
  lulu_cover_dimensions: searchKindEntry(
    BlockComponents.LuluCoverDimensionsBlock,
  ),
  lulu_print_job: searchKindEntry(BlockComponents.LuluPrintJobBlock),
  lulu_print_product_matches: searchKindEntry(
    BlockComponents.LuluPrintProductMatchesBlock,
  ),

  // Kind-routed tabular primitive (Table Kinds Run): same uniform
  // `{ value, isComplete }` bridge, so the SAME three-branch entry serves it.
  data_table: searchKindEntry(BlockComponents.DataTableBlock),

  // Kind-routed social-intelligence family (SI-07c): same uniform bridge.
  social_post: searchKindEntry(BlockComponents.SocialPostBlock),
  social_profile: searchKindEntry(BlockComponents.SocialProfileBlock),
  post_transcript: searchKindEntry(BlockComponents.PostTranscriptBlock),
  outlier_row: searchKindEntry(BlockComponents.OutlierRowBlock),
  ad_creative: searchKindEntry(BlockComponents.AdCreativeBlock),
  swipe_collection: searchKindEntry(BlockComponents.SwipeCollectionBlock),

  // Kind-routed RAG retrieval + citation family (RAG Kinds Run): identical
  // uniform `{ value, isComplete }` bridge, so the SAME three-branch entry
  // serves it too. `source_ref` dispatched standalone renders its CARD
  // posture; the inline chip posture is reached only from a parent kind
  // through `RagKindNested`, never from this table.
  source_ref: searchKindEntry(BlockComponents.SourceRefBlock),
  retrieved_chunk: searchKindEntry(BlockComponents.RetrievedChunkBlock),
  rag_search_result: searchKindEntry(BlockComponents.RagSearchResultBlock),
  rag_cross_doc_search_result: searchKindEntry(
    BlockComponents.RagCrossDocSearchResultBlock,
  ),
  rag_synthesize_result: searchKindEntry(
    BlockComponents.RagSynthesizeResultBlock,
  ),

  // NOTE: like `table` — normally consumed by the unified artifact stage
  // (TranscriptArtifact); preserved legacy path below.
  transcript: ({ block, index }) => (
    <BlockComponents.TranscriptBlock key={index} content={block.content} />
  ),

  // NOTE: normally consumed by the unified artifact stage
  // (StructuredInfoArtifact); preserved legacy path below.
  structured_info: ({ block, index }) => (
    <BlockComponents.StructuredPlanBlock
      key={index}
      // Kind-routed blocks (structured_info) deliver the projected
      // markdown as serverData { content } - a JSON __kind arrival has
      // JSON text in block.content, so the bridge output is the only
      // renderable text for that path. Fence arrivals keep block.content.
      content={
        typeof (block.serverData as { content?: unknown } | null | undefined)
          ?.content === "string"
          ? (block.serverData as { content: string }).content
          : block.content
      }
    />
  ),

  item_presentation: ({ block, index, isStreamActive }) => (
    // Owns all its phases internally: instant skeleton from a partial JSON
    // scan → recognized icon/accent + DB auto-enrichment → grow-in details →
    // window-panel open on click. Forgiving for unknown types; never errors.
    <BlockComponents.ItemPresentationBlock
      key={index}
      content={block.content}
      isStreamActive={Boolean(block.isStreamingBlock) || isStreamActive}
    />
  ),

  search_results: ({ block, index }) => {
    // Python sends: { results?: SearchResultItem[]; metadata?: Record<string, unknown> }
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.SearchResultsBlock
        key={index}
        results={(sd.results as Record<string, unknown>[]) ?? []}
        metadata={(sd.metadata as Record<string, unknown>) ?? {}}
      />
    );
  },

  fetch_results: ({ block, index }) => {
    // Python sends: { results?: FetchResultItem[]; metadata?: Record<string, unknown> }
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.FetchResultsBlock
        key={index}
        results={(sd.results as Record<string, unknown>[]) ?? []}
        metadata={(sd.metadata as Record<string, unknown>) ?? {}}
      />
    );
  },

  categorization_result: ({ block, index }) => {
    // Python sends: { prompt_id, category, tags, description, dry_run, metadata }
    // Component wants: { promptId, category, tags, description, dryRun, metadata }
    // TODO(python): rename prompt_id → promptId, dry_run → dryRun.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.CategorizationResultBlock
        key={index}
        promptId={(sd.prompt_id as string) ?? ""}
        category={(sd.category as string) ?? ""}
        tags={(sd.tags as string[]) ?? []}
        description={(sd.description as string) ?? undefined}
        dryRun={(sd.dry_run as boolean) ?? undefined}
        metadata={(sd.metadata as Record<string, unknown>) ?? undefined}
      />
    );
  },

  display_questionnaire: ({ block, index, conversationId, durableMessageId }) => {
    // Python sends: { introduction, questions }
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.DisplayQuestionnaireBlock
        key={index}
        introduction={(sd.introduction as string) ?? ""}
        questions={(sd.questions as Record<string, unknown>[]) ?? []}
        conversationId={conversationId}
        messageId={durableMessageId}
        blockIndex={index}
      />
    );
  },

  // The `web_analysis_item` family route (features/content-ir/react/kind-route.ts
  // resolver-only path): all 83 `web_*_v1` site-audit check kinds carry one
  // verified shape, so one component serves every one of them — pointed at by
  // a `kind_component` row per kind. Reached ONLY via applyIrKindRoute.
  web_analysis_item: ({ block, index }) => (
    <WebAnalysisItemBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  // The four runtime-result family routes (features/content-ir/react/kind-route.ts
  // resolver-only path): 61 workflow / tool / filesystem kinds, four shared
  // reader questions — where did the run go, how many came out and what was
  // lost, which file and what happened to it, what is the value. One component
  // per family, pointed at by a `kind_component` row per kind. Reached ONLY via
  // applyIrKindRoute.
  flow_step_result: ({ block, index }) => (
    <FlowStepResultBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  collection_result: ({ block, index }) => (
    <CollectionResultBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  file_operation_result: ({ block, index }) => (
    <FileOperationResultBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  value_result: ({ block, index }) => (
    <ValueResultBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  // The two GOOGLE tool-result routes (features/content-ir/react/kind-route.ts
  // resolver-only path): `google_workspace_result` and `google_marketing_result`
  // are ONE union kind per tool — fifteen Workspace actions and six marketing
  // reads — so each gets ONE component that branches on the shape of the data,
  // pointed at by that kind's `kind_component` row. Before these rows existed
  // every Google answer reached the reader through the generic floor, which
  // cannot tell a dry-run PREVIEW from a receipt or a capped window from a
  // total. Reached ONLY via applyIrKindRoute.
  google_workspace_result: ({ block, index }) => (
    <GoogleWorkspaceResultBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  google_marketing_result: ({ block, index }) => (
    <GoogleMarketingResultBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  // The `platform_record` route (features/content-ir/react/kind-route.ts
  // resolver-only path): `data.read_record` reads ONE platform row of any
  // registered entity type and answers in one generic Record shape, so ONE
  // component serves every type — the row's identity and its door lead, the
  // withheld columns are named, and `fields` goes to the platform's value
  // viewer. The kind was published INACTIVE with no component row while the
  // engine ignores `is_active`, so until this route existed a Record a workflow
  // read reached the reader through the generic floor. Reached ONLY via
  // applyIrKindRoute.
  platform_record: ({ block, index }) => (
    <PlatformRecordBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  // KINDS-GLUE wave 4.1: a `relation` is one chip that opens through its token's own door, and a
  // `pick_list` draws its Pick list's records as choices. Reached via applyIrKindRoute (compiled
  // bridges in features/content-ir/kinds/record-primitives.ts).
  relation: ({ block, index }) => (
    <RelationBlock key={index} content={block.content} metadata={block.metadata} />
  ),
  pick_list: ({ block, index }) => (
    <PickListBlock key={index} content={block.content} metadata={block.metadata} />
  ),

  // The five Agent Factory step kinds (kind-route.ts resolver-only path): each
  // has its own bundled `kind_component` row whose key IS the slug. Models:
  // aidream/aidream/kinds/agent_factory.py.
  agent_factory_contract: ({ block, index }) => (
    <AgentFactoryContractBlock key={index} content={block.content} metadata={block.metadata} />
  ),
  agent_factory_tool_choice: ({ block, index }) => (
    <AgentFactoryToolChoiceBlock key={index} content={block.content} metadata={block.metadata} />
  ),
  agent_factory_instructions: ({ block, index }) => (
    <AgentFactoryInstructionsBlock key={index} content={block.content} metadata={block.metadata} />
  ),
  agent_factory_proof_review: ({ block, index }) => (
    <AgentFactoryProofReviewBlock key={index} content={block.content} metadata={block.metadata} />
  ),
  agent_factory_build: ({ block, index }) => (
    <AgentFactoryBuildBlock key={index} content={block.content} metadata={block.metadata} />
  ),

  // The fourteen keyword RULING SESSION routes (kind-route.ts resolver-only
  // path): the inputs of the SEO keyword Ruling Session agents. Each kind has
  // its own bundled `kind_component` row whose key IS the slug; the seven
  // collections render their rows through the item kinds' components.
  seo_ruling_keyword: ({ block, index }) => (
    <SeoRulingKeywordBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_example: ({ block, index }) => (
    <SeoRulingExampleBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_dimension: ({ block, index }) => (
    <SeoRulingDimensionBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_matcher_hit: ({ block, index }) => (
    <SeoRulingMatcherHitBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_correction: ({ block, index }) => (
    <SeoRulingCorrectionBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_confirmation: ({ block, index }) => (
    <SeoRulingConfirmationBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_matcher: ({ block, index }) => (
    <SeoRulingMatcherBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_keyword_set: ({ block, index }) => (
    <SeoRulingKeywordSetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_example_set: ({ block, index }) => (
    <SeoRulingExampleSetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_dimension_catalog: ({ block, index }) => (
    <SeoRulingDimensionCatalogBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_matcher_hit_set: ({ block, index }) => (
    <SeoRulingMatcherHitSetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_correction_set: ({ block, index }) => (
    <SeoRulingCorrectionSetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_confirmation_set: ({ block, index }) => (
    <SeoRulingConfirmationSetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
  seo_ruling_matcher_set: ({ block, index }) => (
    <SeoRulingMatcherSetBlock
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),

  // The db-override flip (kind-route.ts): an ACTIVE `source='db'`
  // kind_component row won the resolution — render the user-authored
  // component (in-page allowlist compile, or the sandboxed iframe html
  // flavor). The shell is lazy; errors fall back to the generic structured
  // viewer inside the component, never a blank hole. Reached ONLY via
  // applyIrKindRoute — nothing emits this block type upstream.
  [DB_KIND_COMPONENT_KEY]: ({ block, index, conversationId, messageId, isStreamActive }) => (
    <DbKindComponent
      key={index}
      content={block.content}
      metadata={block.metadata}
      // The item's durable state (itemState / save_item_state / run_shortcut
      // saveAs) is keyed to this answer's block.
      chatBlock={{ conversationId, messageId, blockIndex: index, streaming: isStreamActive }}
      organizationId={
        typeof block.metadata?.organization_id === "string"
          ? block.metadata.organization_id
          : null
      }
    />
  ),
} satisfies Partial<Record<ShapeBlockType, BlockRenderFn>>;

// ── INTENTIONALLY_OPAQUE registrations ───────────────────────────────────────

const OPAQUE_BLOCK_DISPATCH = {
  unknown_data_event: ({ block, index, conversationId, messageId }) => {
    // Fallback for unknown data event types.
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.UnknownDataEventBlock
        key={index}
        dataType={(sd._dataType as string) ?? "unknown"}
        data={sd}
        conversationId={conversationId}
        messageId={messageId}
      />
    );
  },
} satisfies Partial<Record<OpaqueBlockType, BlockRenderFn>>;

// ── The merged registry ──────────────────────────────────────────────────────

/**
 * matrx-frontend's half of THE block dispatch: every block type this app owns (domain kinds,
 * protocol cards, transcript views). The engine's generic half ships in @ai-matrx/rich-content;
 * this module registers the rest at load and keeps the compile-time check that the two halves
 * together cover every generated block type.
 */
export const DOMAIN_BLOCK_DISPATCH = {
  ...PROTOCOL_BLOCK_DISPATCH,
  ...SCALAR_GENERIC_BLOCK_DISPATCH,
  ...SHAPE_BLOCK_DISPATCH,
  ...OPAQUE_BLOCK_DISPATCH,
} satisfies Partial<Record<KnownBlockType, BlockRenderFn>>;

// Every known block type is dispatched by the engine or by this app — a new generated type
// with neither is a compile error here.
type _EveryKnownTypeIsDispatched = AssertNever<
  Exclude<KnownBlockType, keyof typeof DOMAIN_BLOCK_DISPATCH | keyof typeof ENGINE_BLOCK_DISPATCH>
>;

/** This app's half of the classification buckets (the engine's half: BLOCK_DISPATCH_CLASSIFICATION). */
export const DOMAIN_BLOCK_DISPATCH_CLASSIFICATION = {
  protocol: Object.keys(PROTOCOL_BLOCK_DISPATCH),
  scalar_generic: Object.keys(SCALAR_GENERIC_BLOCK_DISPATCH),
  shape: Object.keys(SHAPE_BLOCK_DISPATCH),
  intentionally_opaque: Object.keys(OPAQUE_BLOCK_DISPATCH),
} as const;

type DispatchBucket = keyof typeof DOMAIN_BLOCK_DISPATCH_CLASSIFICATION;

/**
 * THE classification as this app resolves it — the engine's generic half plus this app's domain
 * half, per bucket. Read this (never the engine's `BLOCK_DISPATCH_CLASSIFICATION` alone, which
 * cannot see a single domain kind) whenever a check asks "is X dispatched as a shape?".
 */
export const APP_BLOCK_DISPATCH_CLASSIFICATION: Readonly<Record<DispatchBucket, readonly string[]>> = {
  protocol: [...ENGINE_BLOCK_DISPATCH_CLASSIFICATION.protocol, ...DOMAIN_BLOCK_DISPATCH_CLASSIFICATION.protocol],
  scalar_generic: [...ENGINE_BLOCK_DISPATCH_CLASSIFICATION.scalar_generic, ...DOMAIN_BLOCK_DISPATCH_CLASSIFICATION.scalar_generic],
  shape: [...ENGINE_BLOCK_DISPATCH_CLASSIFICATION.shape, ...DOMAIN_BLOCK_DISPATCH_CLASSIFICATION.shape],
  intentionally_opaque: [
    ...ENGINE_BLOCK_DISPATCH_CLASSIFICATION.intentionally_opaque,
    ...DOMAIN_BLOCK_DISPATCH_CLASSIFICATION.intentionally_opaque,
  ],
};

registerBlockDispatch(DOMAIN_BLOCK_DISPATCH);
