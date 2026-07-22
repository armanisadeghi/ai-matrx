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
const VideoPromptOptionsBlock = lazy(
  () => import("../../blocks/video-prompt-options/VideoPromptOptionsBlock"),
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
const ValueStoreStoredBlock = lazy(
  () => import("../../blocks/data-events/ValueStoreStoredBlock"),
);
const ContextGroomedBlock = lazy(
  () => import("../../blocks/data-events/ContextGroomedBlock"),
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
