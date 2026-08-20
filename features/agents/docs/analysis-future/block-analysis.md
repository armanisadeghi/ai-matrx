> **HISTORICAL — `matrxBroker` no longer exists (deleted 2026-08-20, Arman's ruling).**
> The `<<<MATRX_START>>>…<<<MATRX_END>>>` encoding, the `matrxBroker` block type, its
> parser/model/renderer, and the `broker` stream event were all removed from every repo.
> Every mention of them below describes the system as it WAS; do not build against it.
> Current protocol: `docs/protocol/MATRX_ENVELOPE.md`.

Now I have a complete picture. Here's the full analysis:

---

## 1. The `ContentBlock` Interface (client-side parsed block type)

```31:68:components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts
export interface ContentBlock {
  type:
    | "text"
    | "code"
    | "table"
    | "thinking"
    | "reasoning"
    | "consolidated_reasoning"
    | "image"
    | "video"
    | "tasks"
    | "transcript"
    | "structured_info"
    | "matrxBroker"
    | "questionnaire"
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
    | "math_problem"
    | "decision"
    | "artifact"
    | "tree"
    | string;
  content: string;
  language?: string;
  src?: string;
  alt?: string;
  metadata?: any;
}
```

Key point: the `| string` at the end makes this an open union — any string is valid, which is how server-only types like `audio_output`, `search_results`, etc. pass through without compile errors.

### How `splitContentIntoBlocksV2` Works

The main function starts at **line 1295**. It splits markdown text into lines, then iterates with a priority-ordered detection pipeline:

```1295:1296:components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts
export const splitContentIntoBlocksV2 = (mdContent: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
```

**Detection order** (lines 1305-1636):

1. **MATRX patterns** (line 1317) — proprietary `MATRX_PATTERN` regex for broker metadata
2. **Custom dividers** (line 1344) — `* * *` = `accent-divider`, `# ===` = `heavy-divider`
3. **Code blocks** (line 1364) — triple-backtick fences. After extraction, checks:
   - Special language names (`transcript`, `tasks`, `structured_info`, `questionnaire`, `flashcards`, `cooking_recipe`) → promoted to that block type
   - `json` language → checks `JSON_BLOCK_PATTERNS` for `quiz`, `presentation`, `decision_tree`, `comparison_table`, `diagram`, `math_problem`
   - Otherwise → `code` block
4. **Attribute-bearing XML** (line 1425) — `<decision prompt="...">`, `<artifact id="..." type="...">`
5. **Simple XML tag blocks** (line 1457) — `<thinking>`, `<reasoning>`, `<flashcards>`, `<questionnaire>`, `<cooking_recipe>`, `<timeline>`, `<progress_tracker>`, `<troubleshooting>`, `<resources>`, `<research>`, `<info>`, `<task>`, `<database>`, `<private>`, `<plan>`, `<event>`, `<tool>`
6. **Image markdown** (line 1482) — `![alt](url)` or `[Image URL: url]`
7. **Video markdown** (line 1500) — `[Video URL: url]`
8. **Table rows** (line 1520) — pipe-delimited `| ... | ... |`
9. **Mid-line attribute XML** (line 1551) — handles `<decision>` tags appearing mid-sentence
10. **Tree diagrams** (line 1599) — consecutive lines with box-drawing characters (├└│─ etc.)
11. **Text fallback** (line 1633) — everything else accumulates into `text` blocks

### Block Types Produced by the Splitter

- `text`, `code`, `table`, `image`, `video`
- `thinking`, `reasoning`
- `matrxBroker`
- `questionnaire`, `flashcards`, `cooking_recipe`
- `quiz`, `presentation`, `decision_tree`, `comparison_table`, `diagram`, `math_problem` (from JSON code blocks)
- `transcript`, `tasks`, `structured_info` (from special code fence languages)
- `timeline`, `progress_tracker`, `troubleshooting`, `resources`, `research` (from XML tags)
- `info`, `task`, `database`, `private`, `plan`, `event`, `tool` (from XML tags)
- `decision`, `artifact` (from attribute-bearing XML)
- `tree` (from box-drawing line detection)
- `accent-divider`, `heavy-divider` (from custom divider syntax)

---

## 2. Complete BlockRenderer Switch Statement — Every Case Label

Here are all case labels from `BlockRenderer.tsx` (lines 114-1228):

| Line | Case Label | Category |
|------|-----------|----------|
| 115 | `audio_output` | Server data event |
| 131-132 | `thinking` / `reasoning` | XML-parsed or server |
| 142 | `consolidated_reasoning` | Server |
| 151 | `image_output` | Server data event |
| 166 | `video_output` | Server data event |
| 181 | `search_results` | Server data event |
| 192 | `search_error` | Server data event |
| 203 | `function_result` | Server data event |
| 217 | `workflow_step` | Server data event |
| 229 | `categorization_result` | Server data event |
| 244 | `fetch_results` | Server data event |
| 255 | `podcast_complete` | Server data event |
| 268 | `podcast_stage` | Server data event |
| 281 | `scrape_batch_complete` | Server data event |
| 291 | `structured_input_warning` | Server data event |
| 302 | `display_questionnaire` | Server data event |
| 313 | `unknown_data_event` | Server data event |
| 324 | `image` | Client-parsed markdown |
| 333 | `video` | Client-parsed markdown |
| 342 | `code` | Client-parsed (with sub-dispatch for diff, yaml, xml, csv, toml, markdown, tree) |
| 451 | `table` | Client-parsed |
| 467 | `transcript` | Client-parsed |
| 472 | `tasks` | Client-parsed |
| 475 | `structured_info` | Client-parsed |
| 483 | `matrxBroker` | Client-parsed |
| 495 | `questionnaire` | Dual-path (serverData or client fallback) |
| 537 | `flashcards` | Dual-path |
| 564 | `quiz` | Dual-path |
| 623 | `presentation` | Dual-path |
| 682 | `cooking_recipe` | Dual-path |
| 724 | `timeline` | Dual-path |
| 769 | `research` | Dual-path |
| 814 | `resources` | Dual-path |
| 859 | `progress_tracker` | Dual-path |
| 904 | `comparison_table` | Dual-path |
| 951 | `troubleshooting` | Dual-path |
| 997 | `decision_tree` | Dual-path |
| 1044 | `diagram` | Dual-path |
| 1091 | `math_problem` | Dual-path |
| 1128 | `search_replace` | Dual-path |
| 1140 | `decision` | Dual-path |
| 1180 | `artifact` | Client or server |
| 1193 | `tree` | Client-parsed |
| 1202 | `accent-divider` | Client-parsed |
| 1209 | `heavy-divider` | Client-parsed |
| 1216-1223 | `text` / `info` / `task` / `database` / `private` / `plan` / `event` / `tool` | Client-parsed → basic markdown |
| 1226 | `default` | Fallback → basic markdown |

---

## 3. BlockComponentRegistry — Lazy-loaded Components

From `BlockComponentRegistry.tsx`, the `BlockComponents` export (lines 213-479) includes:

**Static:** `BasicMarkdownContent`

**Lazy-loaded (in Suspense wrappers):**
- `CodeBlock`, `ThinkingVisualization`, `ReasoningVisualization`, `ConsolidatedReasoningVisualization`
- `ImageBlock`, `VideoBlock`, `TranscriptBlock`, `TasksBlock`, `StructuredPlanBlock`
- `MatrxBrokerBlock`, `FlashcardsBlock`, `MultipleChoiceQuiz`, `Slideshow`, `RecipeViewer`
- `TimelineBlock`, `ResearchBlock`, `ResourceCollectionBlock`, `ProgressTrackerBlock`
- `ComparisonTableBlock`, `TroubleshootingBlock`, `DecisionTreeBlock`, `InteractiveDiagramBlock`
- `MathProblemBlock`, `QuestionnaireRenderer`, `MarkdownTable`, `StreamingTableRenderer`
- `StreamingDiffBlock`, `SearchReplaceBlock`, `InlineDecisionBlock`, `ArtifactBlock`
- `YamlBlock`, `XmlBlock`, `CsvBlock`, `TomlBlock`, `TreeBlock`, `MarkdownPreviewBlock`
- `AudioOutputBlock`, `ImageOutputBlock`, `VideoOutputBlock`
- `SearchResultsBlock`, `SearchErrorBlock`, `FunctionResultBlock`, `WorkflowStepBlock`
- `CategorizationResultBlock`, `FetchResultsBlock`, `PodcastCompleteBlock`, `PodcastStageBlock`
- `ScrapeBatchCompleteBlock`, `StructuredInputWarningBlock`, `DisplayQuestionnaireBlock`, `UnknownDataEventBlock`

**LoadingComponents (12):** QuizLoading, PresentationLoading, RecipeLoading, TimelineLoading, ResearchLoading, ResourcesLoading, ProgressLoading, ComparisonLoading, TroubleshootingLoading, DecisionTreeLoading, DiagramLoading, MathProblemLoading

---

## 4. How BlockRenderer Distinguishes the Three Block Origins

### A "text" block (parsed from markdown)

```1216:1224:components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx
    case "text":
    case "info":
    case "task":
    case "database":
    case "private":
    case "plan":
    case "event":
    case "tool":
      return block.content ? renderBasicMarkdown(block.content) : null;
```

These are produced by `splitContentIntoBlocksV2` from the raw markdown text. They have `block.content` (a markdown string), no `block.serverData`. They're rendered via `renderBasicMarkdown()` which delegates to `BlockComponents.BasicMarkdownContent`.

### A "flashcards" block from server content_block protocol

```537:562:components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx
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
```

This is the **dual-path** pattern used by most structured blocks. The decision tree is:
1. If `block.serverData` exists → pass structured data directly (Python already parsed it)
2. If `strictServerData` is on and serverData is absent → show error panel (Python bug)
3. Otherwise → fall back to passing `block.content` (raw markdown/XML) and letting the component parse client-side

### An "audio_output" from a data event promoted to content block

```115:129:components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx
    case "audio_output": {
      const audioUrl =
        (block.serverData?.url as string | undefined) ?? block.src;
      const audioMimeType =
        (block.serverData?.mime_type as string | undefined) ??
        (block.metadata?.mimeType as string | undefined);
      if (!audioUrl) return null;
      return (
        <BlockComponents.AudioOutputBlock
          key={index}
          url={audioUrl}
          mimeType={audioMimeType}
        />
      );
    }
```

Server data event blocks like `audio_output` come **exclusively** from the server content_block protocol — the client-side splitter never produces them. They always carry `block.serverData` with the structured payload (url, mime_type, etc.). The `?? block.src` fallback is for safety but the primary path reads from `serverData`.

---

## 5. BlockRenderingContext / BlockRenderingProvider — `strictServerData`

The complete file:

```1:39:components/mardown-display/chat-markdown/BlockRenderingContext.tsx
"use client";
import React, { createContext, useContext } from "react";

/**
 * Controls rendering behaviour for the block pipeline.
 *
 * strictServerData — when true, structured blocks (quiz, presentation, table, etc.)
 * will NOT fall back to client-side content parsing when block.serverData is null.
 * Instead they render a visible error panel so you immediately know Python failed to
 * populate the `data` field.
 *
 * Leave false (default) for production — the existing graceful fallback runs.
 * Set to true in any debug/testing UI to catch Python pipeline failures early.
 */
export interface BlockRenderingConfig {
    strictServerData: boolean;
}

const defaultConfig: BlockRenderingConfig = {
    strictServerData: false,
};

export const BlockRenderingContext = createContext<BlockRenderingConfig>(defaultConfig);

export const useBlockRenderingConfig = () => useContext(BlockRenderingContext);

// ... provider component
```

In `BlockRenderer.tsx` line 78:
```78:78:components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx
  const { strictServerData } = useBlockRenderingConfig();
```

When `strictServerData` is `true`, every dual-path block (flashcards, quiz, presentation, etc.) that arrives **without** `serverData` will show the `StrictModeError` component instead of falling back to client-side parsing. This is a debug/testing toggle — in production it defaults to `false` and the graceful client-side fallback runs.

---

## 6. The Conversion Layer: `ContentBlockPayload` → local `ContentBlock`

There are **two** conversion points:

### A. `EnhancedChatMarkdown.tsx` (line 302) — for the rendering pipeline

This is where `ContentBlockPayload` (server protocol) gets converted to the local `ContentBlock` shape that `BlockRenderer` consumes:

```302:313:components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx
      const supplementaryBlocks: ContentBlock[] = serverProcessedBlocks.map(
        (sb) => ({
          type: sb.type as ContentBlock["type"],
          content: sb.content ?? "",
          serverData: sb.data ?? undefined,
          metadata: sb.metadata,
          language: (sb.data as any)?.language,
          src: (sb.data as any)?.src,
          alt: (sb.data as any)?.alt,
        }),
      );
```

The mapping:
- `ContentBlockPayload.type` → `ContentBlock.type`
- `ContentBlockPayload.content` → `ContentBlock.content`
- **`ContentBlockPayload.data` → `ContentBlock.serverData`** (this is the key bridging field)
- `ContentBlockPayload.metadata` → `ContentBlock.metadata`
- Data sub-fields (`language`, `src`, `alt`) are extracted from `data` for compatibility

Note: `ContentBlock` doesn't have `serverData` in its interface — `BlockRenderer.tsx` extends it locally:

```11:13:components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx
interface BlockWithServerData extends ContentBlock {
  serverData?: Record<string, unknown>;
}
```

### B. `normalize-content-blocks.ts` — for the Redux/DB boundary

This normalizes raw DB-persisted blocks back into `ContentBlockPayload` shape so the streaming pipeline sees a consistent type:

```154:158:features/agents/redux/execution-system/utils/normalize-content-blocks.ts
export function normalizeContentBlocks(
  rawBlocks: Array<Record<string, unknown>>,
): ContentBlockPayload[] {
  return rawBlocks.map((block, i) => normalizeSingle(block, i));
}
```

It handles:
- Already-normalized blocks (pass through)
- Known stream-protocol types like `audio_output`, `search_results`, etc. (adds missing structural fields)
- Legacy DB shapes like `{ type: "media", kind: "audio" }` → converts to `audio_output`
- Text-field blocks (`thinking`, `reasoning`) — moves `text` → `content`
- User-input types (`image`, `audio`, `video`, `document`, etc.) — wraps in envelope
- Unknown blocks → wrapped as `unknown_data_event`

---

### Summary of the "Block" Terminology Collision

There are **three** distinct block types in the system:

| Type | Interface | Origin | Where Defined |
|------|-----------|--------|---------------|
| **ContentBlock** | `{ type, content, language?, src?, alt?, metadata? }` | Client-side markdown parser | `content-splitter-v2.ts:31` |
| **ContentBlockPayload** | `{ blockId, blockIndex, type, status, content?, data?, metadata? }` | Python streaming protocol / DB | `content-blocks.ts:62` |
| **BlockWithServerData** | `ContentBlock + { serverData? }` | Bridge for rendering | `BlockRenderer.tsx:11` |

The flow is: `ContentBlockPayload` (from stream/DB) → converted to `ContentBlock` with `serverData` attached (in `EnhancedChatMarkdown.tsx:302`) → rendered by `BlockRenderer` which checks `block.serverData` first, then falls back to `block.content` parsing.