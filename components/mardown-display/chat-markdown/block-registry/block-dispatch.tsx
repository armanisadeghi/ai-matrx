"use client";
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

import React from "react";
import { BlockComponents } from "./BlockComponentRegistry";
import { looksLikeDiff } from "../diff-blocks/diff-style-registry";
import { InlineCodeSnippet } from "../InlineCodeSnippet";
import type {
  TypedRenderBlock,
  ServerOnlyBlockType,
  ServerProtocolRenderBlock,
  ServerScalarGenericRenderBlock,
  ServerShapeRenderBlock,
  ServerOpaqueRenderBlock,
} from "@/types/python-generated/stream-events";
import type { ClientOnlyBlockType } from "@/components/mardown-display/markdown-classification/processors/utils/client-blocks";
import { isUnifiedImageBlock } from "@/features/files/blocks/image/guards";
import { parseYouTubeUrl } from "@/lib/media/youtube";
import AudioOutputBlockRenderer from "@/components/mardown-display/blocks/audio/AudioOutputBlockRenderer";
import VideoOutputBlockRenderer from "@/components/mardown-display/blocks/videos/VideoOutputBlockRenderer";
import { isInlineDecision } from "@/components/mardown-display/blocks/inline-decision/types";
import {
  DB_KIND_COMPONENT_KEY,
  GENERIC_STRUCTURED_COMPONENT_KEY,
} from "@/features/content-ir/react/kind-route";
import GenericStructuredBlock from "@/components/mardown-display/blocks/generic/GenericStructuredBlock";
// Lazy shell (next/dynamic ssr:false inside) — Babel/compiler weight ships in
// its own chunk, fetched only when a block actually routed to a db component.
import DbKindComponent from "@/features/content-ir/react/db-component/DbKindComponent";
import { CodeBlockWithContextAttach } from "@/features/canvas/materialization/CodeBlockWithContextAttach";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

// ── The flat render-block shape ──────────────────────────────────────────────

/**
 * Flat render block interface used by BlockRenderer + this dispatch table.
 *
 * This is intentionally NOT a discriminated union. Using a discriminated union
 * (like TypedRenderBlock) causes TypeScript to narrow `block` to `never` for
 * any registration whose type string isn't in the union — making shared entry
 * functions unusable.
 *
 * All fields are the union of what any block registration can access. Specific
 * typed data for server-processed blocks arrives via `serverData` (the Python
 * `data` field).
 *
 * The `type` string covers ALL blocks: Python-typed (TypedRenderBlock["type"]),
 * client-splitter types (ClientOnlyBlockType), FE-synthesized data-event
 * wrappers (ServerOnlyBlockType), and the open `string` fallback for anything
 * Python adds before TypeScript types catch up.
 */
export interface RenderBlock {
  type:
    | TypedRenderBlock["type"]
    | ClientOnlyBlockType
    | ServerOnlyBlockType
    | string;
  content: string;
  /** Python's `data` field — typed by the server, accessed via serverData in the renderer. */
  serverData?: Record<string, unknown>;
  /** For code blocks: the language identifier (e.g. "typescript", "json"). */
  language?: string;
  /** For image/video blocks parsed from markdown: the media URL. */
  src?: string;
  /** For image/video blocks parsed from markdown: the alt text. */
  alt?: string;
  /** Block-specific metadata from the splitter or server. */
  metadata?: Record<string, unknown>;
  /** True when this block was emitted mid-stream (status: "streaming") — content is incomplete. */
  isStreamingBlock?: boolean;
}

// ── Dispatch context ─────────────────────────────────────────────────────────

/**
 * Everything a registration may read. Assembled once per block by
 * BlockRenderer (which owns the hooks — registrations are pure render
 * functions and MUST NOT call hooks).
 */
export interface BlockDispatchContext {
  block: RenderBlock;
  index: number;
  isStreamActive?: boolean;
  conversationId?: string;
  messageId?: string;
  taskId?: string;
  requestId?: string;
  isLastReasoningBlock?: boolean;
  /** Per-conversation display flags (instanceUIState) — resolved by the component. */
  hideReasoning: boolean;
  hideToolResults: boolean;
  /** Generic handler: replaces `original` substring with `replacement` in the full content string. */
  replaceBlockContent: (original: string, replacement: string) => void;
  /** The shared BasicMarkdownContent renderer, pre-wired with edit/diagnostic props. */
  renderBasicMarkdown: (content: string) => React.ReactElement;
}

export type BlockRenderFn = (
  ctx: BlockDispatchContext,
) => React.ReactElement | null;

// ── Shared helpers (moved verbatim from BlockRenderer) ──────────────────────

/** Language for ``` fences with no info string (plain text / notes / prose). */
export const DEFAULT_UNLABELED_FENCE_LANGUAGE = "markdown";

/**
 * Best-effort MIME type for an audio URL parsed from a markdown link, derived
 * from its file extension (query string ignored). Lets the audio player emit a
 * correct `<source type>`; returns undefined for unknown extensions, which the
 * player handles gracefully.
 */
export function audioMimeFromUrl(url: string): string | undefined {
  const ext = url
    .split(/[?#]/)[0]
    .match(/\.([a-z0-9]+)$/i)?.[1]
    ?.toLowerCase();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "flac":
      return "audio/flac";
    case "weba":
    case "webm":
      return "audio/webm";
    default:
      return undefined;
  }
}

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

/**
 * Returns true when a block should show its loading skeleton instead of
 * attempting to parse incomplete content.
 *
 * A block is considered "still loading" when either:
 *  - It was emitted mid-stream (status === "streaming") — content is definitely
 *    incomplete because the accumulator hasn't seen the closing fence/tag yet.
 *  - The splitter/server explicitly marked it isComplete: false AND the
 *    brace count shows the JSON is still open.
 */
export function isBlockLoading(block: {
  isStreamingBlock?: boolean;
  metadata?: Record<string, unknown>;
  content: string;
}): boolean {
  if (block.isStreamingBlock) return true;
  if (
    block.metadata?.isComplete === false &&
    isGenuinelyIncomplete(block.content)
  )
    return true;
  return false;
}

// ── The classified vocabulary ────────────────────────────────────────────────
//
// One union per crosswalk classification. Server-side members DERIVE from the
// generated classification-grouped unions in stream-events.ts (the crosswalk
// build cross-checks those groupings against the rule tables); frontend-side
// members mirror the crosswalk rows for `frontend:typed_render_block` /
// `frontend:client_only_render_block` / detector tokens. The dispatch test
// (__tests__/block-dispatch.test.ts) verifies these groupings against the
// crosswalk JSON so a reclassification cannot silently drift.

/**
 * FE-synthesized block types with NO generated-union membership:
 *  - `media_block` — synthesized by process-stream.ts from the `media_block`
 *    data event (document/youtube kinds). NOT yet a crosswalk row (the
 *    crosswalk scans the generated unions; this wrapper predates them) —
 *    known W1-C inputs gap, classified scalar_generic here to match its
 *    audio_output/image_output/video_output siblings.
 *  - `generic_structured` — produced ONLY by `applyIrKindRoute`'s R6 generic
 *    fallback (a KNOWN shape nothing render-trusted claims); never emitted
 *    upstream, so it has no vocabulary row. Shape-classified by construction.
 *  - `db_kind_component` — produced ONLY by `applyIrKindRoute`'s db-override
 *    flip (an ACTIVE `content_ir.kind_component` row with `source='db'` won
 *    the resolution); never emitted upstream. Shape-classified by
 *    construction.
 *  - `video_prompt_options` — produced ONLY by `applyIrKindRoute`'s
 *    compiled-bridge flip for the registered `video_prompt_options` kind
 *    (`__kind` JSON arrival only — no tag/fence surface); never emitted
 *    upstream. Shape-classified by construction.
 *  - `keyword_research` / `keyword_classification_batch` — produced ONLY by
 *    `applyIrKindRoute`'s compiled-bridge flips for the registered
 *    `keyword_relationship_research` / `keyword_classification_batch_v1`
 *    kinds (`__kind` JSON arrival only — no tag/fence surface); never
 *    emitted upstream. Shape-classified by construction. STREAMING bridges:
 *    serverData exists (and grows) mid-stream, so the components render
 *    item-by-item live.
 */
export type FeSynthesizedBlockType =
  | "media_block"
  | "video_prompt_options"
  | "keyword_research"
  | "keyword_classification_batch"
  | typeof GENERIC_STRUCTURED_COMPONENT_KEY
  | typeof DB_KIND_COMPONENT_KEY;

/**
 * Detector-owned protocol tokens (crosswalk rows sourced ONLY from the
 * splitter/accumulator ATTR_XML_TAGS tables — no TS render-block union
 * membership): the editor pill round-trip plumbing + audio citations.
 */
export type DetectorProtocolBlockType =
  | "editor_error"
  | "editor_code_snippet"
  | "audiocite";

/** Crosswalk classification: protocol — control plumbing, never Shapes. */
export type ProtocolBlockType =
  | ServerProtocolRenderBlock["type"]
  | "thinking"
  | "reasoning"
  | "consolidated_reasoning"
  | "decision"
  | "artifact"
  | "matrxBroker"
  | "info"
  | "task"
  | "database"
  | "private"
  | "plan"
  | "event"
  | "tool"
  | "matrx"
  | "matrx_file"
  | "schema_proposal"
  | DetectorProtocolBlockType;

/** Crosswalk classification: scalar_generic — text/code/table/media primitives. */
export type ScalarGenericBlockType =
  | ServerScalarGenericRenderBlock["type"]
  | "text"
  | "code"
  | "table"
  | "image"
  | "video"
  | "tree"
  | "accent-divider"
  | "heavy-divider"
  | "audio"
  | "youtube"
  | "svg"
  | "media_block";

/** Crosswalk classification: shape — structured content (kinds + candidates). */
export type ShapeBlockType =
  | ServerShapeRenderBlock["type"]
  | "flashcards"
  | "quiz"
  | "presentation"
  | "cooking_recipe"
  | "timeline"
  | "progress_tracker"
  | "comparison_table"
  | "troubleshooting"
  | "resources"
  | "decision_tree"
  | "research"
  | "diagram"
  | "mermaid"
  | "math_problem"
  | "questionnaire"
  | "tasks"
  | "transcript"
  | "structured_info"
  | "item_presentation"
  | "video_prompt_options"
  | "keyword_research"
  | "keyword_classification_batch"
  | "chart"
  | "map"
  | "stats"
  | "diff"
  | typeof GENERIC_STRUCTURED_COMPONENT_KEY
  | typeof DB_KIND_COMPONENT_KEY;

/** Crosswalk classification: intentionally_opaque — deliberately untyped. */
export type OpaqueBlockType = ServerOpaqueRenderBlock["type"];

export type KnownBlockType =
  | ProtocolBlockType
  | ScalarGenericBlockType
  | ShapeBlockType
  | OpaqueBlockType;

// ── Compile-time exhaustiveness (the satisfies/never gate) ──────────────────

type AssertNever<T extends never> = T;

/** The complete GENERATED vocabulary this renderer must cover. */
type GeneratedBlockType =
  | TypedRenderBlock["type"]
  | ServerOnlyBlockType
  | ClientOnlyBlockType;

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
 * SCREAM: a block type reached the renderer with no dispatch registration.
 * This is a real defect (a new server/splitter type outran the generated
 * unions, or a registration was deleted) — the block still renders as basic
 * markdown so no content is hidden, but the miss is captured loudly
 * (console.error once per type per session + structured captureError, which
 * dedupes repeats). Mirrors the reportMediaDurabilityViolation posture:
 * recover, but never silently.
 */
export function reportUnregisteredBlockType(
  type: string,
  meta: {
    conversationId?: string;
    messageId?: string;
    requestId?: string;
  },
): void {
  const message = `[block-dispatch] UNREGISTERED render-block type "${type}" — no dispatch registration exists. Rendering as basic markdown. Classify it in block-dispatch.tsx (per the content-vocab crosswalk) and register a renderer.`;
  if (!reportedUnregisteredTypes.has(type)) {
    reportedUnregisteredTypes.add(type);
    // eslint-disable-next-line no-console
    console.error(message, meta);
  }
  captureError({
    source: "content-ir",
    message,
    requestId: meta.requestId,
    conversationId: meta.conversationId,
    raw: { blockType: type, ...meta },
  });
}

const reportedArtifactStageMisses = new Set<string>();

/**
 * Registration for shape/scalar types whose ONLY sanctioned renderer is the
 * unified artifact stage (resolveArtifactDef + hasArtifactRenderer in
 * BlockRenderer, upstream of this table). Reaching this entry means the
 * artifact renderer registry lost the type — scream, then fall back to the
 * exact pre-registry behavior (basic markdown of the raw content) so nothing
 * is hidden.
 */
const expectUnifiedArtifactStage: BlockRenderFn = (ctx) => {
  const { block } = ctx;
  const message = `[block-dispatch] block type "${block.type}" should have rendered via the unified artifact stage (features/canvas/artifact-types/artifact-renderers.tsx) but fell through to the dispatch table — its unified renderer registration is missing. Rendering as basic markdown.`;
  if (!reportedArtifactStageMisses.has(block.type)) {
    reportedArtifactStageMisses.add(block.type);
    // eslint-disable-next-line no-console
    console.error(message);
  }
  captureError({
    source: "content-ir",
    message,
    conversationId: ctx.conversationId,
    requestId: ctx.requestId,
    raw: { blockType: block.type },
  });
  return block.content ? ctx.renderBasicMarkdown(block.content) : null;
};

/** Shared registration for the generic XML control tags — plain markdown. */
const renderControlTagMarkdown: BlockRenderFn = (ctx) =>
  ctx.block.content ? ctx.renderBasicMarkdown(ctx.block.content) : null;

// ── Code-language sub-dispatch (its own table) ───────────────────────────────

/**
 * ``` fence language → renderer. Checked AFTER the diff special-case and
 * BEFORE the size-classified generic code path (see the `code` registration).
 * Keys are lowercase language identifiers.
 */
const CODE_LANGUAGE_DISPATCH: Record<string, BlockRenderFn> = {
  yaml: renderYamlCode,
  yml: renderYamlCode,
  // HTML used to be lumped in with XmlBlock, which broke the standard code
  // block (and with it the "convert to actual webpage" feature) — see the
  // `html` entry below.
  xml: renderXmlCode,
  svg: renderXmlCode,
  html: renderHtmlCode,
  jsx: renderReactCode,
  tsx: renderReactCode,
  react: renderReactCode,
  csv: renderCsvCode,
  tsv: renderCsvCode,
  toml: renderTomlCode,
  json: renderJsonCode,
  jsonc: renderJsonCode,
  json5: renderJsonCode,
  markdown: renderMarkdownPreviewCode,
  md: renderMarkdownPreviewCode,
  mdx: renderMarkdownPreviewCode,
};

function renderYamlCode({ block, index }: BlockDispatchContext) {
  return (
    <BlockComponents.YamlBlock
      key={index}
      content={block.content}
      className="my-3"
    />
  );
}

function renderXmlCode({ block, index }: BlockDispatchContext) {
  return (
    <BlockComponents.XmlBlock
      key={index}
      content={block.content}
      language={block.language?.toLowerCase()}
      className="my-3"
    />
  );
}

// HTML routes through HtmlInlinePreview: while streaming or for fragments it
// renders a plain code block; once a COMPLETE HTML document has finished
// streaming it auto-converts into a live, inline webpage preview (loader →
// success/iframe, or silent code-on-error).
function renderHtmlCode(ctx: BlockDispatchContext) {
  const { block, index, isStreamActive, messageId, conversationId } = ctx;
  return (
    <BlockComponents.HtmlInlinePreview
      key={index}
      code={block.content}
      language={block.language}
      isComplete={!isStreamActive && !isBlockLoading(block)}
      messageId={messageId}
      conversationId={conversationId}
      onCodeChange={
        isStreamActive
          ? undefined
          : (newCode: string) =>
              ctx.replaceBlockContent(block.content, newCode)
      }
    />
  );
}

// React/JSX/TSX → compile to a live component once finalized (auto-preview
// like html). Streaming/incomplete shows the code; compile/runtime errors
// fall back to the code block silently. Execution is allowlist-scoped and
// in-app — see features/dynamic-react/compileReactComponent.
function renderReactCode(ctx: BlockDispatchContext) {
  const { block, index, isStreamActive } = ctx;
  return (
    <BlockComponents.ReactCodeBlock
      key={index}
      code={block.content}
      language={block.language}
      isComplete={!isStreamActive && !isBlockLoading(block)}
      onCodeChange={
        isStreamActive
          ? undefined
          : (newCode: string) =>
              ctx.replaceBlockContent(block.content, newCode)
      }
    />
  );
}

function renderCsvCode(ctx: BlockDispatchContext) {
  const { block, index, isStreamActive } = ctx;
  return (
    <BlockComponents.CsvBlock
      key={index}
      content={block.content}
      delimiter={block.language?.toLowerCase() === "tsv" ? "\t" : ","}
      className="my-3"
      onInnerContentChange={
        isStreamActive
          ? undefined
          : (inner: string) => ctx.replaceBlockContent(block.content, inner)
      }
    />
  );
}

function renderTomlCode({ block, index }: BlockDispatchContext) {
  return (
    <BlockComponents.TomlBlock
      key={index}
      content={block.content}
      className="my-3"
    />
  );
}

function renderJsonCode(ctx: BlockDispatchContext) {
  const { block, index, isStreamActive, conversationId, messageId } = ctx;
  return (
    <BlockComponents.JsonBlock
      key={index}
      content={block.content}
      className="my-3"
      isStreamActive={isStreamActive}
      conversationId={conversationId}
      messageId={messageId}
      onCodeChange={
        isStreamActive
          ? undefined
          : (newCode: string) =>
              ctx.replaceBlockContent(block.content, newCode)
      }
    />
  );
}

function renderMarkdownPreviewCode(ctx: BlockDispatchContext) {
  const { block, index, isStreamActive } = ctx;
  return (
    <BlockComponents.MarkdownPreviewBlock
      key={index}
      content={block.content}
      className="my-3"
      isStreamActive={isStreamActive}
      onCodeChange={
        isStreamActive
          ? undefined
          : (newCode: string) =>
              ctx.replaceBlockContent(block.content, newCode)
      }
    />
  );
}

// ── PROTOCOL registrations ───────────────────────────────────────────────────
// Control tags, lifecycle/ack events, editor plumbing. Never Shapes (R2).

const PROTOCOL_BLOCK_DISPATCH = {
  thinking: renderReasoningEntry,
  reasoning: renderReasoningEntry,

  consolidated_reasoning: (ctx) => {
    const { block, index } = ctx;
    if (ctx.hideReasoning) return null;
    return (
      <BlockComponents.ConsolidatedReasoningVisualization
        key={index}
        reasoningTexts={
          (block.metadata?.reasoningTexts as string[] | undefined) ?? [
            block.content,
          ]
        }
        showReasoning={true}
      />
    );
  },

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
        onResolve={(_decisionId: string, xml: string, chosenText: string) => {
          ctx.replaceBlockContent(xml, chosenText);
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
    if (isMaterializedArtifactId(artifactMeta?.artifactId)) {
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

  matrxBroker: ({ index }) => (
    <p
      key={index}
      className="my-1 text-sm text-yellow-600 dark:text-yellow-400"
    >
      This block type is deprecated.
    </p>
  ),

  info: renderControlTagMarkdown,
  task: renderControlTagMarkdown,
  database: renderControlTagMarkdown,
  private: renderControlTagMarkdown,
  plan: renderControlTagMarkdown,
  event: renderControlTagMarkdown,

  tool: (ctx) => {
    // `tool` here is the generic XML-tagged `<tool>...</tool>` markdown
    // block, not a `tool_call` content block (those render via
    // ToolHandlers.InlineToolCard / DbToolCard). Still, respect the
    // same visibility flag so the surface is silent about tools end
    // to end.
    if (ctx.hideToolResults) return null;
    return renderControlTagMarkdown(ctx);
  },

  matrx: ({ block, index }) => (
    // A ```matrx fence — one Matrx Envelope. In-content position resolves only
    // reference/secret (chips); other kinds show a neutral card. Fail-safe:
    // invalid JSON renders raw, never throws. See features/matrx-envelope/.
    <BlockComponents.MatrxEnvelopeBlock key={index} content={block.content} />
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

  search_replace: ({ block, index, isStreamActive }) => (
    <BlockComponents.SearchReplaceBlock
      key={index}
      serverData={block.serverData}
      content={block.serverData ? undefined : block.content}
      language={(block.metadata?.language as string) || "typescript"}
      isStreamActive={isStreamActive}
      className="my-3"
    />
  ),
} satisfies Record<ProtocolBlockType, BlockRenderFn>;

function renderReasoningEntry(ctx: BlockDispatchContext) {
  const { block, index, isStreamActive, isLastReasoningBlock } = ctx;
  if (ctx.hideReasoning) return null;
  return (
    <BlockComponents.ReasoningVisualization
      key={index}
      reasoningText={block.content}
      showReasoning={true}
      isStreaming={
        isStreamActive &&
        (isLastReasoningBlock || block.isStreamingBlock === true)
      }
    />
  );
}

// ── SCALAR_GENERIC registrations ─────────────────────────────────────────────
// Text / code / tables / media primitives.

const SCALAR_GENERIC_BLOCK_DISPATCH = {
  text: renderControlTagMarkdown,

  code: (ctx) => {
    const { block, index, isStreamActive, conversationId, messageId } = ctx;

    // Special handling for diff blocks
    if (block.language === "diff" && looksLikeDiff(block.content)) {
      return (
        <BlockComponents.StreamingDiffBlock
          key={index}
          content={block.content}
          language={block.language || "typescript"}
          isStreamActive={isStreamActive}
          className="my-3"
        />
      );
    }

    // Custom renderers for specific languages — the code-language sub-table.
    const lang = block.language?.toLowerCase();
    const languageRenderer = lang ? CODE_LANGUAGE_DISPATCH[lang] : undefined;
    if (languageRenderer) {
      return languageRenderer(ctx);
    }

    // DATA CONTRACT: do NOT mutate the code string. The trim below is
    // used ONLY for size classification (is this small enough to render
    // inline?). The content passed to the renderer is `block.content`
    // verbatim — leading/trailing whitespace, blank lines, everything
    // preserved.
    const sizingProbe = block.content.trim();
    const lineCount = sizingProbe.split("\n").length;
    const isSmallBlock = lineCount <= 2 && sizingProbe.length < 120;

    if (!sizingProbe) return null;

    if (isSmallBlock) {
      return (
        <InlineCodeSnippet
          key={index}
          code={block.content}
          language={block.language}
          className="my-3"
        />
      );
    }

    // Regular code block — attach-to-context when we have a real message id
    return (
      <CodeBlockWithContextAttach
        key={index}
        code={block.content}
        language={block.language || DEFAULT_UNLABELED_FENCE_LANGUAGE}
        fontSize={16}
        className="my-3"
        onCodeChange={
          isStreamActive
            ? undefined
            : (newCode: string) =>
                ctx.replaceBlockContent(block.content, newCode)
        }
        isStreamActive={isStreamActive}
        conversationId={conversationId}
        messageId={messageId}
      />
    );
  },

  // NOTE: standalone `table` blocks are normally consumed by the unified
  // artifact stage (TableArtifact); this registration is the preserved legacy
  // path should that stage ever decline.
  table: (ctx) => {
    const { block, index, isStreamActive } = ctx;
    return (
      <BlockComponents.StreamingTableRenderer
        key={index}
        content={block.content}
        metadata={block.metadata}
        isStreamActive={isStreamActive}
        onContentChange={
          isStreamActive
            ? undefined
            : (updatedTable: string) =>
                ctx.replaceBlockContent(block.content, updatedTable)
        }
      />
    );
  },

  image: ({ block, index }) => {
    // The splitter only emits an "image" block when it parsed a URL out of
    // the markdown — but guard honestly rather than asserting: a missing
    // src would otherwise silently reach ImageBlock's required `src: string`
    // prop as `undefined`, and it fetches that src unconditionally.
    if (!block.src) return null;
    return (
      <BlockComponents.ImageBlock key={index} src={block.src} alt={block.alt} />
    );
  },

  video: ({ block, index }) => {
    // Route every markdown video through the canonical file-aware renderer.
    // A Matrx signed URL recovers its file_id before actions render, so copy
    // and share can never expose the private playback credential.
    if (!block.src) return null;
    return (
      <VideoOutputBlockRenderer key={index} data={{ url: block.src }} />
    );
  },

  // NOTE: like `table` — normally consumed by the unified artifact stage
  // (TreeArtifact); preserved legacy path below.
  tree: ({ block, index }) => (
    <BlockComponents.TreeBlock
      key={index}
      content={block.content}
      className="my-3"
    />
  ),

  "accent-divider": ({ index }) => (
    <div key={index} className="my-4 flex items-center gap-3">
      <div className="h-0.5 flex-1 bg-primary/60 rounded-full" />
    </div>
  ),

  "heavy-divider": ({ index }) => (
    <div key={index} className="my-6 flex items-center gap-2">
      <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
    </div>
  ),

  audio: ({ block, index }) => {
    // Audio that streamed in as a markdown/text link (the splitter's
    // `detectAudioMarkdown`). The URL is on `block.src`, mirroring the
    // markdown `image`/`video` cases. This is the live-stream twin of the
    // server-side `audio_output` case — both go through
    // `AudioOutputBlockRenderer` so the URL is resolved durably (file_id
    // recovery / public-URL preference) and "Copy link" never leaks a raw
    // signed S3 URL, even for an audio-only turn shown mid-stream.
    if (!block.src) return null;
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
    return (
      <BlockComponents.ImageOutputBlock key={index} block={block.serverData} />
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
    return <VideoOutputBlockRenderer key={index} data={sd} />;
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
      />
    );
  },

  // ```svg fences are consumed by the unified artifact stage (SvgArtifact).
  svg: expectUnifiedArtifactStage,

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
        | string
        | undefined;
      const start = externalUrl ? parseYouTubeUrl(externalUrl)?.start : undefined;
      const sourceLabel = (sd.source_label ?? sd.sourceLabel) as
        | string
        | undefined;
      return (
        <BlockComponents.YouTubeEmbedBlock
          key={index}
          videoId={videoId}
          start={start}
          title={sourceLabel}
        />
      );
    }

    // Document kind has no dedicated inline renderer yet — no-op to avoid
    // flashing a broken card. The data is preserved on the render block.
    // Phase 1c provides DocumentBlock.page1Url (full-res page 1 JPEG) for a
    // future <DocumentBlockInline> reading preview.
    return null;
  },
} satisfies Record<ScalarGenericBlockType, BlockRenderFn>;

// ── SHAPE registrations ──────────────────────────────────────────────────────
// Structured content. Registered kinds route through the kind registry seam
// (`applyIrKindRoute`, Stage 1) and/or the unified artifact stage (Stage 3)
// upstream; entries here are either dedicated shape renderers or the preserved
// legacy path behind the unified stage.

const SHAPE_BLOCK_DISPATCH = {
  // Consumed by the unified artifact stage (Stage 3) — each of these types has
  // a registered unified renderer (artifact-renderers.tsx). Reaching the
  // dispatch table means that registration was lost: scream + markdown.
  flashcards: expectUnifiedArtifactStage,
  quiz: expectUnifiedArtifactStage,
  presentation: expectUnifiedArtifactStage,
  cooking_recipe: expectUnifiedArtifactStage,
  timeline: expectUnifiedArtifactStage,
  progress_tracker: expectUnifiedArtifactStage,
  comparison_table: expectUnifiedArtifactStage,
  troubleshooting: expectUnifiedArtifactStage,
  resources: expectUnifiedArtifactStage,
  decision_tree: expectUnifiedArtifactStage,
  research: expectUnifiedArtifactStage,
  diagram: expectUnifiedArtifactStage,
  mermaid: expectUnifiedArtifactStage,
  math_problem: expectUnifiedArtifactStage,
  questionnaire: expectUnifiedArtifactStage,
  tasks: expectUnifiedArtifactStage,
  chart: expectUnifiedArtifactStage,
  map: expectUnifiedArtifactStage,
  stats: expectUnifiedArtifactStage,
  diff: expectUnifiedArtifactStage,

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
    return (
      <BlockComponents.CodeBlock
        key={index}
        code={block.content}
        language="json"
      />
    );
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
    return (
      <BlockComponents.CodeBlock
        key={index}
        code={block.content}
        language="json"
      />
    );
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
    return (
      <BlockComponents.CodeBlock
        key={index}
        code={block.content}
        language="json"
      />
    );
  },

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

  display_questionnaire: ({ block, index }) => {
    // Python sends: { introduction, questions }
    const sd = block.serverData ?? {};
    return (
      <BlockComponents.DisplayQuestionnaireBlock
        key={index}
        introduction={(sd.introduction as string) ?? ""}
        questions={(sd.questions as Record<string, unknown>[]) ?? []}
      />
    );
  },

  // The R6 generic fallback (features/content-ir/react/kind-route.ts): the
  // envelope resolved a kind the platform KNOWS, but nothing render-trusted
  // claims it. Rather than dropping to a raw code block, show every field
  // readably plus an honest "unverified shape" affordance. Reached ONLY via
  // applyIrKindRoute — nothing emits this block type upstream.
  [GENERIC_STRUCTURED_COMPONENT_KEY]: ({ block, index }) => (
    <GenericStructuredBlock
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
  [DB_KIND_COMPONENT_KEY]: ({ block, index }) => (
    <DbKindComponent
      key={index}
      content={block.content}
      metadata={block.metadata}
    />
  ),
} satisfies Record<ShapeBlockType, BlockRenderFn>;

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
} satisfies Record<OpaqueBlockType, BlockRenderFn>;

// ── The merged registry ──────────────────────────────────────────────────────

export const BLOCK_DISPATCH = {
  ...PROTOCOL_BLOCK_DISPATCH,
  ...SCALAR_GENERIC_BLOCK_DISPATCH,
  ...SHAPE_BLOCK_DISPATCH,
  ...OPAQUE_BLOCK_DISPATCH,
} satisfies Record<KnownBlockType, BlockRenderFn>;

/** Per-classification membership — exported for the dispatch tests. */
export const BLOCK_DISPATCH_CLASSIFICATION = {
  protocol: Object.keys(PROTOCOL_BLOCK_DISPATCH),
  scalar_generic: Object.keys(SCALAR_GENERIC_BLOCK_DISPATCH),
  shape: Object.keys(SHAPE_BLOCK_DISPATCH),
  intentionally_opaque: Object.keys(OPAQUE_BLOCK_DISPATCH),
} as const;

const DISPATCH_MAP = new Map<string, BlockRenderFn>(
  Object.entries(BLOCK_DISPATCH),
);

/**
 * Resolve a block type's registration, or null when unregistered (the caller
 * MUST then call `reportUnregisteredBlockType` — never a silent default).
 */
export function resolveBlockDispatch(type: string): BlockRenderFn | null {
  return DISPATCH_MAP.get(type) ?? null;
}
