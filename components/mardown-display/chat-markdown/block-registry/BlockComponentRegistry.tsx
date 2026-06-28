"use client";

import React, { Suspense, lazy } from "react";
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
const ThinkingVisualization = lazy(
  () => import("../../blocks/thinking-reasoning/ThinkingVisualization"),
);
const ReasoningVisualization = lazy(
  () => import("../../blocks/thinking-reasoning/ReasoningVisualization"),
);
const ConsolidatedReasoningVisualization = lazy(
  () =>
    import("../../blocks/thinking-reasoning/ConsolidatedReasoningVisualization"),
);
const ImageBlock = lazy(() => import("../../blocks/images/ImageBlock"));
const VideoBlock = lazy(() => import("../../blocks/videos/VideoBlock"));
const MatrxFileBlock = lazy(
  () => import("../../blocks/matrx-file/MatrxFileBlock"),
);
const TranscriptBlock = lazy(
  () => import("../../blocks/transcripts/TranscriptBlock"),
);
const TasksBlock = lazy(() => import("../../blocks/tasks/TasksBlock"));
const StructuredPlanBlock = lazy(
  () => import("../../blocks/plan/StructuredPlanBlock"),
);
const FlashcardsBlock = lazy(
  () => import("../../blocks/flashcards/FlashcardsBlock"),
);
const MultipleChoiceQuiz = lazy(
  () => import("../../blocks/quiz/MultipleChoiceQuiz"),
);
const Slideshow = lazy(() => import("../../blocks/presentations/Slideshow"));
const RecipeViewer = lazy(
  () => import("../../blocks/cooking-recipes/cookingRecipeDisplay"),
);
const TimelineBlock = lazy(() => import("../../blocks/timeline/TimelineBlock"));
const ResearchBlock = lazy(() => import("../../blocks/research/ResearchBlock"));
const ResourceCollectionBlock = lazy(
  () => import("../../blocks/resources/ResourceCollectionBlock"),
);
const ProgressTrackerBlock = lazy(
  () => import("../../blocks/progress/ProgressTrackerBlock"),
);
const ComparisonTableBlock = lazy(
  () => import("../../blocks/comparison/ComparisonTableBlock"),
);
const TroubleshootingBlock = lazy(
  () => import("../../blocks/troubleshooting/TroubleshootingBlock"),
);
const DecisionTreeBlock = lazy(
  () => import("../../blocks/decision-tree/DecisionTreeBlock"),
);
const InteractiveDiagramBlock = lazy(
  () => import("../../blocks/diagram/InteractiveDiagramBlock"),
);
const MermaidBlock = lazy(() => import("../../blocks/mermaid/MermaidBlock"));
const SvgBlock = lazy(() => import("../../blocks/svg/SvgBlock"));
const ChartBlock = lazy(() => import("../../blocks/chart/ChartBlock"));
const ItemPresentationBlock = lazy(
  () => import("@/features/item-presentation/ItemPresentationBlock"),
);
const MatrxEnvelopeBlock = lazy(
  () => import("@/features/matrx-envelope/MatrxEnvelopeBlock"),
);
const SchemaProposalBlock = lazy(
  () =>
    import("@/features/agents/components/schema-proposal/SchemaProposalBlock"),
);
const MathProblemBlock = lazy(
  () => import("../../blocks/math/MathProblemBlock"),
);
const QuestionnaireRenderer = lazy(
  () => import("../../blocks/questionnaire/QuestionnaireRenderer"),
);
const MarkdownTable = lazy(() => import("../../tables/MarkdownTable"));
const StreamingTableRenderer = lazy(() =>
  import("../../blocks/table/StreamingTableRenderer").then((m) => ({
    default: m.StreamingTableRenderer,
  })),
);
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
const InlineDecisionBlock = lazy(
  () => import("../../blocks/inline-decision/InlineDecisionBlock"),
);
const ArtifactBlock = lazy(() => import("../../blocks/artifact/ArtifactBlock"));
const ArtifactRefBlock = lazy(
  () => import("../../blocks/artifact/ArtifactRefBlock"),
);
const EditorErrorBlock = lazy(
  () => import("../../blocks/editor-resources/EditorErrorBlock"),
);
const EditorCodeSnippetBlock = lazy(
  () => import("../../blocks/editor-resources/EditorCodeSnippetBlock"),
);
const AudioCitationBlock = lazy(
  () => import("../../blocks/audio/AudioCitationBlock"),
);
const YamlBlock = lazy(() => import("../../blocks/yaml/YamlBlock"));
const XmlBlock = lazy(() => import("../../blocks/xml/XmlBlock"));
const CsvBlock = lazy(() => import("../../blocks/csv/CsvBlock"));
const JsonBlock = lazy(() =>
  import("../../blocks/json/JsonBlock").then((m) => ({
    default: m.JsonBlock,
  })),
);
const TomlBlock = lazy(() => import("../../blocks/toml/TomlBlock"));
const TreeBlock = lazy(() => import("../../blocks/tree/TreeBlock"));
const MarkdownPreviewBlock = lazy(
  () => import("../../blocks/markdown-preview/MarkdownPreviewBlock"),
);
const AudioOutputBlock = lazy(
  () => import("../../blocks/audio/AudioOutputBlock"),
);
const UnifiedImageBlockRenderer = lazy(() =>
  import("@/features/files/blocks/image/UnifiedImageBlockRenderer").then(
    (m) => ({ default: m.UnifiedImageBlockRenderer }),
  ),
);
const VideoOutputBlock = lazy(
  () => import("../../blocks/videos/VideoOutputBlock"),
);
const YouTubeEmbedBlock = lazy(() =>
  import("@/features/files/blocks/youtube/YouTubeEmbed").then((m) => ({
    default: m.YouTubeEmbed,
  })),
);
const SearchResultsBlock = lazy(
  () => import("../../blocks/data-events/SearchResultsBlock"),
);
const SearchErrorBlock = lazy(
  () => import("../../blocks/data-events/SearchErrorBlock"),
);
const FunctionResultBlock = lazy(
  () => import("../../blocks/data-events/FunctionResultBlock"),
);
const WorkflowStepBlock = lazy(
  () => import("../../blocks/data-events/WorkflowStepBlock"),
);
const CategorizationResultBlock = lazy(
  () => import("../../blocks/data-events/CategorizationResultBlock"),
);
const FetchResultsBlock = lazy(
  () => import("../../blocks/data-events/FetchResultsBlock"),
);
const PodcastCompleteBlockLazy = lazy(() =>
  import("../../blocks/data-events/PodcastBlock").then((m) => ({
    default: m.PodcastCompleteBlock,
  })),
);
const PodcastStageBlockLazy = lazy(() =>
  import("../../blocks/data-events/PodcastBlock").then((m) => ({
    default: m.PodcastStageBlock,
  })),
);
const ScrapeBatchCompleteBlock = lazy(
  () => import("../../blocks/data-events/ScrapeBatchCompleteBlock"),
);
const StructuredInputWarningBlock = lazy(
  () => import("../../blocks/data-events/StructuredInputWarningBlock"),
);
const DisplayQuestionnaireBlock = lazy(
  () => import("../../blocks/data-events/DisplayQuestionnaireBlock"),
);
const UnknownDataEventBlock = lazy(
  () => import("../../blocks/data-events/UnknownDataEventBlock"),
);

// Lazy load loading visualizations (lightweight but rarely all needed at once)
const QuizLoadingVisualization = lazy(
  () => import("../../blocks/quiz/QuizLoadingVisualization"),
);
const PresentationLoadingVisualization = lazy(
  () => import("../../blocks/presentations/PresentationLoadingVisualization"),
);
const RecipeLoadingVisualization = lazy(
  () => import("../../blocks/cooking-recipes/RecipeLoadingVisualization"),
);
const TimelineLoadingVisualization = lazy(
  () => import("../../blocks/timeline/TimelineLoadingVisualization"),
);
const ResearchLoadingVisualization = lazy(
  () => import("../../blocks/research/ResearchLoadingVisualization"),
);
const ResourcesLoadingVisualization = lazy(
  () => import("../../blocks/resources/ResourcesLoadingVisualization"),
);
const ProgressLoadingVisualization = lazy(
  () => import("../../blocks/progress/ProgressLoadingVisualization"),
);
const ComparisonLoadingVisualization = lazy(
  () => import("../../blocks/comparison/ComparisonLoadingVisualization"),
);
const TroubleshootingLoadingVisualization = lazy(
  () =>
    import("../../blocks/troubleshooting/TroubleshootingLoadingVisualization"),
);
const DecisionTreeLoadingVisualization = lazy(
  () => import("../../blocks/decision-tree/DecisionTreeLoadingVisualization"),
);
const DiagramLoadingVisualization = lazy(
  () => import("../../blocks/diagram/DiagramLoadingVisualization"),
);
const MathProblemLoadingVisualization = lazy(
  () => import("../../blocks/math/MathProblemLoadingVisualization"),
);

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
  CodeBlock: (props: any) => (
    <LazyBlockWrapper>
      <CodeBlock {...props} />
    </LazyBlockWrapper>
  ),

  HtmlInlinePreview: (props: any) => (
    <LazyBlockWrapper>
      <HtmlInlinePreview {...props} />
    </LazyBlockWrapper>
  ),

  ReactCodeBlock: (props: any) => (
    <LazyBlockWrapper>
      <ReactCodeBlock {...props} />
    </LazyBlockWrapper>
  ),

  // Wrapped lazy components
  ThinkingVisualization: (props: any) => (
    <LazyBlockWrapper>
      <ThinkingVisualization {...props} />
    </LazyBlockWrapper>
  ),
  ReasoningVisualization: (props: any) => (
    <LazyBlockWrapper>
      <ReasoningVisualization {...props} />
    </LazyBlockWrapper>
  ),
  ConsolidatedReasoningVisualization: (props: any) => (
    <LazyBlockWrapper>
      <ConsolidatedReasoningVisualization {...props} />
    </LazyBlockWrapper>
  ),
  ImageBlock: (props: any) => (
    <LazyBlockWrapper>
      <ImageBlock {...props} />
    </LazyBlockWrapper>
  ),
  VideoBlock: (props: any) => (
    <LazyBlockWrapper>
      <VideoBlock {...props} />
    </LazyBlockWrapper>
  ),
  MatrxFileBlock: (props: any) => (
    <LazyBlockWrapper>
      <MatrxFileBlock {...props} />
    </LazyBlockWrapper>
  ),
  YouTubeEmbedBlock: (props: any) => (
    <LazyBlockWrapper>
      <YouTubeEmbedBlock {...props} />
    </LazyBlockWrapper>
  ),
  TranscriptBlock: (props: any) => (
    <LazyBlockWrapper>
      <TranscriptBlock {...props} />
    </LazyBlockWrapper>
  ),
  TasksBlock: (props: any) => (
    <LazyBlockWrapper>
      <TasksBlock {...props} />
    </LazyBlockWrapper>
  ),
  StructuredPlanBlock: (props: any) => (
    <LazyBlockWrapper>
      <StructuredPlanBlock {...props} />
    </LazyBlockWrapper>
  ),
  FlashcardsBlock: (props: any) => (
    <LazyBlockWrapper>
      <FlashcardsBlock {...props} />
    </LazyBlockWrapper>
  ),
  MultipleChoiceQuiz: (props: any) => (
    <LazyBlockWrapper>
      <MultipleChoiceQuiz {...props} />
    </LazyBlockWrapper>
  ),
  Slideshow: (props: any) => (
    <LazyBlockWrapper>
      <Slideshow {...props} />
    </LazyBlockWrapper>
  ),
  RecipeViewer: (props: any) => (
    <LazyBlockWrapper>
      <RecipeViewer {...props} />
    </LazyBlockWrapper>
  ),
  TimelineBlock: (props: any) => (
    <LazyBlockWrapper>
      <TimelineBlock {...props} />
    </LazyBlockWrapper>
  ),
  ResearchBlock: (props: any) => (
    <LazyBlockWrapper>
      <ResearchBlock {...props} />
    </LazyBlockWrapper>
  ),
  ResourceCollectionBlock: (props: any) => (
    <LazyBlockWrapper>
      <ResourceCollectionBlock {...props} />
    </LazyBlockWrapper>
  ),
  ProgressTrackerBlock: (props: any) => (
    <LazyBlockWrapper>
      <ProgressTrackerBlock {...props} />
    </LazyBlockWrapper>
  ),
  ComparisonTableBlock: (props: any) => (
    <LazyBlockWrapper>
      <ComparisonTableBlock {...props} />
    </LazyBlockWrapper>
  ),
  TroubleshootingBlock: (props: any) => (
    <LazyBlockWrapper>
      <TroubleshootingBlock {...props} />
    </LazyBlockWrapper>
  ),
  DecisionTreeBlock: (props: any) => (
    <LazyBlockWrapper>
      <DecisionTreeBlock {...props} />
    </LazyBlockWrapper>
  ),
  InteractiveDiagramBlock: (props: any) => (
    <LazyBlockWrapper>
      <InteractiveDiagramBlock {...props} />
    </LazyBlockWrapper>
  ),
  MermaidBlock: (props: any) => (
    <LazyBlockWrapper>
      <MermaidBlock {...props} />
    </LazyBlockWrapper>
  ),
  SvgBlock: (props: any) => (
    <LazyBlockWrapper>
      <SvgBlock {...props} />
    </LazyBlockWrapper>
  ),
  ChartBlock: (props: any) => (
    <LazyBlockWrapper>
      <ChartBlock {...props} />
    </LazyBlockWrapper>
  ),
  ItemPresentationBlock: (props: any) => (
    <LazyBlockWrapper>
      <ItemPresentationBlock {...props} />
    </LazyBlockWrapper>
  ),
  MatrxEnvelopeBlock: (props: any) => (
    <LazyBlockWrapper>
      <MatrxEnvelopeBlock {...props} />
    </LazyBlockWrapper>
  ),
  SchemaProposalBlock: (props: any) => (
    <LazyBlockWrapper>
      <SchemaProposalBlock {...props} />
    </LazyBlockWrapper>
  ),
  MathProblemBlock: (props: any) => (
    <LazyBlockWrapper>
      <MathProblemBlock {...props} />
    </LazyBlockWrapper>
  ),
  QuestionnaireRenderer: (props: any) => (
    <LazyBlockWrapper>
      <QuestionnaireProvider>
        <QuestionnaireRenderer {...props} />
      </QuestionnaireProvider>
    </LazyBlockWrapper>
  ),
  MarkdownTable: (props: any) => (
    <LazyBlockWrapper>
      <MarkdownTable {...props} />
    </LazyBlockWrapper>
  ),
  StreamingTableRenderer: (props: any) => (
    <LazyBlockWrapper>
      <StreamingTableRenderer {...props} />
    </LazyBlockWrapper>
  ),
  StreamingDiffBlock: (props: any) => (
    <LazyBlockWrapper>
      <StreamingDiffBlock {...props} />
    </LazyBlockWrapper>
  ),
  SearchReplaceBlock: (props: any) => (
    <LazyBlockWrapper>
      <SearchReplaceBlock {...props} />
    </LazyBlockWrapper>
  ),
  InlineDecisionBlock: (props: any) => (
    <LazyBlockWrapper>
      <InlineDecisionBlock {...props} />
    </LazyBlockWrapper>
  ),
  ArtifactBlock: (props: any) => (
    <LazyBlockWrapper>
      <ArtifactBlock {...props} />
    </LazyBlockWrapper>
  ),
  ArtifactRefBlock: (props: any) => (
    <LazyBlockWrapper>
      <ArtifactRefBlock {...props} />
    </LazyBlockWrapper>
  ),
  EditorErrorBlock: (props: any) => (
    <LazyBlockWrapper>
      <EditorErrorBlock {...props} />
    </LazyBlockWrapper>
  ),
  EditorCodeSnippetBlock: (props: any) => (
    <LazyBlockWrapper>
      <EditorCodeSnippetBlock {...props} />
    </LazyBlockWrapper>
  ),
  AudioCitationBlock: (props: any) => (
    <LazyBlockWrapper>
      <AudioCitationBlock {...props} />
    </LazyBlockWrapper>
  ),
  YamlBlock: (props: any) => (
    <LazyBlockWrapper>
      <YamlBlock {...props} />
    </LazyBlockWrapper>
  ),
  XmlBlock: (props: any) => (
    <LazyBlockWrapper>
      <XmlBlock {...props} />
    </LazyBlockWrapper>
  ),
  CsvBlock: (props: any) => (
    <LazyBlockWrapper>
      <CsvBlock {...props} />
    </LazyBlockWrapper>
  ),
  JsonBlock: (props: any) => (
    <LazyBlockWrapper>
      <JsonBlock {...props} />
    </LazyBlockWrapper>
  ),
  TomlBlock: (props: any) => (
    <LazyBlockWrapper>
      <TomlBlock {...props} />
    </LazyBlockWrapper>
  ),
  TreeBlock: (props: any) => (
    <LazyBlockWrapper>
      <TreeBlock {...props} />
    </LazyBlockWrapper>
  ),
  MarkdownPreviewBlock: (props: any) => (
    <LazyBlockWrapper>
      <MarkdownPreviewBlock {...props} />
    </LazyBlockWrapper>
  ),
  AudioOutputBlock: (props: any) => (
    <LazyBlockWrapper>
      <AudioOutputBlock {...props} />
    </LazyBlockWrapper>
  ),
  ImageOutputBlock: (props: any) => (
    <LazyBlockWrapper>
      <UnifiedImageBlockRenderer {...props} />
    </LazyBlockWrapper>
  ),
  VideoOutputBlock: (props: any) => (
    <LazyBlockWrapper>
      <VideoOutputBlock {...props} />
    </LazyBlockWrapper>
  ),
  SearchResultsBlock: (props: any) => (
    <LazyBlockWrapper>
      <SearchResultsBlock {...props} />
    </LazyBlockWrapper>
  ),
  SearchErrorBlock: (props: any) => (
    <LazyBlockWrapper>
      <SearchErrorBlock {...props} />
    </LazyBlockWrapper>
  ),
  FunctionResultBlock: (props: any) => (
    <LazyBlockWrapper>
      <FunctionResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  WorkflowStepBlock: (props: any) => (
    <LazyBlockWrapper>
      <WorkflowStepBlock {...props} />
    </LazyBlockWrapper>
  ),
  CategorizationResultBlock: (props: any) => (
    <LazyBlockWrapper>
      <CategorizationResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  FetchResultsBlock: (props: any) => (
    <LazyBlockWrapper>
      <FetchResultsBlock {...props} />
    </LazyBlockWrapper>
  ),
  PodcastCompleteBlock: (props: any) => (
    <LazyBlockWrapper>
      <PodcastCompleteBlockLazy {...props} />
    </LazyBlockWrapper>
  ),
  PodcastStageBlock: (props: any) => (
    <LazyBlockWrapper>
      <PodcastStageBlockLazy {...props} />
    </LazyBlockWrapper>
  ),
  ScrapeBatchCompleteBlock: (props: any) => (
    <LazyBlockWrapper>
      <ScrapeBatchCompleteBlock {...props} />
    </LazyBlockWrapper>
  ),
  StructuredInputWarningBlock: (props: any) => (
    <LazyBlockWrapper>
      <StructuredInputWarningBlock {...props} />
    </LazyBlockWrapper>
  ),
  DisplayQuestionnaireBlock: (props: any) => (
    <LazyBlockWrapper>
      <DisplayQuestionnaireBlock {...props} />
    </LazyBlockWrapper>
  ),
  UnknownDataEventBlock: (props: any) => (
    <LazyBlockWrapper>
      <UnknownDataEventBlock {...props} />
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
