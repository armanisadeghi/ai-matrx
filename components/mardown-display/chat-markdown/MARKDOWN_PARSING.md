# MarkdownStream Processing Pipeline — Parser Audit for Python Migration

> **Goal:** Move all markdown/block processing from client-side (UI) to Python backend. Stream **processed blocks** in final format so the UI does zero parsing—only detects block keys and renders.

---

## 1. Pipeline Overview

```
Python Backend                    Client (MarkdownStream)
─────────────────────────────────────────────────────────────────────────
Raw text chunks  ──stream──►  StreamAwareChatMarkdown
                                    │
                                    ├─ chunk events → accumulate text
                                    ├─ tool_event → buildCanonicalBlocks → ToolCallVisualization
                                    └─ content ──► EnhancedChatMarkdownInternal
                                                          │
                                                          └─ splitContentIntoBlocksV2(content)
                                                                     │
                                                                     └─ BlockRenderer(block)
                                                                                │
                                                                                └─ [per-block parsers]
                                                                                           │
                                                                                           └─ Block component (render)
```

**Current state:** All processing happens client-side. Every app (web, mobile, Vite, React) must run the same parsers.

**Target state:** Python sends pre-processed blocks. UI receives `{ type, data }` (or similar) and renders directly.


# Markdown Parsing Flow

Complete flow of markdown and block processing from stream input to rendered output. Each step includes the file location.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. ENTRY                                                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 2. STREAM ACCUMULATION & TOOL EXTRACTION                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 3. BLOCK SPLITTING (Content Splitter)                                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 4. REASONING CONSOLIDATION (post-process)                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 5. BLOCK RENDERING (per-block routing + parsing)                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 6. BLOCK COMPONENTS (final render)                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Entry

| Step | Description | File |
|------|-------------|------|
| Top-level wrapper | Receives `content` or `events`; wraps in error boundary | `components/MarkdownStream.tsx` |
| Stream event types | TypeScript types for chunk, tool_event, etc. | `types/python-generated/stream-events.ts` |
| NDJSON stream parser | Parses NDJSON from fetch response | `lib/api/stream-parser.ts` |

---

## 2. Stream Accumulation & Tool Extraction

| Step | Description | File |
|------|-------------|------|
| Stream-aware wrapper | Accumulates `chunk` events → `processedContent`; extracts tool blocks | `components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx` |
| Canonical blocks builder | Converts `StreamEvent[]` → `CanonicalBlock[]` (text + tool_call) | `lib/chat-protocol/from-stream.ts` |
| Tool visualization | Renders a `ToolCallBlock` by mapping it into `ToolLifecycleEntry` and handing it to the shell at `features/tool-call-visualization/components/ToolCallVisualization.tsx` |

---

## 3. Block Splitting (Content Splitter)

| Step | Description | File |
|------|-------------|------|
| **Primary block splitter** | Detects and extracts all block types from raw markdown | `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` |
| MATRX pattern utilities | `getMetadataFromText`, `MATRX_PATTERN` for broker blocks | `features/rich-text-editor/utils/patternUtils.ts` |

**Block types detected by splitter:**
- `matrxBroker` · `code` · `thinking` · `reasoning` · `questionnaire` · `flashcards` · `cooking_recipe` · `timeline` · `progress_tracker` · `troubleshooting` · `resources` · `research` · `quiz` · `presentation` · `decision_tree` · `comparison_table` · `diagram` · `math_problem` · `transcript` · `tasks` · `structured_info` · `table` · `image` · `video` · `audio` · `matrx_file` · `text`

> **`matrx_file`** — a plain markdown link (or bare URL) to one of OUR OWN files (signed S3 `matrx-user-files`, public `cdn.matrxserver.com`, Supabase public bucket, or a `/share/<token>` byte endpoint). Detected by `detectMatrxFileMarkdown` **after** image/video/audio so any of our media with a dedicated home wins first; recognition lives in the single, extendable `lib/media/our-file-sources.ts` (`recognizeOurFileUrl`). The renderer keeps the original line on `content`, re-derives the URL + surrounding text, discovers the real file type (sniffed from the URL or by hydrating the cld_files row), and renders the universal inline previewer — re-minting signed URLs via the file handler. On any failure it degrades to the plain link. Mirrored in the prefilter (`Candidate.MATRX_FILE`) and the stream accumulator. No DB round-trip change — `reconstructBlockMarkdown` default re-emits `content`.

---

## 4. Reasoning Consolidation

| Step | Description | File |
|------|-------------|------|
| Consecutive reasoning merge | Merges adjacent `reasoning` blocks into `consolidated_reasoning` when stream is complete | `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` |

---

## 5. Block Rendering (Routing + Parsing)

| Step | Description | File |
|------|-------------|------|
| Block router | Routes each block to the correct component; invokes per-block parsers | `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` |
| Block component registry | Lazy-loaded block components | `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` |
| JSON parse utilities | `safeJsonParse` for quiz, presentation, math_problem, etc. | `components/mardown-display/chat-markdown/block-registry/json-parse-utils.ts` |
| Diff style detection | `looksLikeDiff` for code blocks with diff content | `components/mardown-display/chat-markdown/diff-blocks/diff-style-registry.ts` |

### Parsers invoked by BlockRenderer

| Block Type | Parser | Parser File |
|------------|--------|-------------|
| `questionnaire` | `separatedMarkdownParser` | `components/mardown-display/markdown-classification/processors/custom/parser-separated.ts` |
| `cooking_recipe` | `parseRecipeMarkdown` | `components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown.ts` |
| `timeline` | `parseTimelineMarkdown` | `components/mardown-display/blocks/timeline/parseTimelineMarkdown.ts` |
| `research` | `parseResearchMarkdown` | `components/mardown-display/blocks/research/parseResearchMarkdown.ts` |
| `resources` | `parseResourcesMarkdown` | `components/mardown-display/blocks/resources/parseResourcesMarkdown.ts` |
| `progress_tracker` | `parseProgressMarkdown` | `components/mardown-display/blocks/progress/parseProgressMarkdown.ts` |
| `comparison_table` | `parseComparisonJSON` | `components/mardown-display/blocks/comparison/parseComparisonJSON.ts` |
| `troubleshooting` | `parseTroubleshootingMarkdown` | `components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown.ts` |
| `decision_tree` | `parseDecisionTreeJSON` | `components/mardown-display/blocks/decision-tree/parseDecisionTreeJSON.ts` |
| `diagram` | `parseDiagramJSON` | `components/mardown-display/blocks/diagram/parseDiagramJSON.ts` |

### Supporting parser (used by questionnaire)

| Parser | File |
|--------|------|
| `parseMarkdownTable` | `components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table.ts` |

---

## 6. Block Components (Final Render)

| Block Type | Component | File |
|------------|-----------|------|
| `text` · `info` · `task` · `plan` · etc. | BasicMarkdownContent | `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx` |
| `code` | CodeBlock | `features/code-editor/components/code-block/CodeBlock.tsx` |
| `code` (diff) | StreamingDiffBlock | `components/mardown-display/chat-markdown/diff-blocks/StreamingDiffBlock.tsx` |
| `table` | StreamingTableRenderer | `components/mardown-display/blocks/table/StreamingTableRenderer.tsx` |
| `thinking` | ThinkingVisualization | `components/mardown-display/blocks/thinking-reasoning/ThinkingVisualization.tsx` |
| `reasoning` | ReasoningVisualization | `components/mardown-display/blocks/thinking-reasoning/ReasoningVisualization.tsx` |
| `consolidated_reasoning` | ConsolidatedReasoningVisualization | `components/mardown-display/blocks/thinking-reasoning/ConsolidatedReasoningVisualization.tsx` |
| `image` | ImageBlock | `components/mardown-display/blocks/images/ImageBlock.tsx` |
| `video` | VideoBlock | `components/mardown-display/blocks/videos/VideoBlock.tsx` |
| `matrx_file` | MatrxFileBlock → UniversalInlineFile | `components/mardown-display/blocks/matrx-file/MatrxFileBlock.tsx` · `components/mardown-display/blocks/matrx-file/UniversalInlineFile.tsx` |
| `transcript` | TranscriptBlock | `components/mardown-display/blocks/transcripts/TranscriptBlock.tsx` |
| `tasks` | TasksBlock → TaskChecklist | `components/mardown-display/blocks/tasks/TasksBlock.tsx` · `components/mardown-display/blocks/tasks/TaskChecklist.tsx` |
| `structured_info` | StructuredPlanBlock | `components/mardown-display/blocks/plan/StructuredPlanBlock.tsx` |
| `matrxBroker` | MatrxBrokerBlock | `components/mardown-display/blocks/brokers/MatrxBrokerBlock.tsx` |
| `flashcards` | FlashcardsBlock | `components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx` |
| `quiz` | MultipleChoiceQuiz | `components/mardown-display/blocks/quiz/MultipleChoiceQuiz.tsx` |
| `presentation` | Slideshow | `components/mardown-display/blocks/presentations/Slideshow.tsx` |
| `cooking_recipe` | RecipeViewer | `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx` |
| `timeline` | TimelineBlock | `components/mardown-display/blocks/timeline/TimelineBlock.tsx` |
| `research` | ResearchBlock | `components/mardown-display/blocks/research/ResearchBlock.tsx` |
| `resources` | ResourceCollectionBlock | `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx` |
| `progress_tracker` | ProgressTrackerBlock | `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx` |
| `comparison_table` | ComparisonTableBlock | `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx` |
| `troubleshooting` | TroubleshootingBlock | `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx` |
| `decision_tree` | DecisionTreeBlock | `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx` |
| `diagram` | InteractiveDiagramBlock | `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx` |
| `math_problem` | MathProblemBlock | `components/mardown-display/blocks/math/MathProblemBlock.tsx` |
| `questionnaire` | QuestionnaireRenderer | `components/mardown-display/blocks/questionnaire/QuestionnaireRenderer.tsx` |

### Parsers inside block components (not in BlockRenderer)

| Block | Parser | Parser File | Component File |
|-------|--------|-------------|----------------|
| `flashcards` | `parseFlashcards` | `components/mardown-display/blocks/flashcards/flashcard-parser.ts` | `components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx` |
| `tasks` | `parseMarkdownChecklist` | `components/mardown-display/blocks/tasks/tasklist-parser.tsx` | `components/mardown-display/blocks/tasks/TaskChecklist.tsx` |
| `transcript` | `parseTranscriptContent` | `components/mardown-display/blocks/transcripts/transcript-parser.ts` | `TranscriptBlock.tsx` · `AdvancedTranscriptViewer.tsx` |
| `quiz` | `parseQuizJSON` | `components/mardown-display/blocks/quiz/quiz-parser.ts` | `components/mardown-display/blocks/quiz/MultipleChoiceQuiz.tsx` |

---

## File Index (Alphabetical)

| File | Role |
|------|------|
| `components/MarkdownStream.tsx` | Entry point |
| `components/mardown-display/blocks/brokers/MatrxBrokerBlock.tsx` | matrxBroker render |
| `components/mardown-display/blocks/comparison/ComparisonTableBlock.tsx` | comparison_table render |
| `components/mardown-display/blocks/comparison/parseComparisonJSON.ts` | comparison_table parser |
| `components/mardown-display/blocks/cooking-recipes/cookingRecipeDisplay.tsx` | cooking_recipe render |
| `components/mardown-display/blocks/cooking-recipes/parseRecipeMarkdown.ts` | cooking_recipe parser |
| `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx` | decision_tree render |
| `components/mardown-display/blocks/decision-tree/parseDecisionTreeJSON.ts` | decision_tree parser |
| `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx` | diagram render |
| `components/mardown-display/blocks/diagram/parseDiagramJSON.ts` | diagram parser |
| `components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx` | flashcards render |
| `components/mardown-display/blocks/flashcards/flashcard-parser.ts` | flashcards parser |
| `components/mardown-display/blocks/images/ImageBlock.tsx` | image render |
| `components/mardown-display/blocks/math/MathProblemBlock.tsx` | math_problem render |
| `components/mardown-display/blocks/plan/StructuredPlanBlock.tsx` | structured_info render |
| `components/mardown-display/blocks/presentations/Slideshow.tsx` | presentation render |
| `components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx` | progress_tracker render |
| `components/mardown-display/blocks/progress/parseProgressMarkdown.ts` | progress_tracker parser |
| `components/mardown-display/blocks/questionnaire/QuestionnaireRenderer.tsx` | questionnaire render |
| `components/mardown-display/blocks/quiz/MultipleChoiceQuiz.tsx` | quiz render |
| `components/mardown-display/blocks/quiz/quiz-parser.ts` | quiz parser (internal) |
| `components/mardown-display/blocks/research/ResearchBlock.tsx` | research render |
| `components/mardown-display/blocks/research/parseResearchMarkdown.ts` | research parser |
| `components/mardown-display/blocks/resources/ResourceCollectionBlock.tsx` | resources render |
| `components/mardown-display/blocks/resources/parseResourcesMarkdown.ts` | resources parser |
| `components/mardown-display/blocks/table/StreamingTableRenderer.tsx` | table render |
| `components/mardown-display/blocks/tasks/TaskChecklist.tsx` | tasks render |
| `components/mardown-display/blocks/tasks/TasksBlock.tsx` | tasks wrapper |
| `components/mardown-display/blocks/tasks/tasklist-parser.tsx` | tasks parser |
| `components/mardown-display/blocks/thinking-reasoning/ThinkingVisualization.tsx` | thinking render |
| `components/mardown-display/blocks/thinking-reasoning/ReasoningVisualization.tsx` | reasoning render |
| `components/mardown-display/blocks/thinking-reasoning/ConsolidatedReasoningVisualization.tsx` | consolidated_reasoning render |
| `components/mardown-display/blocks/timeline/TimelineBlock.tsx` | timeline render |
| `components/mardown-display/blocks/timeline/parseTimelineMarkdown.ts` | timeline parser |
| `components/mardown-display/blocks/transcripts/TranscriptBlock.tsx` | transcript render |
| `components/mardown-display/blocks/transcripts/AdvancedTranscriptViewer.tsx` | transcript viewer |
| `components/mardown-display/blocks/transcripts/transcript-parser.ts` | transcript parser |
| `components/mardown-display/blocks/troubleshooting/TroubleshootingBlock.tsx` | troubleshooting render |
| `components/mardown-display/blocks/troubleshooting/parseTroubleshootingMarkdown.ts` | troubleshooting parser |
| `components/mardown-display/blocks/videos/VideoBlock.tsx` | video render |
| `components/mardown-display/chat-markdown/BasicMarkdownContent.tsx` | text/markdown render |
| `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` | Block splitting + reasoning consolidation |
| `components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx` | Stream accumulation |
| `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` | Block component registry |
| `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` | Block routing + parsing |
| `components/mardown-display/chat-markdown/block-registry/json-parse-utils.ts` | JSON parse helpers |
| `components/mardown-display/chat-markdown/diff-blocks/StreamingDiffBlock.tsx` | diff code block render |
| `components/mardown-display/chat-markdown/diff-blocks/diff-style-registry.ts` | Diff style detection |
| `components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table.ts` | Table parser (questionnaire) |
| `components/mardown-display/markdown-classification/processors/custom/parser-separated.ts` | questionnaire parser |
| `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` | Primary block splitter |
| `features/chat/components/response/assistant-message/stream/ToolCallVisualization.tsx` | Tool call render |
| `features/code-editor/components/code-block/CodeBlock.tsx` | Code block render |
| `features/rich-text-editor/utils/patternUtils.ts` | MATRX pattern utilities |
| `lib/api/stream-parser.ts` | NDJSON stream parser |
| `lib/chat-protocol/from-stream.ts` | Canonical blocks builder |
| `lib/chat-protocol/index.ts` | Chat protocol exports |
| `types/python-generated/stream-events.ts` | Stream event types |
