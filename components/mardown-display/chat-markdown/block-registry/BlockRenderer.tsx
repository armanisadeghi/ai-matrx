"use client";
import React, { useCallback } from "react";
import { BlockComponents, LoadingComponents } from "./BlockComponentRegistry";
import { looksLikeDiff } from "../diff-blocks/diff-style-registry";
import { safeJsonParse } from "./json-parse-utils";
import { useBlockRenderingConfig } from "@/components/mardown-display/chat-markdown/BlockRenderingContext";
import { InlineCodeSnippet } from "../InlineCodeSnippet";
import type { TypedRenderBlock } from "@/types/python-generated/stream-events";
import type { MissingBlockType } from "@/types/python-generated/missing-types";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectHideReasoning,
  selectHideToolResults,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";

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
        />
      );
    },
    [index, isStreamActive, onContentChange, handleOpenEditor, messageId],
  );

  switch (block.type) {
    case "audio_output": {
      // Python sends: { url: string; mime_type: string }
      // Component wants: { url: string; mimeType?: string }
      // TODO(python): rename mime_type → mimeType in the Python AudioOutputData schema.
      const sd = block.serverData ?? {};
      const url = sd.url as string | undefined;
      if (!url) return null;
      return (
        <BlockComponents.AudioOutputBlock
          key={index}
          url={url}
          mimeType={sd.mime_type as string | undefined}
        />
      );
    }

    case "thinking":
    case "reasoning":
      if (hideReasoning) return null;
      return (
        <BlockComponents.ReasoningVisualization
          key={index}
          reasoningText={block.content}
          showReasoning={true}
          isStreaming={isStreamActive && isLastReasoningBlock}
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
      // Python sends: { url: string; mime_type: string }
      // Component wants: { url: string; mimeType?: string }
      // TODO(python): rename mime_type → mimeType in the Python ImageOutputData schema.
      const sd = block.serverData ?? {};
      const url = sd.url as string | undefined;
      if (!url) return null;
      return (
        <BlockComponents.ImageOutputBlock
          key={index}
          url={url}
          mimeType={sd.mime_type as string | undefined}
        />
      );
    }

    case "video_output": {
      // Python sends: { url: string; mime_type: string }
      // Component wants: { url: string; mimeType?: string }
      // TODO(python): rename mime_type → mimeType in the Python VideoOutputData schema.
      const sd = block.serverData ?? {};
      const url = sd.url as string | undefined;
      if (!url) return null;
      return (
        <BlockComponents.VideoOutputBlock
          key={index}
          url={url}
          mimeType={sd.mime_type as string | undefined}
        />
      );
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
      if (lang === "xml" || lang === "html" || lang === "svg") {
        return (
          <BlockComponents.XmlBlock
            key={index}
            content={block.content}
            language={lang}
            className="my-3"
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

    case "tasks":
      return (
        <BlockComponents.TasksBlock
          key={index}
          content={block.content}
          messageId={messageId}
          conversationId={conversationId}
          blockIndex={index}
        />
      );

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

    case "questionnaire":
      // If server already parsed the data, render directly (no dynamic import)
      if (block.serverData) {
        return (
          <BlockComponents.QuestionnaireRenderer
            key={index}
            data={block.serverData as any}
            questionnaireId={`questionnaire-${messageId}-${index}`}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="questionnaire"
            blockId={(block as any).blockId}
          />
        );
      }
      // Fallback: Dynamic import the parser (legacy / client-side parsing)
      const QuestionnaireWithParser = React.lazy(async () => {
        const { separatedMarkdownParser } =
          await import("../../markdown-classification/processors/custom/parser-separated");
        const parsedContent = separatedMarkdownParser(block.content);

        return {
          default: () => (
            <BlockComponents.QuestionnaireRenderer
              data={parsedContent}
              questionnaireId={`questionnaire-${messageId}-${index}`}
            />
          ),
        };
      });

      return (
        <React.Suspense key={index} fallback={null}>
          <QuestionnaireWithParser />
        </React.Suspense>
      );

    case "flashcards":
      if (block.serverData) {
        return (
          <BlockComponents.FlashcardsBlock
            key={index}
            serverData={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="flashcards"
            blockId={(block as any).blockId}
          />
        );
      }
      return (
        <BlockComponents.FlashcardsBlock
          key={index}
          content={block.content}
          taskId={taskId}
        />
      );

    case "quiz":
      // Server-processed path
      if (block.serverData) {
        return (
          <BlockComponents.MultipleChoiceQuiz
            key={index}
            quizData={block.serverData as any}
            taskId={taskId}
            conversationId={conversationId}
            messageId={messageId}
            blockIndex={index}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="quiz"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.QuizLoading key={index} />;
      }

      const quizData = safeJsonParse(block.content) as any | null;
      if (quizData) {
        // Normalise legacy snake_case LLM output to the canonical camelCase shape.
        // The server-processed path already sends camelCase; raw markdown from the
        // LLM uses quiz_title / multiple_choice. Either must produce the same shape
        // for MultipleChoiceQuiz.
        const normalised = quizData.quizTitle
          ? quizData
          : quizData.quiz_title
            ? {
                quizTitle: quizData.quiz_title,
                category: quizData.category,
                multipleChoice: quizData.multiple_choice,
              }
            : null;
        if (
          normalised &&
          normalised.quizTitle &&
          Array.isArray(normalised.multipleChoice) &&
          normalised.multipleChoice.length > 0
        ) {
          return (
            <BlockComponents.MultipleChoiceQuiz
              key={index}
              quizData={normalised}
              taskId={taskId}
              conversationId={conversationId}
              messageId={messageId}
              blockIndex={index}
            />
          );
        }
      }
      return renderFallbackContent(block.content);

    case "presentation":
      if (block.serverData) {
        const sd = block.serverData as any;
        return (
          <BlockComponents.Slideshow
            key={index}
            slides={sd.slides}
            taskId={taskId}
            theme={
              sd.theme || {
                primaryColor: "#2563eb",
                secondaryColor: "#1e40af",
                accentColor: "#60a5fa",
                backgroundColor: "#ffffff",
                textColor: "#1f2937",
              }
            }
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="presentation"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.PresentationLoading key={index} />;
      }
      const presentationData = safeJsonParse(block.content) as any | null;
      if (
        presentationData &&
        presentationData.presentation?.slides &&
        Array.isArray(presentationData.presentation.slides)
      ) {
        return (
          <BlockComponents.Slideshow
            key={index}
            slides={presentationData.presentation.slides}
            taskId={taskId}
            theme={
              presentationData.presentation.theme || {
                primaryColor: "#2563eb",
                secondaryColor: "#1e40af",
                accentColor: "#60a5fa",
                backgroundColor: "#ffffff",
                textColor: "#1f2937",
              }
            }
          />
        );
      }
      return renderFallbackContent(block.content);

    case "cooking_recipe":
      if (block.serverData) {
        return (
          <BlockComponents.RecipeViewer
            key={index}
            recipe={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="cooking_recipe"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.RecipeLoading key={index} />;
      }
      const RecipeWithParser = React.lazy(async () => {
        const { parseRecipeMarkdown } =
          await import("../../blocks/cooking-recipes/parseRecipeMarkdown");
        const recipeData = parseRecipeMarkdown(block.content);
        if (!recipeData) throw new Error("Failed to parse recipe");
        return {
          default: () => (
            <BlockComponents.RecipeViewer recipe={recipeData} taskId={taskId} />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.RecipeLoading />}
        >
          <RecipeWithParser />
        </React.Suspense>
      );

    case "timeline":
      if (block.serverData) {
        return (
          <BlockComponents.TimelineBlock
            key={index}
            timeline={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="timeline"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.TimelineLoading key={index} />;
      }
      const TimelineWithParser = React.lazy(async () => {
        const { parseTimelineMarkdown } =
          await import("../../blocks/timeline/parseTimelineMarkdown");
        const timelineData = parseTimelineMarkdown(block.content);
        if (!timelineData) throw new Error("Failed to parse timeline");
        return {
          default: () => (
            <BlockComponents.TimelineBlock
              timeline={timelineData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.TimelineLoading />}
        >
          <TimelineWithParser />
        </React.Suspense>
      );

    case "research":
      if (block.serverData) {
        return (
          <BlockComponents.ResearchBlock
            key={index}
            research={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="research"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.ResearchLoading key={index} />;
      }
      const ResearchWithParser = React.lazy(async () => {
        const { parseResearchMarkdown } =
          await import("../../blocks/research/parseResearchMarkdown");
        const researchData = parseResearchMarkdown(block.content);
        if (!researchData) throw new Error("Failed to parse research");
        return {
          default: () => (
            <BlockComponents.ResearchBlock
              research={researchData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.ResearchLoading />}
        >
          <ResearchWithParser />
        </React.Suspense>
      );

    case "resources":
      if (block.serverData) {
        return (
          <BlockComponents.ResourceCollectionBlock
            key={index}
            collection={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="resources"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.ResourcesLoading key={index} />;
      }
      const ResourcesWithParser = React.lazy(async () => {
        const { parseResourcesMarkdown } =
          await import("../../blocks/resources/parseResourcesMarkdown");
        const resourcesData = parseResourcesMarkdown(block.content);
        if (!resourcesData) throw new Error("Failed to parse resources");
        return {
          default: () => (
            <BlockComponents.ResourceCollectionBlock
              collection={resourcesData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.ResourcesLoading />}
        >
          <ResourcesWithParser />
        </React.Suspense>
      );

    case "progress_tracker":
      if (block.serverData) {
        return (
          <BlockComponents.ProgressTrackerBlock
            key={index}
            tracker={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="progress_tracker"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.ProgressLoading key={index} />;
      }
      const ProgressWithParser = React.lazy(async () => {
        const { parseProgressMarkdown } =
          await import("../../blocks/progress/parseProgressMarkdown");
        const progressData = parseProgressMarkdown(block.content);
        if (!progressData) throw new Error("Failed to parse progress");
        return {
          default: () => (
            <BlockComponents.ProgressTrackerBlock
              tracker={progressData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.ProgressLoading />}
        >
          <ProgressWithParser />
        </React.Suspense>
      );

    case "comparison_table":
      if (block.serverData) {
        return (
          <BlockComponents.ComparisonTableBlock
            key={index}
            comparison={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="comparison_table"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.ComparisonLoading key={index} />;
      }
      const ComparisonWithParser = React.lazy(async () => {
        const { parseComparisonJSON } =
          await import("../../blocks/comparison/parseComparisonJSON");
        const comparisonData = parseComparisonJSON(block.content);
        if (!comparisonData) throw new Error("Failed to parse comparison");
        return {
          default: () => (
            <BlockComponents.ComparisonTableBlock
              comparison={comparisonData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.ComparisonLoading />}
        >
          <ComparisonWithParser />
        </React.Suspense>
      );

    case "troubleshooting":
      if (block.serverData) {
        return (
          <BlockComponents.TroubleshootingBlock
            key={index}
            troubleshooting={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="troubleshooting"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.TroubleshootingLoading key={index} />;
      }
      const TroubleshootingWithParser = React.lazy(async () => {
        const { parseTroubleshootingMarkdown } =
          await import("../../blocks/troubleshooting/parseTroubleshootingMarkdown");
        const troubleshootingData = parseTroubleshootingMarkdown(block.content);
        if (!troubleshootingData)
          throw new Error("Failed to parse troubleshooting");
        return {
          default: () => (
            <BlockComponents.TroubleshootingBlock
              troubleshooting={troubleshootingData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.TroubleshootingLoading />}
        >
          <TroubleshootingWithParser />
        </React.Suspense>
      );

    case "decision_tree":
      if (block.serverData) {
        return (
          <BlockComponents.DecisionTreeBlock
            key={index}
            decisionTree={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="decision_tree"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.DecisionTreeLoading key={index} />;
      }
      const DecisionTreeWithParser = React.lazy(async () => {
        const { parseDecisionTreeJSON } =
          await import("../../blocks/decision-tree/parseDecisionTreeJSON");
        const decisionTreeData = parseDecisionTreeJSON(block.content);
        if (!decisionTreeData) throw new Error("Failed to parse decision tree");
        return {
          default: () => (
            <BlockComponents.DecisionTreeBlock
              decisionTree={decisionTreeData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.DecisionTreeLoading />}
        >
          <DecisionTreeWithParser />
        </React.Suspense>
      );

    case "diagram":
      if (block.serverData) {
        return (
          <BlockComponents.InteractiveDiagramBlock
            key={index}
            diagram={block.serverData as any}
            taskId={taskId}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="diagram"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.DiagramLoading key={index} />;
      }
      const DiagramWithParser = React.lazy(async () => {
        const { parseDiagramJSON } =
          await import("../../blocks/diagram/parseDiagramJSON");
        const diagramData = parseDiagramJSON(block.content);
        if (!diagramData) throw new Error("Failed to parse diagram");
        return {
          default: () => (
            <BlockComponents.InteractiveDiagramBlock
              diagram={diagramData}
              taskId={taskId}
            />
          ),
        };
      });
      return (
        <React.Suspense
          key={index}
          fallback={<LoadingComponents.DiagramLoading />}
        >
          <DiagramWithParser />
        </React.Suspense>
      );

    case "math_problem":
      if (block.serverData) {
        return (
          <BlockComponents.MathProblemBlock
            key={index}
            problemData={block.serverData as any}
          />
        );
      }
      if (strictServerData) {
        return (
          <StrictModeError
            key={index}
            blockType="math_problem"
            blockId={(block as any).blockId}
          />
        );
      }
      if (isBlockLoading(block)) {
        return <LoadingComponents.MathProblemLoading key={index} />;
      }
      const mathProblemData = safeJsonParse(block.content) as Record<
        string,
        unknown
      > | null;
      if (mathProblemData && mathProblemData.math_problem) {
        return (
          <BlockComponents.MathProblemBlock
            key={index}
            problemData={mathProblemData}
          />
        );
      }
      return renderFallbackContent(block.content);

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

    case "artifact":
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
