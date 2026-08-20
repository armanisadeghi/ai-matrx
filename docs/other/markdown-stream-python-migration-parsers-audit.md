# MarkdownStream Processing Pipeline — Parser Audit for Python Migration

> **HISTORICAL — `matrxBroker` no longer exists (deleted 2026-08-20, Arman's ruling).**
> The `<<<MATRX_START>>>…<<<MATRX_END>>>` encoding, the `matrxBroker` block type, its
> parser/model/renderer, and the `broker` stream event were all removed from every repo.
> Every mention of them below describes the system as it WAS; do not build against it.
> Current protocol: `docs/protocol/MATRX_ENVELOPE.md`.

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

**Target state:** Python sends pre-processed blocks. UI receives `{ type, data }` and renders directly.

---

## 2. Entry Points

| File | Role |
|------|------|
| `components/MarkdownStream.tsx` | Top-level wrapper, passes `content` or `events` |
| `components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx` | Accumulates `chunk` events → `processedContent`; extracts tool blocks via `buildCanonicalBlocks` |
| `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` | Calls `splitContentIntoBlocksV2`, consolidates reasoning blocks, renders via `BlockRenderer` |
| `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` | **Primary block splitter** — detects and extracts all block types |
| `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` | Routes each block to the correct component; invokes per-block parsers |

---

## 3. Parsers Used in MarkdownStream Flow

### 3.1 Layer 1: Content Splitter (content-splitter-v2.ts)

**File:** `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts`

| Logic | Purpose | Input → Output |
|-------|---------|----------------|
| `getMetadataFromText` | MATRX broker blocks | `<<<MATRX_START>>>...<<<MATRX_END>>>` → `MatrxMetadata[]` |
| `MATRX_PATTERN` | Detect MATRX blocks | Regex match |
| `detectCodeBlock` / `extractCodeBlock` | Code blocks | ` ```lang\n...\n``` ` → `{ content, language }` |
| `detectJsonBlockType` | JSON block type | First JSON key → `quiz` \| `presentation` \| `decision_tree` \| `comparison_table` \| `diagram` \| `math_problem` |
| `validateJsonBlock` | JSON completeness | Raw string → `{ isComplete, shouldShow }` |
| `containsPlaceholderText` | Reject schema placeholders | Rejects `[array of...]` etc. |
| `detectXmlBlockType` | XML tag blocks | Line match → `thinking` \| `reasoning` \| `questionnaire` \| `flashcards` \| etc. |
| `extractXmlBlock` | Extract XML content | Lines → `{ content, metadata }` |
| `validateQuestionnaireStreaming` | Questionnaire streaming | Partial content → complete questions |
| `validateFlashcardStreaming` | Flashcards streaming | Partial content → complete cards |
| `validateRecipeStreaming` | Recipe streaming | Partial content → `{ hasTitle, hasIngredients, hasInstructions }` |
| `detectTableRow` / `extractTable` | Markdown tables | `\|...\|` lines → `{ content, metadata }` |
| `analyzeTableCompletion` | Table streaming | Rows → `{ isComplete, completeRowCount, hasPartialContent }` |
| `detectImageMarkdown` | Images | `![alt](url)` → `{ src, alt }` |
| `detectVideoMarkdown` | Videos | `[Video URL: ...]` → `{ src, alt }` |
| `removeMatrxPattern` | Strip MATRX from lines | Line → cleaned line |

**Dependencies:**
- `@/features/rich-text-editor/utils/patternUtils` — `getMetadataFromText`, `MATRX_PATTERN`, `MatrxMetadata`

---

### 3.2 Layer 2: BlockRenderer + Per-Block Parsers

**File:** `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx`

| Block Type | Parser | Parser File | Input → Output |
|------------|--------|-------------|----------------|
| `questionnaire` | `separatedMarkdownParser` | `markdown-classification/processors/custom/parser-separated.ts` | Markdown → `ParsedContent` (sections, items, tables, codeBlocks, jsonBlocks) |
| `cooking_recipe` | `parseRecipeMarkdown` | `blocks/cooking-recipes/parseRecipeMarkdown.ts` | Markdown → `RecipeData` |
| `timeline` | `parseTimelineMarkdown` | `blocks/timeline/parseTimelineMarkdown.ts` | Markdown → `TimelineData` |
| `research` | `parseResearchMarkdown` | `blocks/research/parseResearchMarkdown.ts` | Markdown → Research structure |
| `resources` | `parseResourcesMarkdown` | `blocks/resources/parseResourcesMarkdown.ts` | Markdown → Resources structure |
| `progress_tracker` | `parseProgressMarkdown` | `blocks/progress/parseProgressMarkdown.ts` | Markdown → Progress structure |
| `comparison_table` | `parseComparisonJSON` | `blocks/comparison/parseComparisonJSON.ts` | JSON string → Comparison structure |
| `troubleshooting` | `parseTroubleshootingMarkdown` | `blocks/troubleshooting/parseTroubleshootingMarkdown.ts` | Markdown → Troubleshooting structure |
| `decision_tree` | `parseDecisionTreeJSON` | `blocks/decision-tree/parseDecisionTreeJSON.ts` | JSON string → Decision tree structure |
| `diagram` | `parseDiagramJSON` | `blocks/diagram/parseDiagramJSON.ts` | JSON string → Diagram structure |
| `quiz` | `safeJsonParse` | `block-registry/json-parse-utils.ts` | JSON string → Raw quiz object |
| `presentation` | `safeJsonParse` | (same) | JSON string → Presentation object |
| `math_problem` | `safeJsonParse` | (same) | JSON string → Math problem object |

**Blocks with parsers inside the block component (not in BlockRenderer):**

| Block Type | Parser | Parser File | Used By |
|------------|--------|-------------|---------|
| `flashcards` | `parseFlashcards` | `blocks/flashcards/flashcard-parser.ts` | `FlashcardsBlock.tsx` |
| `tasks` | `parseMarkdownChecklist` | `blocks/tasks/tasklist-parser.tsx` | `TaskChecklist.tsx` |
| `transcript` | `parseTranscriptContent` | `blocks/transcripts/transcript-parser.ts` | `TranscriptBlock.tsx`, `AdvancedTranscriptViewer.tsx` |

---

### 3.3 Layer 3: Block-Internal Parsing

| Component | Parser / Logic | Purpose |
|-----------|---------------|---------|
| `StreamingTableRenderer` | Inline `parseRow` | Split `\|`-delimited cells; normalize headers |
| `StreamingDiffBlock` | `detectDiffStyle`, `getDiffStyleHandler` | Detect SEARCH/REPLACE vs unified diff; parse search/replace content |
| `MultipleChoiceQuiz` | `parseQuizJSON` | Raw JSON → `QuizData` (questions, contentHash) |
| `BasicMarkdownContent` | `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` | Render markdown for text blocks |

---

### 3.4 Supporting Parsers (Used by Block Parsers)

| Parser | File | Used By |
|--------|------|---------|
| `parseMarkdownTable` | `markdown-classification/processors/bock-processors/parse-markdown-table.ts` | `parser-separated.ts` (questionnaire) |

---

## 4. Parser Map (Quick Reference)

```
content-splitter-v2.ts
├── patternUtils (getMetadataFromText, MATRX_PATTERN)
├── Code block detection/extraction
├── JSON block detection (quiz, presentation, decision_tree, comparison_table, diagram, math_problem)
├── XML block detection (thinking, reasoning, questionnaire, flashcards, cooking_recipe, timeline, etc.)
├── Table detection/extraction/streaming
├── Image/Video markdown detection
└── Text accumulation

BlockRenderer
├── questionnaire     → separatedMarkdownParser (→ parseMarkdownTable)
├── cooking_recipe    → parseRecipeMarkdown
├── timeline          → parseTimelineMarkdown
├── research          → parseResearchMarkdown
├── resources         → parseResourcesMarkdown
├── progress_tracker  → parseProgressMarkdown
├── comparison_table  → parseComparisonJSON
├── troubleshooting  → parseTroubleshootingMarkdown
├── decision_tree     → parseDecisionTreeJSON
├── diagram           → parseDiagramJSON
├── quiz              → safeJsonParse → MultipleChoiceQuiz (parseQuizJSON)
├── presentation      → safeJsonParse
├── math_problem      → safeJsonParse
├── transcript        → (no BlockRenderer parser; block uses parseTranscriptContent)
├── tasks             → (no BlockRenderer parser; TaskChecklist uses parseMarkdownChecklist)
├── flashcards        → (no BlockRenderer parser; FlashcardsBlock uses parseFlashcards)
├── table             → StreamingTableRenderer (inline parseRow)
├── code (diff)       → looksLikeDiff → StreamingDiffBlock (detectDiffStyle, getDiffStyleHandler)
└── text, thinking, reasoning, image, video, matrxBroker → no extra parsing
```

---

## 5. Parsers NOT in MarkdownStream Flow (Excluded)

| Parser / File | Used By | Reason Excluded |
|---------------|---------|-----------------|
| `content-splitter.ts` (V1) | Legacy rollback only | V2 is production; `useV2Parser` defaults true |
| `parseMarkdownToAst` | `usePrepareMarkdownForRendering`, `MarkdownClassifier` | Admin / AST viewer, not MarkdownStream |
| `enhancedMarkdownParser` | `EnhancedMarkdownRenderer`, `parser-options` | Older renderer, not in MarkdownStream path |
| `parseMarkdownSimple` | `parser-options`, `EnhancedMarkdownRenderer` | Same |
| `parseMarkdownProfile` | `candidate-profiles` | Different feature |
| `parseResearchMarkdownOld`, `parseResearchMarkdownNew` | (unused or alternate) | Only `parseResearchMarkdown` is imported by BlockRenderer |

---

## 6. Current Stream Contract (Python → Client)

**File:** `types/python-generated/stream-events.ts`

| Event | Payload | Current Use |
|-------|---------|-------------|
| `chunk` | `{ text: string }` | Accumulated into content; then split + parsed client-side |
| `tool_event` | `ToolEventPayload` | `buildCanonicalBlocks` → ToolCallVisualization |
| `status_update` | `StatusUpdatePayload` | Status UI |
| `completion` | `CompletionPayload` | Stream end |
| `error` | `ErrorPayload` | Error UI |
| `data` | `DataPayload` | Freeform |
| `broker`, `heartbeat`, `end` | — | Misc |

**Gap:** `chunk` carries raw text. All block detection, extraction, validation, and per-block parsing happen client-side.

---

## 7. Target Stream Contract (Proposed)

Python should emit **processed blocks** instead of (or in addition to) raw text chunks.

**Option A: New event type `block`**
```json
{ "event": "block", "data": { "type": "flashcards", "data": { "flashcards": [...], "isComplete": true } } }
```

**Option B: Structured `chunk`**
```json
{ "event": "chunk", "data": { "blocks": [{ "type": "text", "content": "..." }, { "type": "flashcards", "data": {...} }] } }
```

**Option C: Replace `chunk` with `content_block`**
Each chunk is a complete block; no client-side splitting.

---

## 8. Migration Strategy (High Level)

1. **Implement Python equivalents** of each parser in this document.
2. **Run block detection + extraction** in Python as text streams in.
3. **Run per-block parsing** in Python before emitting.
4. **Emit blocks** in final format (e.g. `{ type, data }`).
5. **Simplify client** to:
   - Accumulate / order blocks from stream
   - Map `block.type` → component
   - Pass `block.data` directly to component (no parsing)

---

## 9. Parser Count Summary

| Category | Count | Files |
|----------|-------|-------|
| Content splitter logic | ~15 functions | `content-splitter-v2.ts`, `patternUtils.ts` |
| Block-level parsers | 13 | questionnaire, recipe, timeline, research, resources, progress, comparison, troubleshooting, decision_tree, diagram, quiz, presentation, math |
| Component-internal parsers | 4 | flashcards, tasks, transcript, quiz (parseQuizJSON) |
| Supporting | 2 | parseMarkdownTable, diff-style-registry |
| **Total distinct parsers** | **~20** | See map above |

---

## 10. Next Steps

1. Prioritize blocks by usage/frequency.
2. Define Python block schema (Pydantic models) for each type.
3. Port `content-splitter-v2` logic to Python (block detection + extraction).
4. Port each per-block parser to Python.
5. Design new stream event format and backward compatibility.
6. Update client `BlockRenderer` to consume pre-processed blocks.
7. Remove or stub client-side parsers after validation.
