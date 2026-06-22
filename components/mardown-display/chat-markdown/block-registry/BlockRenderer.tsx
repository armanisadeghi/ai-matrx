"use client";
import React, { useCallback } from "react";
import { BlockComponents, LoadingComponents } from "./BlockComponentRegistry";
import { resolveArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import {
  ArtifactRender,
  hasArtifactRenderer,
} from "@/features/canvas/artifact-types/artifact-renderers";
import { looksLikeDiff } from "../diff-blocks/diff-style-registry";
import { useBlockRenderingConfig } from "@/components/mardown-display/chat-markdown/BlockRenderingContext";
import { InlineCodeSnippet } from "../InlineCodeSnippet";
import type { TypedRenderBlock } from "@/types/python-generated/stream-events";
import type { MissingBlockType } from "@/types/python-generated/missing-types";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectHideReasoning,
  selectHideToolResults,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { isUnifiedImageBlock } from "@/features/files/blocks/image/guards";
import { parseYouTubeUrl } from "@/lib/media/youtube";
import AudioOutputBlockRenderer from "@/components/mardown-display/blocks/audio/AudioOutputBlockRenderer";
import VideoOutputBlockRenderer from "@/components/mardown-display/blocks/videos/VideoOutputBlockRenderer";

/**
 * Shown in strict-mode when block.serverData is null — means Python did not
 * populate the `data` field. This is always a Python pipeline bug.
 */
const StrictModeError: React.FC<{ blockType: string; blockId?: string }> = ({
  blockType,
  blockId,
}) => (
  <div className="my-2 p-3 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs font-mono">
    <div className="font-bold mb-1">⚠ STRICT MODE — Python pipeline bug</div>
    <div>
      Block type: <span className="font-semibold">{blockType}</span>
      {blockId ? ` (${blockId})` : ""}
    </div>
    <div className="mt-1 text-red-600 dark:text-red-300">
      <code>block.serverData</code> is null — Python did not populate the{" "}
      <code>data</code> field. Client-side fallback parsing is disabled in
      strict mode.
    </div>
  </div>
);

/**
 * Flat render block interface used by BlockRenderer.
 *
 * This is intentionally NOT a discriminated union. Using a discriminated union
 * (like TypedRenderBlock) causes TypeScript to narrow `block` to `never` for any
 * `case` whose type string isn't in the union — making the switch unusable.
 *
 * All fields are the union of what any block case can access. Specific typed data
 * for server-processed blocks arrives via `serverData` (the Python `data` field).
 *
 * The `type` string covers ALL blocks: Python-typed (TypedRenderBlock["type"]),
 * missing/pending types (MissingBlockType), and the open `string` fallback for
 * anything Python adds before TypeScript types catch up.
 */
export interface RenderBlock {
  type: TypedRenderBlock["type"] | MissingBlockType | string;
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
 * Best-effort MIME type for an audio URL parsed from a markdown link, derived
 * from its file extension (query string ignored). Lets the audio player emit a
 * correct `<source type>`; returns undefined for unknown extensions, which the
 * player handles gracefully.
 */
function audioMimeFromUrl(url: string): string | undefined {
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
function isBlockLoading(block: {
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
 * Renders individual content blocks with lazy-loaded components
 * Extracted from MarkdownStream for better code splitting
 */
export const BlockRenderer: React.FC<BlockRendererProps> = ({
  requestId,
  block,
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
  const { strictServerData } = useBlockRenderingConfig();

  // Per-conversation display flags. When a surface has `hideReasoning` or
  // `hideToolResults` set on its `instanceUIState`, the matching block
  // types self-gate here so there's exactly one source of truth — no
  // scattered conditional-render sites, no missed branches, no need for
  // parents to remember to filter.
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

  // ── Unified artifact renderer (Wave B) ───────────────────────────────────
  // Standalone materializable blocks whose type has a unified renderer are
  // rendered through the single shared path (chat/canvas/artifact identical).
  // `artifact` blocks go through the dedicated `case "artifact"` below (UUID id
  // → render-by-id; else inline ArtifactBlock chrome). Standalone materializable
  // types (```tasks, ```mermaid, JSON blocks, …) route through the unified
  // renderer here.
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

  switch (block.type) {
    case "audio_output": {
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
    }

    case "thinking":
    case "reasoning":
      if (hideReasoning) return null;
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

    case "consolidated_reasoning":
      if (hideReasoning) return null;
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

    case "image_output": {
      // block.serverData IS the UnifiedImageBlock — every inbound path
      // (process-stream.ts, normalize-content-blocks.ts) converts to the
      // canonical shape before storing. See features/files/blocks/image/types.ts.
      // Use the guard to prove the shape rather than force-casting from
      // `Record<string, unknown>` — anything that doesn't pass the guard is
      // a stale entry from before the migration and gets silently skipped.
      if (!isUnifiedImageBlock(block.serverData)) return null;
      return (
        <BlockComponents.ImageOutputBlock
          key={index}
          block={block.serverData}
        />
      );
    }

    case "video_output": {
      // Resolve through the file handler (`VideoOutputBlockRenderer`) instead
      // of echoing the raw `data.url` — identical durability fix to
      // `audio_output`: the handler prefers the durable public/CDN URL and
      // re-mints expiring URLs from `file_id`, so video plays during streaming
      // (when Python sends only a `file_id`, no minted URL) AND "Copy link"
      // never leaks a raw signed S3 URL. The renderer also resolves the
      // Phase-1c `posterUrl` the same way. See the renderer for the rationale.
      const sd = (block.serverData ?? {}) as Record<string, unknown>;
      return <VideoOutputBlockRenderer key={index} data={sd} />;
    }

    case "media_block": {
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
        const start = externalUrl
          ? parseYouTubeUrl(externalUrl)?.start
          : undefined;
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
    }

    case "search_results": {
      // Python sends: { results?: SearchResultItem[]; metadata?: Record<string, unknown> }
      const sd = block.serverData ?? {};
      return (
        <BlockComponents.SearchResultsBlock
          key={index}
          results={(sd.results as Record<string, unknown>[]) ?? []}
          metadata={(sd.metadata as Record<string, unknown>) ?? {}}
        />
      );
    }

    case "search_error": {
      // Python sends: { error: string; metadata?: Record<string, unknown> }
      const sd = block.serverData ?? {};
      return (
        <BlockComponents.SearchErrorBlock
          key={index}
          error={(sd.error as string) ?? "Unknown search error"}
          metadata={(sd.metadata as Record<string, unknown>) ?? undefined}
        />
      );
    }

    case "function_result": {
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
    }

    case "workflow_step": {
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
    }

    case "categorization_result": {
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
    }

    case "fetch_results": {
      // Python sends: { results?: FetchResultItem[]; metadata?: Record<string, unknown> }
      const sd = block.serverData ?? {};
      return (
        <BlockComponents.FetchResultsBlock
          key={index}
          results={(sd.results as Record<string, unknown>[]) ?? []}
          metadata={(sd.metadata as Record<string, unknown>) ?? {}}
        />
      );
    }

    case "podcast_complete": {
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
    }

    case "podcast_stage": {
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
    }

    case "scrape_batch_complete": {
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
    }

    case "structured_input_warning": {
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
    }

    case "display_questionnaire": {
      // Python sends: { introduction, questions }
      const sd = block.serverData ?? {};
      return (
        <BlockComponents.DisplayQuestionnaireBlock
          key={index}
          introduction={(sd.introduction as string) ?? ""}
          questions={(sd.questions as Record<string, unknown>[]) ?? []}
        />
      );
    }

    case "unknown_data_event": {
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
    }

    case "image":
      return (
        <BlockComponents.ImageBlock
          key={index}
          src={block.src!}
          alt={block.alt}
        />
      );

    case "video":
      return (
        <BlockComponents.VideoBlock
          key={index}
          src={block.src!}
          alt={block.alt}
        />
      );

    case "matrx_file":
      // A link/bare URL to one of OUR files. The component re-derives the URL +
      // surrounding text from `content`, discovers the real file type, and
      // renders the universal inline previewer (or degrades to the link).
      return (
        <BlockComponents.MatrxFileBlock
          key={index}
          content={block.content}
          src={block.src}
          alt={block.alt}
          metadata={block.metadata}
        />
      );

    case "youtube": {
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
    }

    case "audio": {
      // Audio that streamed in as a markdown/text link (the splitter's
      // `detectAudioMarkdown`). The URL is on `block.src`, mirroring the
      // markdown `image`/`video` cases. This is the live-stream twin of the
      // server-side `audio_output` case above — both go through
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
    }

    case "code": {
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

      // Custom renderers for specific languages
      const lang = block.language?.toLowerCase();
      if (lang === "yaml" || lang === "yml") {
        return (
          <BlockComponents.YamlBlock
            key={index}
            content={block.content}
            className="my-3"
          />
        );
      }
      // if (lang === "xml" || lang === "html" || lang === "svg") {
      if (lang === "xml" || lang === "svg") {
        return (
          <BlockComponents.XmlBlock
            key={index}
            content={block.content}
            language={lang}
            className="my-3"
          />
        );
      }
      // HTML used to be lumped in with XmlBlock above, which broke the
      // standard code block (and with it the "convert to actual webpage"
      // feature). It now routes through HtmlInlinePreview: while streaming or
      // for fragments it renders a plain code block; once a COMPLETE HTML
      // document has finished streaming it auto-converts into a live, inline
      // webpage preview (loader → success/iframe, or silent code-on-error).
      if (lang === "html") {
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
                    replaceBlockContent(block.content, newCode)
            }
          />
        );
      }
      // React/JSX/TSX → compile to a live component once finalized (auto-preview
      // like html). Streaming/incomplete shows the code; compile/runtime errors
      // fall back to the code block silently. Execution is allowlist-scoped and
      // in-app — see features/dynamic-react/compileReactComponent.
      if (lang === "jsx" || lang === "tsx" || lang === "react") {
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
                    replaceBlockContent(block.content, newCode)
            }
          />
        );
      }
      if (lang === "csv" || lang === "tsv") {
        return (
          <BlockComponents.CsvBlock
            key={index}
            content={block.content}
            delimiter={lang === "tsv" ? "\t" : ","}
            className="my-3"
            onInnerContentChange={
              isStreamActive
                ? undefined
                : (inner) => replaceBlockContent(block.content, inner)
            }
          />
        );
      }
      if (lang === "toml") {
        return (
          <BlockComponents.TomlBlock
            key={index}
            content={block.content}
            className="my-3"
          />
        );
      }
      if (lang === "json" || lang === "jsonc" || lang === "json5") {
        return (
          <BlockComponents.JsonBlock
            key={index}
            content={block.content}
            className="my-3"
            isStreamActive={isStreamActive}
            onCodeChange={
              isStreamActive
                ? undefined
                : (newCode: string) =>
                    replaceBlockContent(block.content, newCode)
            }
          />
        );
      }
      if (lang === "markdown" || lang === "md" || lang === "mdx") {
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
                    replaceBlockContent(block.content, newCode)
            }
          />
        );
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

      // Regular code block
      return (
        <BlockComponents.CodeBlock
          key={index}
          code={block.content}
          language={block.language}
          fontSize={16}
          className="my-3"
          onCodeChange={
            isStreamActive
              ? undefined
              : (newCode) => replaceBlockContent(block.content, newCode)
          }
          isStreamActive={isStreamActive}
        />
      );
    }

    case "table":
      return (
        <BlockComponents.StreamingTableRenderer
          key={index}
          content={block.content}
          metadata={block.metadata}
          isStreamActive={isStreamActive}
          onContentChange={
            isStreamActive
              ? undefined
              : (updatedTable) =>
                  replaceBlockContent(block.content, updatedTable)
          }
        />
      );

    case "transcript":
      return (
        <BlockComponents.TranscriptBlock key={index} content={block.content} />
      );

    // "tasks" → handled by the early unified-renderer branch above
    // (resolveArtifactDef("tasks") → tasks def → TasksArtifact).

    case "structured_info":
      return (
        <BlockComponents.StructuredPlanBlock
          key={index}
          content={block.content}
        />
      );

    case "matrxBroker":
      return (
        <BlockComponents.MatrxBrokerBlock
          key={index}
          content={block.content}
          metadata={block.metadata}
          onUpdate={(updatedContent, originalContent) =>
            replaceBlockContent(originalContent, updatedContent)
          }
        />
      );

    // `questionnaire` is a materializable artifact type — handled by the unified
    // renderer early-branch above (resolveArtifactDef + hasArtifactRenderer →
    // QuestionnaireArtifact, which persists answers to canvas_item_state). Its
    // legacy case was removed when enrolled.

    // flashcards, quiz, presentation, cooking_recipe, timeline, research,
    // resources, progress_tracker, comparison_table, troubleshooting,
    // decision_tree, diagram, mermaid, math_problem → unified renderer
    // (all handled by the early-branch above via resolveArtifactDef +
    // hasArtifactRenderer; cases removed in Wave F)

    // `svg` + `chart` are materializable artifact types — handled by the unified
    // renderer early-branch above (resolveArtifactDef + hasArtifactRenderer →
    // SvgArtifact / ChartArtifact). Their legacy cases were removed when enrolled.

    case "item_presentation":
      // Owns all its phases internally: instant skeleton from a partial JSON
      // scan → recognized icon/accent + DB auto-enrichment → grow-in details →
      // window-panel open on click. Forgiving for unknown types; never errors.
      return (
        <BlockComponents.ItemPresentationBlock
          key={index}
          content={block.content}
          isStreamActive={Boolean(block.isStreamingBlock) || isStreamActive}
        />
      );

    case "matrx":
      // A ```matrx fence — one Matrx Envelope. In-content position resolves only
      // reference/secret (chips); other kinds show a neutral card. Fail-safe:
      // invalid JSON renders raw, never throws. See features/matrx-envelope/.
      return (
        <BlockComponents.MatrxEnvelopeBlock
          key={index}
          content={block.content}
        />
      );

    case "schema_proposal":
      // A ```json output-schema proposal ({ name, schema, strict? }). Offers
      // "Apply to an agent" → writes agx_agent.output_schema. Fail-safe parse.
      return (
        <BlockComponents.SchemaProposalBlock
          key={index}
          content={block.content}
        />
      );

    case "search_replace":
      return (
        <BlockComponents.SearchReplaceBlock
          key={index}
          serverData={block.serverData as any}
          content={block.serverData ? undefined : block.content}
          language={(block.metadata?.language as string) || "typescript"}
          isStreamActive={isStreamActive}
          className="my-3"
        />
      );

    case "decision": {
      const decisionData = block.serverData
        ? (block.serverData as any)
        : block.metadata?.decision;

      if (!decisionData || !decisionData.options?.length) {
        return renderBasicMarkdown(block.content);
      }

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

      const rawXml = block.metadata?.rawXml ?? block.content;

      return (
        <BlockComponents.InlineDecisionBlock
          key={index}
          decision={decisionData}
          isStreamActive={isStreamActive}
          rawXml={rawXml}
          onResolve={(_decisionId: string, xml: string, chosenText: string) => {
            replaceBlockContent(xml, chosenText);
          }}
        />
      );
    }

    case "artifact": {
      // R3 recognition: a `<artifact>` whose id is a real canvas UUID is
      // MATERIALIZED → render the live row BY ID (ignore the inline body, which
      // is the model-facing archive). A non-UUID / absent id (the model's
      // `artifact_1`, or mid-stream) renders inline and stays a materialization
      // candidate. This is the single load-bearing branch that lets the canonical
      // `<artifact id>body</artifact>` text be both model-readable and rendered live.
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
            messageId={messageId}
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
          taskId={taskId}
        />
      );
    }

    case "editor_error":
      return (
        <BlockComponents.EditorErrorBlock
          key={index}
          content={block.content}
          metadata={block.metadata}
        />
      );

    case "editor_code_snippet":
      return (
        <BlockComponents.EditorCodeSnippetBlock
          key={index}
          content={block.content}
          metadata={block.metadata}
        />
      );

    case "audiocite":
      return (
        <BlockComponents.AudioCitationBlock
          key={index}
          content={block.content}
          metadata={block.metadata as Record<string, string> | undefined}
        />
      );

    case "tree":
      return (
        <BlockComponents.TreeBlock
          key={index}
          content={block.content}
          className="my-3"
        />
      );

    case "accent-divider":
      return (
        <div key={index} className="my-4 flex items-center gap-3">
          <div className="h-0.5 flex-1 bg-primary/60 rounded-full" />
        </div>
      );

    case "heavy-divider":
      return (
        <div key={index} className="my-6 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
        </div>
      );

    case "text":
    case "info":
    case "task":
    case "database":
    case "private":
    case "plan":
    case "event":
    case "tool":
      // `tool` here is the generic XML-tagged `<tool>...</tool>` markdown
      // block, not a `tool_call` content block (those render via
      // ToolHandlers.InlineToolCard / DbToolCard). Still, respect the
      // same visibility flag so the surface is silent about tools end
      // to end.
      if (block.type === "tool" && hideToolResults) return null;
      return block.content ? renderBasicMarkdown(block.content) : null;

    default:
      return block.content ? renderBasicMarkdown(block.content) : null;
  }
};
