"use client";

import React, { Suspense, lazy } from "react";
// FRAGMENTATION LAW (tiered): the light block components are ONE piece of the
// markdown engine, compiled & fetched once behind the MarkdownStream edge —
// static imports, not 80 chunk groups. The genuinely heavy engines keep their
// lazy boundaries so a chat message never downloads an editor/diagram engine
// it isn't using: CodeBlock/ReactCodeBlock/HtmlInlinePreview/StreamingDiff/
// SearchReplace (syntax-highlighter), MatrxFileBlock (Univer/previewers),
// InteractiveDiagramBlock (reactflow), MermaidBlock (mermaid).
import ThinkingVisualization from "../../blocks/thinking-reasoning/ThinkingVisualization";
import ReasoningVisualization from "../../blocks/thinking-reasoning/ReasoningVisualization";
import ConsolidatedReasoningVisualization from "../../blocks/thinking-reasoning/ConsolidatedReasoningVisualization";
import ImageBlock from "../../blocks/images/ImageBlock";
import TranscriptBlock from "../../blocks/transcripts/TranscriptBlock";
import TasksBlock from "../../blocks/tasks/TasksBlock";
import StructuredPlanBlock from "../../blocks/plan/StructuredPlanBlock";
import FlashcardsBlock from "../../blocks/flashcards/FlashcardsBlock";
import VideoPromptOptionsBlock from "../../blocks/video-prompt-options/VideoPromptOptionsBlock";
import KeywordResearchBlock from "../../blocks/keyword-research/KeywordResearchBlock";
import KeywordClassificationBatchBlock from "../../blocks/keyword-research/KeywordClassificationBatchBlock";
import PageBriefBlock from "../../blocks/page-brief/PageBriefBlock";
import MultipleChoiceQuiz from "../../blocks/quiz/MultipleChoiceQuiz";
import Slideshow from "../../blocks/presentations/Slideshow";
import RecipeViewer from "../../blocks/cooking-recipes/cookingRecipeDisplay";
import TimelineBlock from "../../blocks/timeline/TimelineBlock";
import ResearchBlock from "../../blocks/research/ResearchBlock";
import ResourceCollectionBlock from "../../blocks/resources/ResourceCollectionBlock";
import ProgressTrackerBlock from "../../blocks/progress/ProgressTrackerBlock";
import ComparisonTableBlock from "../../blocks/comparison/ComparisonTableBlock";
import TroubleshootingBlock from "../../blocks/troubleshooting/TroubleshootingBlock";
import DecisionTreeBlock from "../../blocks/decision-tree/DecisionTreeBlock";
import SvgBlock from "../../blocks/svg/SvgBlock";
import ChartBlock from "../../blocks/chart/ChartBlock";
import ItemPresentationBlock from "@/features/item-presentation/ItemPresentationBlock";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import SchemaProposalBlock from "@/features/agents/components/schema-proposal/SchemaProposalBlock";
import MathProblemBlock from "../../blocks/math/MathProblemBlock";
import QuestionnaireRenderer from "../../blocks/questionnaire/QuestionnaireRenderer";
import MarkdownTable from "../../tables/MarkdownTable";
import { StreamingTableRenderer as StreamingTableRenderer } from "../../blocks/table/StreamingTableRenderer";
import InlineDecisionBlock from "../../blocks/inline-decision/InlineDecisionBlock";
import ArtifactBlock from "../../blocks/artifact/ArtifactBlock";
import ArtifactRefBlock from "../../blocks/artifact/ArtifactRefBlock";
import EditorErrorBlock from "../../blocks/editor-resources/EditorErrorBlock";
import EditorCodeSnippetBlock from "../../blocks/editor-resources/EditorCodeSnippetBlock";
import AudioCitationBlock from "../../blocks/audio/AudioCitationBlock";
import YamlBlock from "../../blocks/yaml/YamlBlock";
import XmlBlock from "../../blocks/xml/XmlBlock";
import CsvBlock from "../../blocks/csv/CsvBlock";
import { JsonBlock as JsonBlock } from "../../blocks/json/JsonBlock";
import TomlBlock from "../../blocks/toml/TomlBlock";
import TreeBlock from "../../blocks/tree/TreeBlock";
import MarkdownPreviewBlock from "../../blocks/markdown-preview/MarkdownPreviewBlock";
import AudioOutputBlock from "../../blocks/audio/AudioOutputBlock";
import { UnifiedImageBlockRenderer as UnifiedImageBlockRenderer } from "@/features/files/blocks/image/UnifiedImageBlockRenderer";
import { YouTubeEmbed as YouTubeEmbedBlock } from "@/features/files/blocks/youtube/YouTubeEmbed";
import SearchResultsBlock from "../../blocks/data-events/SearchResultsBlock";
import SearchErrorBlock from "../../blocks/data-events/SearchErrorBlock";
import FunctionResultBlock from "../../blocks/data-events/FunctionResultBlock";
import WorkflowStepBlock from "../../blocks/data-events/WorkflowStepBlock";
import CategorizationResultBlock from "../../blocks/data-events/CategorizationResultBlock";
import FetchResultsBlock from "../../blocks/data-events/FetchResultsBlock";
import { PodcastCompleteBlock as PodcastCompleteBlockLazy } from "../../blocks/data-events/PodcastBlock";
import { PodcastStageBlock as PodcastStageBlockLazy } from "../../blocks/data-events/PodcastBlock";
import ScrapeBatchCompleteBlock from "../../blocks/data-events/ScrapeBatchCompleteBlock";
import StructuredInputWarningBlock from "../../blocks/data-events/StructuredInputWarningBlock";
import DisplayQuestionnaireBlock from "../../blocks/data-events/DisplayQuestionnaireBlock";
import UnknownDataEventBlock from "../../blocks/data-events/UnknownDataEventBlock";
import ValueStoreStoredBlock from "../../blocks/data-events/ValueStoreStoredBlock";
import ContextGroomedBlock from "../../blocks/data-events/ContextGroomedBlock";
import QuizLoadingVisualization from "../../blocks/quiz/QuizLoadingVisualization";
import PresentationLoadingVisualization from "../../blocks/presentations/PresentationLoadingVisualization";
import RecipeLoadingVisualization from "../../blocks/cooking-recipes/RecipeLoadingVisualization";
import TimelineLoadingVisualization from "../../blocks/timeline/TimelineLoadingVisualization";
import ResearchLoadingVisualization from "../../blocks/research/ResearchLoadingVisualization";
import ResourcesLoadingVisualization from "../../blocks/resources/ResourcesLoadingVisualization";
import ProgressLoadingVisualization from "../../blocks/progress/ProgressLoadingVisualization";
import ComparisonLoadingVisualization from "../../blocks/comparison/ComparisonLoadingVisualization";
import TroubleshootingLoadingVisualization from "../../blocks/troubleshooting/TroubleshootingLoadingVisualization";
import DecisionTreeLoadingVisualization from "../../blocks/decision-tree/DecisionTreeLoadingVisualization";
import DiagramLoadingVisualization from "../../blocks/diagram/DiagramLoadingVisualization";
import MathProblemLoadingVisualization from "../../blocks/math/MathProblemLoadingVisualization";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import BasicMarkdownContent from "../BasicMarkdownContent";

// Lazy-load CodeBlock to avoid circular dependency with Redux store
const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

// Inline auto-preview for complete HTML documents (converts to a live webpage).
const HtmlInlinePreview = lazy(
  () => import("@/features/html-pages/components/HtmlInlinePreview"),
);

// Inline auto-preview for jsx/tsx/react code blocks (compiles to a live component).
const ReactCodeBlock = lazy(
  () => import("@/features/dynamic-react/ReactCodeBlock"),
);

// Static imports for frequently used, lightweight components
import { QuestionnaireProvider } from "../../blocks/questionnaire/QuestionnaireContext";

// Lazy load heavier/less common block components
const MatrxFileBlock = lazy(
  () => import("../../blocks/matrx-file/MatrxFileBlock"),
);
const InteractiveDiagramBlock = lazy(
  () => import("../../blocks/diagram/InteractiveDiagramBlock"),
);
const MermaidBlock = lazy(() => import("../../blocks/mermaid/MermaidBlock"));
const StreamingDiffBlock = lazy(() =>
  import("../diff-blocks/StreamingDiffBlock").then((m) => ({
    default: m.StreamingDiffBlock,
  })),
);
const SearchReplaceBlock = lazy(() =>
  import("../../blocks/search-replace/SearchReplaceBlock").then((m) => ({
    default: m.SearchReplaceBlock,
  })),
);
// Lazy load loading visualizations (lightweight but rarely all needed at once)
// Note: Parsers are loaded dynamically within BlockRenderer.tsx when needed
// They cannot be lazy-loaded here as they are not React components

/**
 * Wrapper component that provides Suspense boundary for lazy-loaded blocks
 */
interface LazyBlockWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const LazyBlockWrapper: React.FC<LazyBlockWrapperProps> = ({
  children,
  fallback,
}) => (
  <Suspense fallback={fallback || <MatrxMiniLoader />}>{children}</Suspense>
);

/**
 * Export wrapped components for use in MarkdownStream
 */
export const BlockComponents = {
  // Lightweight components
  BasicMarkdownContent,

  // CodeBlock is lazy-loaded to avoid circular dependency with Redux
  CodeBlock: (props: React.ComponentProps<typeof CodeBlock>) => (
    <LazyBlockWrapper>
      <CodeBlock {...props} />
    </LazyBlockWrapper>
  ),

  HtmlInlinePreview: (props: React.ComponentProps<typeof HtmlInlinePreview>) => (
    <LazyBlockWrapper>
      <HtmlInlinePreview {...props} />
    </LazyBlockWrapper>
  ),

  ReactCodeBlock: (props: React.ComponentProps<typeof ReactCodeBlock>) => (
    <LazyBlockWrapper>
      <ReactCodeBlock {...props} />
    </LazyBlockWrapper>
  ),

  // Wrapped lazy components
  ThinkingVisualization: (props: React.ComponentProps<typeof ThinkingVisualization>) => (
    <LazyBlockWrapper>
      <ThinkingVisualization {...props} />
    </LazyBlockWrapper>
  ),
  ReasoningVisualization: (props: React.ComponentProps<typeof ReasoningVisualization>) => (
    <LazyBlockWrapper>
      <ReasoningVisualization {...props} />
    </LazyBlockWrapper>
  ),
  ConsolidatedReasoningVisualization: (props: React.ComponentProps<typeof ConsolidatedReasoningVisualization>) => (
    <LazyBlockWrapper>
      <ConsolidatedReasoningVisualization {...props} />
    </LazyBlockWrapper>
  ),
  ImageBlock: (props: React.ComponentProps<typeof ImageBlock>) => (
    <LazyBlockWrapper>
      <ImageBlock {...props} />
    </LazyBlockWrapper>
  ),
  MatrxFileBlock: (props: React.ComponentProps<typeof MatrxFileBlock>) => (
    <LazyBlockWrapper>
      <MatrxFileBlock {...props} />
    </LazyBlockWrapper>
  ),
  YouTubeEmbedBlock: (props: React.ComponentProps<typeof YouTubeEmbedBlock>) => (
    <LazyBlockWrapper>
      <YouTubeEmbedBlock {...props} />
    </LazyBlockWrapper>
  ),
  TranscriptBlock: (props: React.ComponentProps<typeof TranscriptBlock>) => (
    <LazyBlockWrapper>
      <TranscriptBlock {...props} />
    </LazyBlockWrapper>
  ),
  TasksBlock: (props: React.ComponentProps<typeof TasksBlock>) => (
    <LazyBlockWrapper>
      <TasksBlock {...props} />
    </LazyBlockWrapper>
  ),
  StructuredPlanBlock: (props: React.ComponentProps<typeof StructuredPlanBlock>) => (
    <LazyBlockWrapper>
      <StructuredPlanBlock {...props} />
    </LazyBlockWrapper>
  ),
  FlashcardsBlock: (props: React.ComponentProps<typeof FlashcardsBlock>) => (
    <LazyBlockWrapper>
      <FlashcardsBlock {...props} />
    </LazyBlockWrapper>
  ),
  VideoPromptOptionsBlock: (
    props: React.ComponentProps<typeof VideoPromptOptionsBlock>,
  ) => (
    <LazyBlockWrapper>
      <VideoPromptOptionsBlock {...props} />
    </LazyBlockWrapper>
  ),
  KeywordResearchBlock: (
    props: React.ComponentProps<typeof KeywordResearchBlock>,
  ) => (
    <LazyBlockWrapper>
      <KeywordResearchBlock {...props} />
    </LazyBlockWrapper>
  ),
  KeywordClassificationBatchBlock: (
    props: React.ComponentProps<typeof KeywordClassificationBatchBlock>,
  ) => (
    <LazyBlockWrapper>
      <KeywordClassificationBatchBlock {...props} />
    </LazyBlockWrapper>
  ),
  PageBriefBlock: (props: React.ComponentProps<typeof PageBriefBlock>) => (
    <LazyBlockWrapper>
      <PageBriefBlock {...props} />
    </LazyBlockWrapper>
  ),
  MultipleChoiceQuiz: (props: React.ComponentProps<typeof MultipleChoiceQuiz>) => (
    <LazyBlockWrapper>
      <MultipleChoiceQuiz {...props} />
    </LazyBlockWrapper>
  ),
  Slideshow: (props: React.ComponentProps<typeof Slideshow>) => (
    <LazyBlockWrapper>
      <Slideshow {...props} />
    </LazyBlockWrapper>
  ),
  RecipeViewer: (props: React.ComponentProps<typeof RecipeViewer>) => (
    <LazyBlockWrapper>
      <RecipeViewer {...props} />
    </LazyBlockWrapper>
  ),
  TimelineBlock: (props: React.ComponentProps<typeof TimelineBlock>) => (
    <LazyBlockWrapper>
      <TimelineBlock {...props} />
    </LazyBlockWrapper>
  ),
  ResearchBlock: (props: React.ComponentProps<typeof ResearchBlock>) => (
    <LazyBlockWrapper>
      <ResearchBlock {...props} />
    </LazyBlockWrapper>
  ),
  ResourceCollectionBlock: (props: React.ComponentProps<typeof ResourceCollectionBlock>) => (
    <LazyBlockWrapper>
      <ResourceCollectionBlock {...props} />
    </LazyBlockWrapper>
  ),
  ProgressTrackerBlock: (props: React.ComponentProps<typeof ProgressTrackerBlock>) => (
    <LazyBlockWrapper>
      <ProgressTrackerBlock {...props} />
    </LazyBlockWrapper>
  ),
  ComparisonTableBlock: (props: React.ComponentProps<typeof ComparisonTableBlock>) => (
    <LazyBlockWrapper>
      <ComparisonTableBlock {...props} />
    </LazyBlockWrapper>
  ),
  TroubleshootingBlock: (props: React.ComponentProps<typeof TroubleshootingBlock>) => (
    <LazyBlockWrapper>
      <TroubleshootingBlock {...props} />
    </LazyBlockWrapper>
  ),
  DecisionTreeBlock: (props: React.ComponentProps<typeof DecisionTreeBlock>) => (
    <LazyBlockWrapper>
      <DecisionTreeBlock {...props} />
    </LazyBlockWrapper>
  ),
  InteractiveDiagramBlock: (props: React.ComponentProps<typeof InteractiveDiagramBlock>) => (
    <LazyBlockWrapper>
      <InteractiveDiagramBlock {...props} />
    </LazyBlockWrapper>
  ),
  MermaidBlock: (props: React.ComponentProps<typeof MermaidBlock>) => (
    <LazyBlockWrapper>
      <MermaidBlock {...props} />
    </LazyBlockWrapper>
  ),
  SvgBlock: (props: React.ComponentProps<typeof SvgBlock>) => (
    <LazyBlockWrapper>
      <SvgBlock {...props} />
    </LazyBlockWrapper>
  ),
  ChartBlock: (props: React.ComponentProps<typeof ChartBlock>) => (
    <LazyBlockWrapper>
      <ChartBlock {...props} />
    </LazyBlockWrapper>
  ),
  ItemPresentationBlock: (props: React.ComponentProps<typeof ItemPresentationBlock>) => (
    <LazyBlockWrapper>
      <ItemPresentationBlock {...props} />
    </LazyBlockWrapper>
  ),
  MatrxEnvelopeBlock: (props: React.ComponentProps<typeof MatrxEnvelopeBlock>) => (
    <LazyBlockWrapper>
      <MatrxEnvelopeBlock {...props} />
    </LazyBlockWrapper>
  ),
  SchemaProposalBlock: (props: React.ComponentProps<typeof SchemaProposalBlock>) => (
    <LazyBlockWrapper>
      <SchemaProposalBlock {...props} />
    </LazyBlockWrapper>
  ),
  MathProblemBlock: (props: React.ComponentProps<typeof MathProblemBlock>) => (
    <LazyBlockWrapper>
      <MathProblemBlock {...props} />
    </LazyBlockWrapper>
  ),
  QuestionnaireRenderer: (props: React.ComponentProps<typeof QuestionnaireRenderer>) => (
    <LazyBlockWrapper>
      <QuestionnaireProvider>
        <QuestionnaireRenderer {...props} />
      </QuestionnaireProvider>
    </LazyBlockWrapper>
  ),
  MarkdownTable: (props: React.ComponentProps<typeof MarkdownTable>) => (
    <LazyBlockWrapper>
      <MarkdownTable {...props} />
    </LazyBlockWrapper>
  ),
  StreamingTableRenderer: (props: React.ComponentProps<typeof StreamingTableRenderer>) => (
    <LazyBlockWrapper>
      <StreamingTableRenderer {...props} />
    </LazyBlockWrapper>
  ),
  StreamingDiffBlock: (props: React.ComponentProps<typeof StreamingDiffBlock>) => (
    <LazyBlockWrapper>
      <StreamingDiffBlock {...props} />
    </LazyBlockWrapper>
  ),
  SearchReplaceBlock: (props: React.ComponentProps<typeof SearchReplaceBlock>) => (
    <LazyBlockWrapper>
      <SearchReplaceBlock {...props} />
    </LazyBlockWrapper>
  ),
  InlineDecisionBlock: (props: React.ComponentProps<typeof InlineDecisionBlock>) => (
    <LazyBlockWrapper>
      <InlineDecisionBlock {...props} />
    </LazyBlockWrapper>
  ),
  ArtifactBlock: (props: React.ComponentProps<typeof ArtifactBlock>) => (
    <LazyBlockWrapper>
      <ArtifactBlock {...props} />
    </LazyBlockWrapper>
  ),
  ArtifactRefBlock: (props: React.ComponentProps<typeof ArtifactRefBlock>) => (
    <LazyBlockWrapper>
      <ArtifactRefBlock {...props} />
    </LazyBlockWrapper>
  ),
  EditorErrorBlock: (props: React.ComponentProps<typeof EditorErrorBlock>) => (
    <LazyBlockWrapper>
      <EditorErrorBlock {...props} />
    </LazyBlockWrapper>
  ),
  EditorCodeSnippetBlock: (props: React.ComponentProps<typeof EditorCodeSnippetBlock>) => (
    <LazyBlockWrapper>
      <EditorCodeSnippetBlock {...props} />
    </LazyBlockWrapper>
  ),
  AudioCitationBlock: (props: React.ComponentProps<typeof AudioCitationBlock>) => (
    <LazyBlockWrapper>
      <AudioCitationBlock {...props} />
    </LazyBlockWrapper>
  ),
  YamlBlock: (props: React.ComponentProps<typeof YamlBlock>) => (
    <LazyBlockWrapper>
      <YamlBlock {...props} />
    </LazyBlockWrapper>
  ),
  XmlBlock: (props: React.ComponentProps<typeof XmlBlock>) => (
    <LazyBlockWrapper>
      <XmlBlock {...props} />
    </LazyBlockWrapper>
  ),
  CsvBlock: (props: React.ComponentProps<typeof CsvBlock>) => (
    <LazyBlockWrapper>
      <CsvBlock {...props} />
    </LazyBlockWrapper>
  ),
  JsonBlock: (props: React.ComponentProps<typeof JsonBlock>) => (
    <LazyBlockWrapper>
      <JsonBlock {...props} />
    </LazyBlockWrapper>
  ),
  TomlBlock: (props: React.ComponentProps<typeof TomlBlock>) => (
    <LazyBlockWrapper>
      <TomlBlock {...props} />
    </LazyBlockWrapper>
  ),
  TreeBlock: (props: React.ComponentProps<typeof TreeBlock>) => (
    <LazyBlockWrapper>
      <TreeBlock {...props} />
    </LazyBlockWrapper>
  ),
  MarkdownPreviewBlock: (props: React.ComponentProps<typeof MarkdownPreviewBlock>) => (
    <LazyBlockWrapper>
      <MarkdownPreviewBlock {...props} />
    </LazyBlockWrapper>
  ),
  AudioOutputBlock: (props: React.ComponentProps<typeof AudioOutputBlock>) => (
    <LazyBlockWrapper>
      <AudioOutputBlock {...props} />
    </LazyBlockWrapper>
  ),
  ImageOutputBlock: (props: React.ComponentProps<typeof UnifiedImageBlockRenderer>) => (
    <LazyBlockWrapper>
      <UnifiedImageBlockRenderer {...props} />
    </LazyBlockWrapper>
  ),
  SearchResultsBlock: (props: React.ComponentProps<typeof SearchResultsBlock>) => (
    <LazyBlockWrapper>
      <SearchResultsBlock {...props} />
    </LazyBlockWrapper>
  ),
  SearchErrorBlock: (props: React.ComponentProps<typeof SearchErrorBlock>) => (
    <LazyBlockWrapper>
      <SearchErrorBlock {...props} />
    </LazyBlockWrapper>
  ),
  FunctionResultBlock: (props: React.ComponentProps<typeof FunctionResultBlock>) => (
    <LazyBlockWrapper>
      <FunctionResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  WorkflowStepBlock: (props: React.ComponentProps<typeof WorkflowStepBlock>) => (
    <LazyBlockWrapper>
      <WorkflowStepBlock {...props} />
    </LazyBlockWrapper>
  ),
  CategorizationResultBlock: (props: React.ComponentProps<typeof CategorizationResultBlock>) => (
    <LazyBlockWrapper>
      <CategorizationResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  FetchResultsBlock: (props: React.ComponentProps<typeof FetchResultsBlock>) => (
    <LazyBlockWrapper>
      <FetchResultsBlock {...props} />
    </LazyBlockWrapper>
  ),
  PodcastCompleteBlock: (props: React.ComponentProps<typeof PodcastCompleteBlockLazy>) => (
    <LazyBlockWrapper>
      <PodcastCompleteBlockLazy {...props} />
    </LazyBlockWrapper>
  ),
  PodcastStageBlock: (props: React.ComponentProps<typeof PodcastStageBlockLazy>) => (
    <LazyBlockWrapper>
      <PodcastStageBlockLazy {...props} />
    </LazyBlockWrapper>
  ),
  ScrapeBatchCompleteBlock: (props: React.ComponentProps<typeof ScrapeBatchCompleteBlock>) => (
    <LazyBlockWrapper>
      <ScrapeBatchCompleteBlock {...props} />
    </LazyBlockWrapper>
  ),
  StructuredInputWarningBlock: (props: React.ComponentProps<typeof StructuredInputWarningBlock>) => (
    <LazyBlockWrapper>
      <StructuredInputWarningBlock {...props} />
    </LazyBlockWrapper>
  ),
  DisplayQuestionnaireBlock: (props: React.ComponentProps<typeof DisplayQuestionnaireBlock>) => (
    <LazyBlockWrapper>
      <DisplayQuestionnaireBlock {...props} />
    </LazyBlockWrapper>
  ),
  UnknownDataEventBlock: (props: React.ComponentProps<typeof UnknownDataEventBlock>) => (
    <LazyBlockWrapper>
      <UnknownDataEventBlock {...props} />
    </LazyBlockWrapper>
  ),
  ValueStoreStoredBlock: (props: React.ComponentProps<typeof ValueStoreStoredBlock>) => (
    <LazyBlockWrapper>
      <ValueStoreStoredBlock {...props} />
    </LazyBlockWrapper>
  ),
  ContextGroomedBlock: (props: React.ComponentProps<typeof ContextGroomedBlock>) => (
    <LazyBlockWrapper>
      <ContextGroomedBlock {...props} />
    </LazyBlockWrapper>
  ),
};

/**
 * Export wrapped loading visualization components
 */
export const LoadingComponents = {
  QuizLoading: () => (
    <LazyBlockWrapper>
      <QuizLoadingVisualization />
    </LazyBlockWrapper>
  ),
  PresentationLoading: () => (
    <LazyBlockWrapper>
      <PresentationLoadingVisualization />
    </LazyBlockWrapper>
  ),
  RecipeLoading: () => (
    <LazyBlockWrapper>
      <RecipeLoadingVisualization />
    </LazyBlockWrapper>
  ),
  TimelineLoading: () => (
    <LazyBlockWrapper>
      <TimelineLoadingVisualization />
    </LazyBlockWrapper>
  ),
  ResearchLoading: () => (
    <LazyBlockWrapper>
      <ResearchLoadingVisualization />
    </LazyBlockWrapper>
  ),
  ResourcesLoading: () => (
    <LazyBlockWrapper>
      <ResourcesLoadingVisualization />
    </LazyBlockWrapper>
  ),
  ProgressLoading: () => (
    <LazyBlockWrapper>
      <ProgressLoadingVisualization />
    </LazyBlockWrapper>
  ),
  ComparisonLoading: () => (
    <LazyBlockWrapper>
      <ComparisonLoadingVisualization />
    </LazyBlockWrapper>
  ),
  TroubleshootingLoading: () => (
    <LazyBlockWrapper>
      <TroubleshootingLoadingVisualization />
    </LazyBlockWrapper>
  ),
  DecisionTreeLoading: () => (
    <LazyBlockWrapper>
      <DecisionTreeLoadingVisualization />
    </LazyBlockWrapper>
  ),
  DiagramLoading: () => (
    <LazyBlockWrapper>
      <DiagramLoadingVisualization />
    </LazyBlockWrapper>
  ),
  MathProblemLoading: () => (
    <LazyBlockWrapper>
      <MathProblemLoadingVisualization />
    </LazyBlockWrapper>
  ),
};
