"use client";
import {
  BlockComponents as EngineBlockComponents,
  registerBlockComponents,
  registerLoadingComponents,
} from "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockComponentRegistry";

import React, { Suspense, lazy } from "react";
import TranscriptBlock from "@/components/mardown-display/blocks/transcripts/TranscriptBlock";
import TasksBlock from "@/components/mardown-display/blocks/tasks/TasksBlock";
import StructuredPlanBlock from "@/components/mardown-display/blocks/plan/StructuredPlanBlock";
import FlashcardsBlock from "@/components/mardown-display/blocks/flashcards/FlashcardsBlock";
import VideoPromptOptionsBlock from "@/components/mardown-display/blocks/video-prompt-options/VideoPromptOptionsBlock";
import MapTopicProposalBlock from "@/components/mardown-display/blocks/map-topic-proposal/MapTopicProposalBlock";
import PrPlayMenuBlock from "@/components/mardown-display/blocks/pr-play-menu/PrPlayMenuBlock";
import NewsMonitorKindBlock from "@/components/mardown-display/blocks/news-monitor/NewsMonitorKindBlock";
import DecisionAnswersBlock from "@/components/mardown-display/blocks/decision-answers/DecisionAnswersBlock";
import ListChangeProposalBlock from "@/components/mardown-display/blocks/list-change-proposal/ListChangeProposalBlock";
import KeywordResearchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordResearchBlock";
import KeywordClassificationBatchBlock from "@/components/mardown-display/blocks/keyword-research/KeywordClassificationBatchBlock";
import KeywordSerpIntentAnalysisBlock from "@/components/mardown-display/blocks/keyword-research/KeywordSerpIntentAnalysisBlock";
import SeoKeywordResearchResultBlock from "@/components/mardown-display/blocks/keyword-research/SeoKeywordResearchResultBlock";
import PageBriefBlock from "@/components/mardown-display/blocks/page-brief/PageBriefBlock";
import CmsHtmlPageResultBlock from "@/components/mardown-display/blocks/cms-html-page-result/CmsHtmlPageResultBlock";
import AppletBuildResultBlock from "@/components/mardown-display/blocks/applet-build-result/AppletBuildResultBlock";
import {
  SpaceBuildResultBlock,
  SpaceDatabaseDesignBlock,
  SpaceNotionImportBlock,
} from "@/components/mardown-display/blocks/spaces-results/SpacesResultBlocks";
import EpisodeTitleOptionsBlock from "@/components/mardown-display/blocks/episode-title-options/EpisodeTitleOptionsBlock";
import MasterworkCheckupFindingBlock from "@/components/mardown-display/blocks/masterwork-checkup/MasterworkCheckupFindingBlock";
import MasterworkResultBlock from "@/components/mardown-display/blocks/masterwork/MasterworkResultBlock";
import SerialObservationTimelineBlock from "@/components/mardown-display/blocks/masterwork-timeline/SerialObservationTimelineBlock";
import CaseDisclosureBlock from "@/components/mardown-display/blocks/masterwork-unfolding/CaseDisclosureBlock";
import RefusalBlock from "@/components/mardown-display/blocks/refusal/RefusalBlock";
import UnfoldingRulingBlock from "@/components/mardown-display/blocks/masterwork-unfolding/UnfoldingRulingBlock";
import AgentResultBlock from "@/components/mardown-display/blocks/agent-result/AgentResultBlock";
// Runtime wrapper kinds — transparent routers that DELEGATE the nested payload
// back to the registry (RUNTIME_WRAPPER_WIRE.md §5).
import NodeOutcomeBlock from "@/components/mardown-display/blocks/runtime-wrappers/NodeOutcomeBlock";
import RunResultBlock from "@/components/mardown-display/blocks/runtime-wrappers/RunResultBlock";
import MediaChaptersBlock from "@/components/mardown-display/blocks/media-chapters/MediaChaptersBlock";
import GeneratedImageSetBlock from "@/components/mardown-display/blocks/media-io/GeneratedImageSetBlock";
import GeneratedVideoSetBlock from "@/components/mardown-display/blocks/media-io/GeneratedVideoSetBlock";
import GeneratedAudioBlock from "@/components/mardown-display/blocks/media-io/GeneratedAudioBlock";
import PodcastEpisodeBlock from "@/components/mardown-display/blocks/media-io/PodcastEpisodeBlock";
import MediaAssetBlock from "@/components/mardown-display/blocks/media-io/MediaAssetBlock";
import MemoryAidBlock from "@/components/mardown-display/blocks/memory-aid/MemoryAidBlock";
import MemoryHintBlock from "@/components/mardown-display/blocks/memory-aid/MemoryHintBlock";
import SeoPackageBlock from "@/components/mardown-display/blocks/seo-package/SeoPackageBlock";
// Search kind family (Search Kinds Pilot) — one canonical component per kind.
import WebSearchResultsBlockImpl from "@/components/mardown-display/blocks/search-kinds/WebSearchResultsBlock";
import ScrapedPageBlockImpl from "@/components/mardown-display/blocks/scraper-kinds/ScrapedPageBlock";
import PageCleaningReportBlockImpl from "@/components/mardown-display/blocks/scraper-kinds/PageCleaningReportBlock";
import {
  ScraperBatchResultBlock as ScraperBatchResultBlockImpl,
  ScraperCrawlResultBlock as ScraperCrawlResultBlockImpl,
} from "@/components/mardown-display/blocks/scraper-kinds/collection-blocks";
import {
  CodeBlockKindBlock as CodeBlockKindBlockImpl,
  ContentFingerprintBlock as ContentFingerprintBlockImpl,
  LinkBucketsBlock as LinkBucketsBlockImpl,
  PageAudioBlock as PageAudioBlockImpl,
  PageBlockBlock as PageBlockBlockImpl,
  PageHeadingBlock as PageHeadingBlockImpl,
  PageImageBlock as PageImageBlockImpl,
  PageLinkBlock as PageLinkBlockImpl,
  PageListBlock as PageListBlockImpl,
  PageMetadataBlock as PageMetadataBlockImpl,
  PageRemovalBlock as PageRemovalBlockImpl,
  PageSectionBlock as PageSectionBlockImpl,
  PageVideoBlock as PageVideoBlockImpl,
  RedirectHopBlock as RedirectHopBlockImpl,
} from "@/components/mardown-display/blocks/scraper-kinds/primitive-blocks";

import {
  WebResultBlock as WebResultBlockImpl,
  NewsResultBlock as NewsResultBlockImpl,
  VideoResultBlock as VideoResultBlockImpl,
  FaqItemBlock as FaqItemBlockImpl,
  DiscussionResultBlock as DiscussionResultBlockImpl,
} from "@/components/mardown-display/blocks/search-kinds/item-blocks";
import {
  LocalPlaceBlock as LocalPlaceBlockImpl,
  EntityCardBlock as EntityCardBlockImpl,
  AiAnswerKindBlock as AiAnswerKindBlockImpl,
} from "@/components/mardown-display/blocks/search-kinds/place-entity-blocks";
// Rank / SERP-landscape kind family (Rank Kinds Run) — one canonical
// component per kind; every nested search result delegates back to the
// search family's components above.
import SeoRankSerpLandscapeBlockImpl from "@/components/mardown-display/blocks/rank-kinds/SeoRankSerpLandscapeBlock";
import SerpPlacementBlockImpl from "@/components/mardown-display/blocks/rank-kinds/SerpPlacementBlock";
// The fetch-more HOST, not the bare block: production truncated tables must
// carry a working "get the rest" control wherever the producing read can be
// re-run (A-9 / LAW 3). The host defers to any page-level provider and
// renders the same canonical DataTableBlock.
import DataTableBlockImpl from "@/components/mardown-display/blocks/table-kinds/DataTableBlockWithMore";
// Social-intelligence kind family (SI-07c): one canonical component per kind.
import {
  AdCreativeBlock as AdCreativeBlockImpl,
  OutlierRowBlock as OutlierRowBlockImpl,
  PostTranscriptBlock as PostTranscriptBlockImpl,
  SocialPostBlock as SocialPostBlockImpl,
  SocialProfileBlock as SocialProfileBlockImpl,
  SwipeCollectionBlock as SwipeCollectionBlockImpl,
} from "@/components/mardown-display/blocks/social-kinds/social-kind-blocks";
import {
  ProviderRunReceiptBlock as ProviderRunReceiptBlockImpl,
  SeoRankReadingBlock as SeoRankReadingBlockImpl,
} from "@/components/mardown-display/blocks/rank-kinds/reading-blocks";
import {
  SeoRankPortfolioBlock as SeoRankPortfolioBlockImpl,
  SeoRankTargetBlock as SeoRankTargetBlockImpl,
  SeoRankTargetRemovalBlock as SeoRankTargetRemovalBlockImpl,
} from "@/components/mardown-display/blocks/rank-kinds/target-blocks";
import {
  AssetGradingBlock as AssetGradingBlockImpl,
  EnrichmentVerificationBlock as EnrichmentVerificationBlockImpl,
  IntakePhotoGroupingBlock as IntakePhotoGroupingBlockImpl,
  ItemVisionExtractionBlock as ItemVisionExtractionBlockImpl,
  ListingDraftBlock as ListingDraftBlockImpl,
  LotDetectionBlock as LotDetectionBlockImpl,
  PricingProposalBlock as PricingProposalBlockImpl,
  ProductResearchBlock as ProductResearchBlockImpl,
  PublishPreflightBlock as PublishPreflightBlockImpl,
  ReviewVerdictBlock as ReviewVerdictBlockImpl,
  ValueAssessmentBlock as ValueAssessmentBlockImpl,
} from "@/components/mardown-display/blocks/commerce-kinds/commerce-kind-blocks";
import {
  MediaCandidateVerdictBlock as MediaCandidateVerdictBlockImpl,
  MediaListRankingBlock as MediaListRankingBlockImpl,
} from "@/components/mardown-display/blocks/media-list/media-list-blocks";
// Lulu print lane kind family — one canonical renderer per shape.
import {
  LuluCoverDimensionsBlock as LuluCoverDimensionsBlockImpl,
  LuluPrintCostBlock as LuluPrintCostBlockImpl,
  LuluPrintJobBlock as LuluPrintJobBlockImpl,
  LuluPrintProductMatchesBlock as LuluPrintProductMatchesBlockImpl,
  LuluShippingOptionsBlock as LuluShippingOptionsBlockImpl,
} from "@/components/mardown-display/blocks/print-kinds/print-kind-blocks";
// RAG retrieval + citation kind family (RAG Kinds Run). `source_ref` is a
// SYSTEM-WIDE primitive — the platform's cited-source shape — and is nested by
// every other family that says "here is where this came from". The chunk
// component adapts to `RagHitView` and renders the ONE canonical
// `RagHitCard`; it draws no card of its own.
import SourceRefBlockImpl from "@/components/mardown-display/blocks/rag-kinds/SourceRefBlock";
import { RetrievedChunkBlock as RetrievedChunkBlockImpl } from "@/components/mardown-display/blocks/rag-kinds/RetrievedChunkBlock";
import {
  RagSearchResultBlock as RagSearchResultBlockImpl,
  RagCrossDocSearchResultBlock as RagCrossDocSearchResultBlockImpl,
  RagSynthesizeResultBlock as RagSynthesizeResultBlockImpl,
} from "@/components/mardown-display/blocks/rag-kinds/collection-blocks";
import {
  RatingBlock as RatingBlockImpl,
  OpeningHoursBlock as OpeningHoursBlockImpl,
  PostalAddressBlock as PostalAddressBlockImpl,
  GeoCoordinatesBlock as GeoCoordinatesBlockImpl,
} from "@/components/mardown-display/blocks/search-kinds/primitive-blocks";
import PlanPageResearchBlock from "@/components/mardown-display/blocks/page-pipeline/PlanPageResearchBlock";
import PlanPageOutlineBlock from "@/components/mardown-display/blocks/page-pipeline/PlanPageOutlineBlock";
import PlanPageDraftBlock from "@/components/mardown-display/blocks/page-pipeline/PlanPageDraftBlock";
import PlanPageReviewBlock from "@/components/mardown-display/blocks/page-pipeline/PlanPageReviewBlock";
import CmsPageBuildBlock from "@/components/mardown-display/blocks/page-pipeline/CmsPageBuildBlock";
import IngestedSourcesBlock from "@/components/mardown-display/blocks/ingested-sources/IngestedSourcesBlock";
import StudyNotesBlock from "@/components/mardown-display/blocks/study-notes/StudyNotesBlock";
import LessonScriptsBlock from "@/components/mardown-display/blocks/lesson-scripts/LessonScriptsBlock";
import StudyPackBlock from "@/components/mardown-display/blocks/study-pack/StudyPackBlock";
import MultipleChoiceQuiz from "@/components/mardown-display/blocks/quiz/MultipleChoiceQuiz";
import Slideshow from "@/components/mardown-display/blocks/presentations/Slideshow";
import RecipeViewer from "@/components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay";
import TimelineBlock from "@/components/mardown-display/blocks/timeline/TimelineBlock";
import ResearchBlock from "@/components/mardown-display/blocks/research/ResearchBlock";
import ResourceCollectionBlock from "@/components/mardown-display/blocks/resources/ResourceCollectionBlock";
import ProgressTrackerBlock from "@/components/mardown-display/blocks/progress/ProgressTrackerBlock";
import ComparisonTableBlock from "@/components/mardown-display/blocks/comparison/ComparisonTableBlock";
import TroubleshootingBlock from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingBlock";
import DecisionTreeBlock from "@/components/mardown-display/blocks/decision-tree/DecisionTreeBlock";
import ItemPresentationBlock from "@/features/item-presentation/ItemPresentationBlock";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
import SchemaProposalBlock from "@/features/agents/components/schema-proposal/SchemaProposalBlock";
import MathProblemBlock from "@/components/mardown-display/blocks/math/MathProblemBlock";
import QuestionnaireRenderer from "@/components/mardown-display/blocks/questionnaire/QuestionnaireRenderer";
import { StreamingTableRenderer as StreamingTableRenderer } from "@ai-matrx/rich-content/display/blocks/table/StreamingTableRenderer";
import InlineDecisionBlock from "@/components/mardown-display/blocks/inline-decision/InlineDecisionBlock";
import ArtifactBlock from "@/components/mardown-display/blocks/artifact/ArtifactBlock";
import ArtifactRefBlock from "@/components/mardown-display/blocks/artifact/ArtifactRefBlock";
import EditorErrorBlock from "@/components/mardown-display/blocks/editor-resources/EditorErrorBlock";
import EditorCodeSnippetBlock from "@/components/mardown-display/blocks/editor-resources/EditorCodeSnippetBlock";
import AudioCitationBlock from "@/components/mardown-display/blocks/audio/AudioCitationBlock";
import { JsonBlock as JsonBlock } from "@ai-matrx/rich-content/display/blocks/json/JsonBlock";
import AudioOutputBlock from "@/components/mardown-display/blocks/audio/AudioOutputBlock";
import { UnifiedImageBlockRenderer as UnifiedImageBlockRenderer } from "@/features/files/blocks/image/UnifiedImageBlockRenderer";
import { YouTubeEmbed as YouTubeEmbedBlock } from "@/features/files/blocks/youtube/YouTubeEmbed";
import SearchResultsBlock from "@/components/mardown-display/blocks/data-events/SearchResultsBlock";
import SearchErrorBlock from "@/components/mardown-display/blocks/data-events/SearchErrorBlock";
import FunctionResultBlock from "@/components/mardown-display/blocks/data-events/FunctionResultBlock";
import WorkflowStepBlock from "@/components/mardown-display/blocks/data-events/WorkflowStepBlock";
import CategorizationResultBlock from "@/components/mardown-display/blocks/data-events/CategorizationResultBlock";
import FetchResultsBlock from "@/components/mardown-display/blocks/data-events/FetchResultsBlock";
import { PodcastCompleteBlock as PodcastCompleteBlockLazy } from "@/components/mardown-display/blocks/data-events/PodcastBlock";
import { PodcastStageBlock as PodcastStageBlockLazy } from "@/components/mardown-display/blocks/data-events/PodcastBlock";
import ScrapeBatchCompleteBlock from "@/components/mardown-display/blocks/data-events/ScrapeBatchCompleteBlock";
import StructuredInputWarningBlock from "@/components/mardown-display/blocks/data-events/StructuredInputWarningBlock";
import DisplayQuestionnaireBlock from "@/components/mardown-display/blocks/data-events/DisplayQuestionnaireBlock";
import UnknownDataEventBlock from "@/components/mardown-display/blocks/data-events/UnknownDataEventBlock";
import ValueStoreStoredBlock from "@/components/mardown-display/blocks/data-events/ValueStoreStoredBlock";
import DirectiveReceiptBlock from "@/components/mardown-display/blocks/data-events/DirectiveReceiptBlock";
import ContextGroomedBlock from "@/components/mardown-display/blocks/data-events/ContextGroomedBlock";
import QuizLoadingVisualization from "@/components/mardown-display/blocks/quiz/QuizLoadingVisualization";
import PresentationLoadingVisualization from "@/components/mardown-display/blocks/presentations/PresentationLoadingVisualization";
import RecipeLoadingVisualization from "@/components/mardown-display/blocks/cooking-recipes/RecipeLoadingVisualization";
import TimelineLoadingVisualization from "@/components/mardown-display/blocks/timeline/TimelineLoadingVisualization";
import ResearchLoadingVisualization from "@/components/mardown-display/blocks/research/ResearchLoadingVisualization";
import ResourcesLoadingVisualization from "@/components/mardown-display/blocks/resources/ResourcesLoadingVisualization";
import ProgressLoadingVisualization from "@/components/mardown-display/blocks/progress/ProgressLoadingVisualization";
import ComparisonLoadingVisualization from "@/components/mardown-display/blocks/comparison/ComparisonLoadingVisualization";
import TroubleshootingLoadingVisualization from "@/components/mardown-display/blocks/troubleshooting/TroubleshootingLoadingVisualization";
import DecisionTreeLoadingVisualization from "@/components/mardown-display/blocks/decision-tree/DecisionTreeLoadingVisualization";
import MathProblemLoadingVisualization from "@/components/mardown-display/blocks/math/MathProblemLoadingVisualization";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

// Inline auto-preview for complete HTML documents (converts to a live webpage).
const HtmlInlinePreview = lazy(
  () => import("@/features/html-pages/components/HtmlInlinePreview"),
);

// Inline auto-preview for jsx/tsx/react code blocks (compiles to a live component).
const ReactCodeBlock = lazy(
  () => import("@/features/dynamic-react/ReactCodeBlock"),
);

// Static imports for frequently used, lightweight components
import { QuestionnaireProvider } from "@/components/mardown-display/blocks/questionnaire/QuestionnaireContext";

// Lazy load heavier/less common block components
const MatrxFileBlock = lazy(
  () => import("@/components/mardown-display/blocks/matrx-file/MatrxFileBlock"),
);
const StreamingDiffBlock = lazy(() =>
  import("@ai-matrx/rich-content/display/chat-markdown/diff-blocks/StreamingDiffBlock").then((m) => ({
    default: m.StreamingDiffBlock,
  })),
);
const SearchReplaceBlock = lazy(() =>
  import("@ai-matrx/rich-content/display/blocks/search-replace/SearchReplaceBlock").then((m) => ({
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
const DOMAIN_BLOCK_COMPONENTS = {

  HtmlInlinePreview: (
    props: React.ComponentProps<typeof HtmlInlinePreview>,
  ) => (
    <LazyBlockWrapper>
      <HtmlInlinePreview {...props} />
    </LazyBlockWrapper>
  ),

  ReactCodeBlock: (props: React.ComponentProps<typeof ReactCodeBlock>) => (
    <LazyBlockWrapper>
      <ReactCodeBlock {...props} />
    </LazyBlockWrapper>
  ),
  MatrxFileBlock: (props: React.ComponentProps<typeof MatrxFileBlock>) => (
    <LazyBlockWrapper>
      <MatrxFileBlock {...props} />
    </LazyBlockWrapper>
  ),
  YouTubeEmbedBlock: (
    props: React.ComponentProps<typeof YouTubeEmbedBlock>,
  ) => (
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
  StructuredPlanBlock: (
    props: React.ComponentProps<typeof StructuredPlanBlock>,
  ) => (
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
  MapTopicProposalBlock: (
    props: React.ComponentProps<typeof MapTopicProposalBlock>,
  ) => (
    <LazyBlockWrapper>
      <MapTopicProposalBlock {...props} />
    </LazyBlockWrapper>
  ),
  NewsMonitorKindBlock: (
    props: React.ComponentProps<typeof NewsMonitorKindBlock>,
  ) => (
    <LazyBlockWrapper>
      <NewsMonitorKindBlock {...props} />
    </LazyBlockWrapper>
  ),
  PrPlayMenuBlock: (props: React.ComponentProps<typeof PrPlayMenuBlock>) => (
    <LazyBlockWrapper>
      <PrPlayMenuBlock {...props} />
    </LazyBlockWrapper>
  ),
  DecisionAnswersBlock: (
    props: React.ComponentProps<typeof DecisionAnswersBlock>,
  ) => (
    <LazyBlockWrapper>
      <DecisionAnswersBlock {...props} />
    </LazyBlockWrapper>
  ),
  ListChangeProposalBlock: (
    props: React.ComponentProps<typeof ListChangeProposalBlock>,
  ) => (
    <LazyBlockWrapper>
      <ListChangeProposalBlock {...props} />
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
  KeywordSerpIntentAnalysisBlock: (
    props: React.ComponentProps<typeof KeywordSerpIntentAnalysisBlock>,
  ) => (
    <LazyBlockWrapper>
      <KeywordSerpIntentAnalysisBlock {...props} />
    </LazyBlockWrapper>
  ),
  SeoKeywordResearchResultBlock: (
    props: React.ComponentProps<typeof SeoKeywordResearchResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <SeoKeywordResearchResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  PageBriefBlock: (props: React.ComponentProps<typeof PageBriefBlock>) => (
    <LazyBlockWrapper>
      <PageBriefBlock {...props} />
    </LazyBlockWrapper>
  ),
  CmsHtmlPageResultBlock: (
    props: React.ComponentProps<typeof CmsHtmlPageResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <CmsHtmlPageResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  AppletBuildResultBlock: (
    props: React.ComponentProps<typeof AppletBuildResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <AppletBuildResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  SpaceBuildResultBlock: (
    props: React.ComponentProps<typeof SpaceBuildResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <SpaceBuildResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  SpaceDatabaseDesignBlock: (
    props: React.ComponentProps<typeof SpaceDatabaseDesignBlock>,
  ) => (
    <LazyBlockWrapper>
      <SpaceDatabaseDesignBlock {...props} />
    </LazyBlockWrapper>
  ),
  SpaceNotionImportBlock: (
    props: React.ComponentProps<typeof SpaceNotionImportBlock>,
  ) => (
    <LazyBlockWrapper>
      <SpaceNotionImportBlock {...props} />
    </LazyBlockWrapper>
  ),
  PlanPageResearchBlock: (
    props: React.ComponentProps<typeof PlanPageResearchBlock>,
  ) => (
    <LazyBlockWrapper>
      <PlanPageResearchBlock {...props} />
    </LazyBlockWrapper>
  ),
  PlanPageOutlineBlock: (
    props: React.ComponentProps<typeof PlanPageOutlineBlock>,
  ) => (
    <LazyBlockWrapper>
      <PlanPageOutlineBlock {...props} />
    </LazyBlockWrapper>
  ),
  PlanPageDraftBlock: (
    props: React.ComponentProps<typeof PlanPageDraftBlock>,
  ) => (
    <LazyBlockWrapper>
      <PlanPageDraftBlock {...props} />
    </LazyBlockWrapper>
  ),
  PlanPageReviewBlock: (
    props: React.ComponentProps<typeof PlanPageReviewBlock>,
  ) => (
    <LazyBlockWrapper>
      <PlanPageReviewBlock {...props} />
    </LazyBlockWrapper>
  ),
  CmsPageBuildBlock: (
    props: React.ComponentProps<typeof CmsPageBuildBlock>,
  ) => (
    <LazyBlockWrapper>
      <CmsPageBuildBlock {...props} />
    </LazyBlockWrapper>
  ),
  EpisodeTitleOptionsBlock: (
    props: React.ComponentProps<typeof EpisodeTitleOptionsBlock>,
  ) => (
    <LazyBlockWrapper>
      <EpisodeTitleOptionsBlock {...props} />
    </LazyBlockWrapper>
  ),
  MasterworkCheckupFindingBlock: (
    props: React.ComponentProps<typeof MasterworkCheckupFindingBlock>,
  ) => (
    <LazyBlockWrapper>
      <MasterworkCheckupFindingBlock {...props} />
    </LazyBlockWrapper>
  ),
  MasterworkResultBlock: (
    props: React.ComponentProps<typeof MasterworkResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <MasterworkResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  SerialObservationTimelineBlock: (
    props: React.ComponentProps<typeof SerialObservationTimelineBlock>,
  ) => (
    <LazyBlockWrapper>
      <SerialObservationTimelineBlock {...props} />
    </LazyBlockWrapper>
  ),
  CaseDisclosureBlock: (
    props: React.ComponentProps<typeof CaseDisclosureBlock>,
  ) => (
    <LazyBlockWrapper>
      <CaseDisclosureBlock {...props} />
    </LazyBlockWrapper>
  ),
  UnfoldingRulingBlock: (
    props: React.ComponentProps<typeof UnfoldingRulingBlock>,
  ) => (
    <LazyBlockWrapper>
      <UnfoldingRulingBlock {...props} />
    </LazyBlockWrapper>
  ),
  RefusalBlock: (props: React.ComponentProps<typeof RefusalBlock>) => (
    <LazyBlockWrapper>
      <RefusalBlock {...props} />
    </LazyBlockWrapper>
  ),
  IngestedSourcesBlock: (
    props: React.ComponentProps<typeof IngestedSourcesBlock>,
  ) => (
    <LazyBlockWrapper>
      <IngestedSourcesBlock {...props} />
    </LazyBlockWrapper>
  ),
  StudyNotesBlock: (props: React.ComponentProps<typeof StudyNotesBlock>) => (
    <LazyBlockWrapper>
      <StudyNotesBlock {...props} />
    </LazyBlockWrapper>
  ),
  LessonScriptsBlock: (
    props: React.ComponentProps<typeof LessonScriptsBlock>,
  ) => (
    <LazyBlockWrapper>
      <LessonScriptsBlock {...props} />
    </LazyBlockWrapper>
  ),
  StudyPackBlock: (props: React.ComponentProps<typeof StudyPackBlock>) => (
    <LazyBlockWrapper>
      <StudyPackBlock {...props} />
    </LazyBlockWrapper>
  ),
  AgentResultBlock: (props: React.ComponentProps<typeof AgentResultBlock>) => (
    <LazyBlockWrapper>
      <AgentResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  NodeOutcomeBlock: (props: React.ComponentProps<typeof NodeOutcomeBlock>) => (
    <LazyBlockWrapper>
      <NodeOutcomeBlock {...props} />
    </LazyBlockWrapper>
  ),
  RunResultBlock: (props: React.ComponentProps<typeof RunResultBlock>) => (
    <LazyBlockWrapper>
      <RunResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  MediaChaptersBlock: (
    props: React.ComponentProps<typeof MediaChaptersBlock>,
  ) => (
    <LazyBlockWrapper>
      <MediaChaptersBlock {...props} />
    </LazyBlockWrapper>
  ),
  GeneratedImageSetBlock: (
    props: React.ComponentProps<typeof GeneratedImageSetBlock>,
  ) => (
    <LazyBlockWrapper>
      <GeneratedImageSetBlock {...props} />
    </LazyBlockWrapper>
  ),
  GeneratedVideoSetBlock: (
    props: React.ComponentProps<typeof GeneratedVideoSetBlock>,
  ) => (
    <LazyBlockWrapper>
      <GeneratedVideoSetBlock {...props} />
    </LazyBlockWrapper>
  ),
  GeneratedAudioBlock: (
    props: React.ComponentProps<typeof GeneratedAudioBlock>,
  ) => (
    <LazyBlockWrapper>
      <GeneratedAudioBlock {...props} />
    </LazyBlockWrapper>
  ),
  PodcastEpisodeBlock: (
    props: React.ComponentProps<typeof PodcastEpisodeBlock>,
  ) => (
    <LazyBlockWrapper>
      <PodcastEpisodeBlock {...props} />
    </LazyBlockWrapper>
  ),
  MediaAssetBlock: (props: React.ComponentProps<typeof MediaAssetBlock>) => (
    <LazyBlockWrapper>
      <MediaAssetBlock {...props} />
    </LazyBlockWrapper>
  ),
  MemoryAidBlock: (props: React.ComponentProps<typeof MemoryAidBlock>) => (
    <LazyBlockWrapper>
      <MemoryAidBlock {...props} />
    </LazyBlockWrapper>
  ),
  MemoryHintBlock: (props: React.ComponentProps<typeof MemoryHintBlock>) => (
    <LazyBlockWrapper>
      <MemoryHintBlock {...props} />
    </LazyBlockWrapper>
  ),
  SeoPackageBlock: (props: React.ComponentProps<typeof SeoPackageBlock>) => (
    <LazyBlockWrapper>
      <SeoPackageBlock {...props} />
    </LazyBlockWrapper>
  ),
  // Scraper / web_page kind family (Scraper Kinds Run).
  ScrapedPageBlock: (
    props: React.ComponentProps<typeof ScrapedPageBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ScrapedPageBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ScraperBatchResultBlock: (
    props: React.ComponentProps<typeof ScraperBatchResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ScraperBatchResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ScraperCrawlResultBlock: (
    props: React.ComponentProps<typeof ScraperCrawlResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ScraperCrawlResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageLinkBlock: (props: React.ComponentProps<typeof PageLinkBlockImpl>) => (
    <LazyBlockWrapper>
      <PageLinkBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LinkBucketsBlock: (
    props: React.ComponentProps<typeof LinkBucketsBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LinkBucketsBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageImageBlock: (props: React.ComponentProps<typeof PageImageBlockImpl>) => (
    <LazyBlockWrapper>
      <PageImageBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageVideoBlock: (props: React.ComponentProps<typeof PageVideoBlockImpl>) => (
    <LazyBlockWrapper>
      <PageVideoBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageAudioBlock: (props: React.ComponentProps<typeof PageAudioBlockImpl>) => (
    <LazyBlockWrapper>
      <PageAudioBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageHeadingBlock: (
    props: React.ComponentProps<typeof PageHeadingBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PageHeadingBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageSectionBlock: (
    props: React.ComponentProps<typeof PageSectionBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PageSectionBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageListBlock: (props: React.ComponentProps<typeof PageListBlockImpl>) => (
    <LazyBlockWrapper>
      <PageListBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageBlockBlock: (props: React.ComponentProps<typeof PageBlockBlockImpl>) => (
    <LazyBlockWrapper>
      <PageBlockBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  CodeBlockKindBlock: (
    props: React.ComponentProps<typeof CodeBlockKindBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <CodeBlockKindBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  RedirectHopBlock: (
    props: React.ComponentProps<typeof RedirectHopBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <RedirectHopBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ContentFingerprintBlock: (
    props: React.ComponentProps<typeof ContentFingerprintBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ContentFingerprintBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageMetadataBlock: (
    props: React.ComponentProps<typeof PageMetadataBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PageMetadataBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageRemovalBlock: (
    props: React.ComponentProps<typeof PageRemovalBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PageRemovalBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PageCleaningReportBlock: (
    props: React.ComponentProps<typeof PageCleaningReportBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PageCleaningReportBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // Search kind family (Search Kinds Pilot).
  WebSearchResultsBlock: (
    props: React.ComponentProps<typeof WebSearchResultsBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <WebSearchResultsBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  WebResultBlock: (props: React.ComponentProps<typeof WebResultBlockImpl>) => (
    <LazyBlockWrapper>
      <WebResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  NewsResultBlock: (
    props: React.ComponentProps<typeof NewsResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <NewsResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  VideoResultBlock: (
    props: React.ComponentProps<typeof VideoResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <VideoResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  FaqItemBlock: (props: React.ComponentProps<typeof FaqItemBlockImpl>) => (
    <LazyBlockWrapper>
      <FaqItemBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  DiscussionResultBlock: (
    props: React.ComponentProps<typeof DiscussionResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <DiscussionResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LocalPlaceBlock: (
    props: React.ComponentProps<typeof LocalPlaceBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LocalPlaceBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  EntityCardBlock: (
    props: React.ComponentProps<typeof EntityCardBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <EntityCardBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  AiAnswerKindBlock: (
    props: React.ComponentProps<typeof AiAnswerKindBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <AiAnswerKindBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // Tabular kind family (Table Kinds Run): `data_table`, the system-wide
  // rows-and-columns primitive every other producer of rows nests.
  DataTableBlock: (props: React.ComponentProps<typeof DataTableBlockImpl>) => (
    <LazyBlockWrapper>
      <DataTableBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // Social-intelligence kind family (SI-07c).
  SocialPostBlock: (props: React.ComponentProps<typeof SocialPostBlockImpl>) => (
    <LazyBlockWrapper>
      <SocialPostBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SocialProfileBlock: (props: React.ComponentProps<typeof SocialProfileBlockImpl>) => (
    <LazyBlockWrapper>
      <SocialProfileBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PostTranscriptBlock: (props: React.ComponentProps<typeof PostTranscriptBlockImpl>) => (
    <LazyBlockWrapper>
      <PostTranscriptBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  OutlierRowBlock: (props: React.ComponentProps<typeof OutlierRowBlockImpl>) => (
    <LazyBlockWrapper>
      <OutlierRowBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  AdCreativeBlock: (props: React.ComponentProps<typeof AdCreativeBlockImpl>) => (
    <LazyBlockWrapper>
      <AdCreativeBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SwipeCollectionBlock: (props: React.ComponentProps<typeof SwipeCollectionBlockImpl>) => (
    <LazyBlockWrapper>
      <SwipeCollectionBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // Rank / SERP-landscape kind family (Rank Kinds Run).
  SeoRankSerpLandscapeBlock: (
    props: React.ComponentProps<typeof SeoRankSerpLandscapeBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <SeoRankSerpLandscapeBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SerpPlacementBlock: (
    props: React.ComponentProps<typeof SerpPlacementBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <SerpPlacementBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SeoRankReadingBlock: (
    props: React.ComponentProps<typeof SeoRankReadingBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <SeoRankReadingBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ProviderRunReceiptBlock: (
    props: React.ComponentProps<typeof ProviderRunReceiptBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ProviderRunReceiptBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SeoRankTargetBlock: (
    props: React.ComponentProps<typeof SeoRankTargetBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <SeoRankTargetBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SeoRankPortfolioBlock: (
    props: React.ComponentProps<typeof SeoRankPortfolioBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <SeoRankPortfolioBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  SeoRankTargetRemovalBlock: (
    props: React.ComponentProps<typeof SeoRankTargetRemovalBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <SeoRankTargetRemovalBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // Commerce intake-to-listing family — one canonical renderer per shape.
  IntakePhotoGroupingBlock: (
    props: React.ComponentProps<typeof IntakePhotoGroupingBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <IntakePhotoGroupingBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ItemVisionExtractionBlock: (
    props: React.ComponentProps<typeof ItemVisionExtractionBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ItemVisionExtractionBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LotDetectionBlock: (
    props: React.ComponentProps<typeof LotDetectionBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LotDetectionBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ProductResearchBlock: (
    props: React.ComponentProps<typeof ProductResearchBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ProductResearchBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ValueAssessmentBlock: (
    props: React.ComponentProps<typeof ValueAssessmentBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ValueAssessmentBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  MediaListRankingBlock: (
    props: React.ComponentProps<typeof MediaListRankingBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <MediaListRankingBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  MediaCandidateVerdictBlock: (
    props: React.ComponentProps<typeof MediaCandidateVerdictBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <MediaCandidateVerdictBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  AssetGradingBlock: (
    props: React.ComponentProps<typeof AssetGradingBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <AssetGradingBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  EnrichmentVerificationBlock: (
    props: React.ComponentProps<typeof EnrichmentVerificationBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <EnrichmentVerificationBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PricingProposalBlock: (
    props: React.ComponentProps<typeof PricingProposalBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PricingProposalBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ListingDraftBlock: (
    props: React.ComponentProps<typeof ListingDraftBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ListingDraftBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  ReviewVerdictBlock: (
    props: React.ComponentProps<typeof ReviewVerdictBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <ReviewVerdictBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PublishPreflightBlock: (
    props: React.ComponentProps<typeof PublishPreflightBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PublishPreflightBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // Lulu print lane family — quote, shipping levels, cover canvas, job, catalog
  // matches. One canonical renderer per shape.
  LuluPrintCostBlock: (
    props: React.ComponentProps<typeof LuluPrintCostBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LuluPrintCostBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LuluShippingOptionsBlock: (
    props: React.ComponentProps<typeof LuluShippingOptionsBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LuluShippingOptionsBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LuluCoverDimensionsBlock: (
    props: React.ComponentProps<typeof LuluCoverDimensionsBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LuluCoverDimensionsBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LuluPrintJobBlock: (
    props: React.ComponentProps<typeof LuluPrintJobBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LuluPrintJobBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  LuluPrintProductMatchesBlock: (
    props: React.ComponentProps<typeof LuluPrintProductMatchesBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <LuluPrintProductMatchesBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  // RAG retrieval + citation kind family (RAG Kinds Run).
  SourceRefBlock: (props: React.ComponentProps<typeof SourceRefBlockImpl>) => (
    <LazyBlockWrapper>
      <SourceRefBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  RetrievedChunkBlock: (
    props: React.ComponentProps<typeof RetrievedChunkBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <RetrievedChunkBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  RagSearchResultBlock: (
    props: React.ComponentProps<typeof RagSearchResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <RagSearchResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  RagCrossDocSearchResultBlock: (
    props: React.ComponentProps<typeof RagCrossDocSearchResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <RagCrossDocSearchResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  RagSynthesizeResultBlock: (
    props: React.ComponentProps<typeof RagSynthesizeResultBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <RagSynthesizeResultBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  RatingBlock: (props: React.ComponentProps<typeof RatingBlockImpl>) => (
    <LazyBlockWrapper>
      <RatingBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  OpeningHoursBlock: (
    props: React.ComponentProps<typeof OpeningHoursBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <OpeningHoursBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  PostalAddressBlock: (
    props: React.ComponentProps<typeof PostalAddressBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <PostalAddressBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  GeoCoordinatesBlock: (
    props: React.ComponentProps<typeof GeoCoordinatesBlockImpl>,
  ) => (
    <LazyBlockWrapper>
      <GeoCoordinatesBlockImpl {...props} />
    </LazyBlockWrapper>
  ),
  MultipleChoiceQuiz: (
    props: React.ComponentProps<typeof MultipleChoiceQuiz>,
  ) => (
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
  ResourceCollectionBlock: (
    props: React.ComponentProps<typeof ResourceCollectionBlock>,
  ) => (
    <LazyBlockWrapper>
      <ResourceCollectionBlock {...props} />
    </LazyBlockWrapper>
  ),
  ProgressTrackerBlock: (
    props: React.ComponentProps<typeof ProgressTrackerBlock>,
  ) => (
    <LazyBlockWrapper>
      <ProgressTrackerBlock {...props} />
    </LazyBlockWrapper>
  ),
  ComparisonTableBlock: (
    props: React.ComponentProps<typeof ComparisonTableBlock>,
  ) => (
    <LazyBlockWrapper>
      <ComparisonTableBlock {...props} />
    </LazyBlockWrapper>
  ),
  TroubleshootingBlock: (
    props: React.ComponentProps<typeof TroubleshootingBlock>,
  ) => (
    <LazyBlockWrapper>
      <TroubleshootingBlock {...props} />
    </LazyBlockWrapper>
  ),
  DecisionTreeBlock: (
    props: React.ComponentProps<typeof DecisionTreeBlock>,
  ) => (
    <LazyBlockWrapper>
      <DecisionTreeBlock {...props} />
    </LazyBlockWrapper>
  ),
  ItemPresentationBlock: (
    props: React.ComponentProps<typeof ItemPresentationBlock>,
  ) => (
    <LazyBlockWrapper>
      <ItemPresentationBlock {...props} />
    </LazyBlockWrapper>
  ),
  MatrxEnvelopeBlock: (
    props: React.ComponentProps<typeof MatrxEnvelopeBlock>,
  ) => (
    <LazyBlockWrapper>
      <MatrxEnvelopeBlock {...props} />
    </LazyBlockWrapper>
  ),
  SchemaProposalBlock: (
    props: React.ComponentProps<typeof SchemaProposalBlock>,
  ) => (
    <LazyBlockWrapper>
      <SchemaProposalBlock {...props} />
    </LazyBlockWrapper>
  ),
  MathProblemBlock: (props: React.ComponentProps<typeof MathProblemBlock>) => (
    <LazyBlockWrapper>
      <MathProblemBlock {...props} />
    </LazyBlockWrapper>
  ),
  QuestionnaireRenderer: (
    props: React.ComponentProps<typeof QuestionnaireRenderer>,
  ) => (
    <LazyBlockWrapper>
      <QuestionnaireProvider>
        <QuestionnaireRenderer {...props} />
      </QuestionnaireProvider>
    </LazyBlockWrapper>
  ),
  InlineDecisionBlock: (
    props: React.ComponentProps<typeof InlineDecisionBlock>,
  ) => (
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
  EditorCodeSnippetBlock: (
    props: React.ComponentProps<typeof EditorCodeSnippetBlock>,
  ) => (
    <LazyBlockWrapper>
      <EditorCodeSnippetBlock {...props} />
    </LazyBlockWrapper>
  ),
  AudioCitationBlock: (
    props: React.ComponentProps<typeof AudioCitationBlock>,
  ) => (
    <LazyBlockWrapper>
      <AudioCitationBlock {...props} />
    </LazyBlockWrapper>
  ),
  AudioOutputBlock: (props: React.ComponentProps<typeof AudioOutputBlock>) => (
    <LazyBlockWrapper>
      <AudioOutputBlock {...props} />
    </LazyBlockWrapper>
  ),
  ImageOutputBlock: (
    props: React.ComponentProps<typeof UnifiedImageBlockRenderer>,
  ) => (
    <LazyBlockWrapper>
      <UnifiedImageBlockRenderer {...props} />
    </LazyBlockWrapper>
  ),
  SearchResultsBlock: (
    props: React.ComponentProps<typeof SearchResultsBlock>,
  ) => (
    <LazyBlockWrapper>
      <SearchResultsBlock {...props} />
    </LazyBlockWrapper>
  ),
  SearchErrorBlock: (props: React.ComponentProps<typeof SearchErrorBlock>) => (
    <LazyBlockWrapper>
      <SearchErrorBlock {...props} />
    </LazyBlockWrapper>
  ),
  FunctionResultBlock: (
    props: React.ComponentProps<typeof FunctionResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <FunctionResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  WorkflowStepBlock: (
    props: React.ComponentProps<typeof WorkflowStepBlock>,
  ) => (
    <LazyBlockWrapper>
      <WorkflowStepBlock {...props} />
    </LazyBlockWrapper>
  ),
  CategorizationResultBlock: (
    props: React.ComponentProps<typeof CategorizationResultBlock>,
  ) => (
    <LazyBlockWrapper>
      <CategorizationResultBlock {...props} />
    </LazyBlockWrapper>
  ),
  FetchResultsBlock: (
    props: React.ComponentProps<typeof FetchResultsBlock>,
  ) => (
    <LazyBlockWrapper>
      <FetchResultsBlock {...props} />
    </LazyBlockWrapper>
  ),
  PodcastCompleteBlock: (
    props: React.ComponentProps<typeof PodcastCompleteBlockLazy>,
  ) => (
    <LazyBlockWrapper>
      <PodcastCompleteBlockLazy {...props} />
    </LazyBlockWrapper>
  ),
  PodcastStageBlock: (
    props: React.ComponentProps<typeof PodcastStageBlockLazy>,
  ) => (
    <LazyBlockWrapper>
      <PodcastStageBlockLazy {...props} />
    </LazyBlockWrapper>
  ),
  ScrapeBatchCompleteBlock: (
    props: React.ComponentProps<typeof ScrapeBatchCompleteBlock>,
  ) => (
    <LazyBlockWrapper>
      <ScrapeBatchCompleteBlock {...props} />
    </LazyBlockWrapper>
  ),
  StructuredInputWarningBlock: (
    props: React.ComponentProps<typeof StructuredInputWarningBlock>,
  ) => (
    <LazyBlockWrapper>
      <StructuredInputWarningBlock {...props} />
    </LazyBlockWrapper>
  ),
  DisplayQuestionnaireBlock: (
    props: React.ComponentProps<typeof DisplayQuestionnaireBlock>,
  ) => (
    <LazyBlockWrapper>
      <DisplayQuestionnaireBlock {...props} />
    </LazyBlockWrapper>
  ),
  UnknownDataEventBlock: (
    props: React.ComponentProps<typeof UnknownDataEventBlock>,
  ) => (
    <LazyBlockWrapper>
      <UnknownDataEventBlock {...props} />
    </LazyBlockWrapper>
  ),
  ValueStoreStoredBlock: (
    props: React.ComponentProps<typeof ValueStoreStoredBlock>,
  ) => (
    <LazyBlockWrapper>
      <ValueStoreStoredBlock {...props} />
    </LazyBlockWrapper>
  ),
  DirectiveReceiptBlock: (
    props: React.ComponentProps<typeof DirectiveReceiptBlock>,
  ) => (
    <LazyBlockWrapper>
      <DirectiveReceiptBlock {...props} />
    </LazyBlockWrapper>
  ),
  ContextGroomedBlock: (
    props: React.ComponentProps<typeof ContextGroomedBlock>,
  ) => (
    <LazyBlockWrapper>
      <ContextGroomedBlock {...props} />
    </LazyBlockWrapper>
  ),
};

/**
 * Export wrapped loading visualization components
 */
const DOMAIN_LOADING_COMPONENTS = {
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
  MathProblemLoading: () => (
    <LazyBlockWrapper>
      <MathProblemLoadingVisualization />
    </LazyBlockWrapper>
  ),
};

/**
 * matrx-frontend's block components (domain kinds, app previews, file and media blocks) — the
 * engine's generic set ships in @ai-matrx/rich-content; these register into its registry at load.
 */
registerBlockComponents(DOMAIN_BLOCK_COMPONENTS);
registerLoadingComponents(DOMAIN_LOADING_COMPONENTS);

/** The engine's registry, typed with this app's own components (for this app's dispatch entries). */
export const BlockComponents = EngineBlockComponents as typeof EngineBlockComponents & typeof DOMAIN_BLOCK_COMPONENTS;
