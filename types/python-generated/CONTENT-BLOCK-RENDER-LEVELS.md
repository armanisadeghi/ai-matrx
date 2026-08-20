# Content block render levels

**Location:** `types/python-generated/` (alongside `stream-events.ts`)  
**Purpose:** Track every UI block type handled in chat/markdown rendering and how far a payload gets before structural parsing or failure—assuming the server emits a block with this `type` (possibly with incomplete or loosely typed `data`).

## Level definitions

| Level | Meaning |
|-------|--------|
| **1** | The block is not yet a first-class `ContentBlock` for `BlockRenderer`: something **before** `BlockRenderer` must run (markdown splitting, fence/JSON detection, DB normalization, merging `serverProcessedBlocks` into the block list, etc.). If only raw assistant text exists, this type does not exist as its own block yet. |
| **2** | The block **reaches** `BlockRenderer` (`components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx`), but **structure** is still recovered by parsing or interpreting **`content`**, or by **ad hoc** reads of `serverData` (`Record` / casts / optional chaining). Internal components often run their own parsers (`parseTranscriptContent`, `parseMarkdownChecklist`, `parseTreeLines`, `safeJsonParse`, lazy `parse*` imports, `looksLikeDiff`, etc.). |
| **3** | **Goal:** A typed discriminant (`type`) plus **`data` / `serverData`** matching a concrete model; the leaf component renders **without** structural parsing of `content`. `content` may be absent, optional, or display-only (e.g. raw fallback). *Almost nothing is here end-to-end today.* |

**Note:** For assistant **markdown** messages, many block types **also** depend on **Level 1** upstream (`splitContentIntoBlocksV2` in `content-splitter-v2.ts`). The **Level** column below is the **dominant bottleneck after the block exists**: **2** = still parsing inside renderer/child; **3** = typed data path (target).

**Merge point for stream/DB `data` → UI:** `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` maps `sb.data` → `serverData` on each block.

---

## Status table (every `BlockRenderer` case)

Sorted alphabetically by `block.type`.

| `block.type` | Level | Notes |
|--------------|-------|--------|
| `accent-divider` | 2 | Trivial `content`; no typed `data` model in `stream-events` for this UI affordance. |
| `artifact` | 2 | `ArtifactBlock` uses `content` + metadata; may parse JSON by artifact kind; `ArtifactContentBlock.data` is still `Record<string, unknown>` in types. |
| `audio_output` | 2 | Reaches renderer via `serverData` fields (`url`, `mime_type`); typed payloads exist under `TypedDataPayload`, not as a `TypedContentBlock`. |
| `categorization_result` | 2 | BlockRenderer maps `serverData` keys to props; no shared `TypedContentBlock` variant. |
| `code` | 2 | Structure from `content` + `language`; `looksLikeDiff`, language branches; `CodeBlockData` not used as single source of truth. |
| `comparison_table` | 2 | Server `serverData` path **or** `parseComparisonJSON` / `safeJsonParse` on `content` in renderer. |
| `consolidated_reasoning` | 2 | Uses `content` / `metadata.reasoningTexts`; `ConsolidatedReasoningBlockData` not driving render alone. |
| `cooking_recipe` | 2 | Server `serverData` **or** lazy `parseRecipeMarkdown` on `content`. |
| `database` | 2 | Routed with `info`/`task`/… to `renderBasicMarkdown(content)`; `data` is `TextBlockData` (`{}`). |
| `decision` | 2 | `serverData` / `metadata.decision` **or** inline XML / loading UI from `content` + metadata. |
| `decision_tree` | 2 | Server `serverData` **or** `parseDecisionTreeJSON` on `content`. |
| `diagram` | 2 | Server `serverData` **or** `parseDiagramJSON` on `content`. |
| `display_questionnaire` | 2 | BlockRenderer maps `serverData`; aligns with `QuestionnaireDisplayData` in `stream-events` (separate from questionnaire fence block). |
| `event` | 2 | Same as `text`/`info` basic markdown path. |
| `fetch_results` | 2 | Maps `serverData` to child; not in `TypedContentBlock` union. |
| `flashcards` | 2 | `serverData` **or** client parsing inside `FlashcardsBlock` from `content`. |
| `function_result` | 2 | Maps `serverData` to `FunctionResultBlock`. |
| `heavy-divider` | 2 | Trivial `content`; no typed `data` model. |
| `thinking` | 2 | Same path as `reasoning`: reasoning UI from `content` string. |
| `image` | 2 | Uses `src` / `alt` on block (and optionally `serverData` in merge path); not rendering from `ImageBlockData` only. |
| `image_output` | 2 | Same pattern as `audio_output` (`TypedDataPayload`). |
| `info` | 2 | `renderBasicMarkdown(content)`; `TextBlockData` is `{}`. |
| `math_problem` | 2 | `serverData` **or** `safeJsonParse` expecting `math_problem` wrapper in `content`. |
| `plan` | 2 | Basic markdown; `TextBlockData` is `{}`. |
| `podcast_complete` | 2 | `serverData` mapping. |
| `podcast_stage` | 2 | `serverData` mapping. |
| `presentation` | 2 | `serverData.slides` / theme **or** `safeJsonParse` nested `presentation` in `content`. |
| `private` | 2 | Basic markdown; `TextBlockData` is `{}`. |
| `progress_tracker` | 2 | `serverData` **or** `parseProgressMarkdown` on `content`. |
| `questionnaire` | 2 | `serverData` **or** lazy `separatedMarkdownParser` on `content`. |
| `quiz` | 2 | `serverData` **or** `safeJsonParse` + snake_case normalization on `content`. |
| `reasoning` | 2 | Reasoning UI from `content` string. |
| `research` | 2 | `serverData` **or** `parseResearchMarkdown` on `content`. |
| `resources` | 2 | `serverData` **or** `parseResourcesMarkdown` on `content`. |
| `scrape_batch_complete` | 2 | `serverData` mapping. |
| `search_error` | 2 | `serverData` mapping. |
| `search_replace` | 2 | `SearchReplaceBlock`: typed `SearchReplaceBlockData` when `serverData` complete; **or** raw `content` diff path—still not a `TypedContentBlock`. |
| `search_results` | 2 | `serverData` mapping. |
| `structured_info` | 2 | **Only** `content` passed to `StructuredPlanBlock` (markdown); `StructuredInfoContentBlock.data` is `Record<string, unknown>`. |
| `structured_input_warning` | 2 | `serverData` mapping. |
| `table` | 2 | `StreamingTableRenderer` consumes markdown `content`; `TableBlockData` not sole source. |
| `task` | 2 | Basic markdown; `TextBlockData` is `{}`. |
| `tasks` | 2 | `TasksBlock` → `parseMarkdownChecklist(content)`; `TasksBlockData` not wired as only input. |
| `text` | 2 | `renderBasicMarkdown(content)`. |
| `timeline` | 2 | `serverData` **or** `parseTimelineMarkdown` on `content`. |
| `tool` | 2 | Basic markdown; `TextBlockData` is `{}`. |
| `transcript` | 2 | `TranscriptBlock` → `parseTranscriptContent(content)`; `TranscriptBlockData` not wired as only input. |
| `tree` | 2 | `TreeBlock` → `parseTreeLines(content)` on ASCII tree text. |
| `troubleshooting` | 2 | `serverData` **or** `parseTroubleshootingMarkdown` on `content`. |
| `unknown_data_event` | 2 | Fallback dump of `serverData`; inherently untyped. |
| `video` | 2 | Same idea as `image`. |
| `video_output` | 2 | Same as `audio_output` / `image_output`. |
| `workflow_step` | 2 | `serverData` mapping; nested `data` field remains loosely typed in `WorkflowStepData`. |

---

## Types that may hit the default branch

These are **not** explicit `case`s in `BlockRenderer`. If they appear as `block.type`, they fall through to **`default`** → `renderBasicMarkdown(block.content)` when `content` is non-empty.

| `block.type` (examples) | Level | Notes |
|-------------------------|-------|--------|
| `file_output` | 2 | Produced by `normalize-content-blocks.ts` for legacy `media` rows; no dedicated branch. |
| `audio` (user attachment) | 2 | No `case`; default markdown path if present in block list. |
| `document`, `youtube_video`, `input_webpage`, `input_notes`, `input_task`, `input_table`, `input_list`, `input_data` | 2 | From `USER_INPUT_TYPES` in `normalize-content-blocks.ts`; no dedicated branches in `BlockRenderer`. |

(Add rows here when new `type` strings appear in the stream or DB.)

---

## Related files (for one-by-one upgrades)

| Stage | File |
|-------|------|
| Markdown → `ContentBlock[]` | `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` |
| Stream / DB block envelope | `types/python-generated/stream-events.ts` (`ContentBlockPayload`, `TypedContentBlock`, `TypedDataPayload`) |
| DB → payload normalization | `features/agents/redux/execution-system/utils/normalize-content-blocks.ts` |
| `data` → `serverData` on UI blocks | `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` |
| Switch / dispatch | `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` |

---

## Summary

- **Level 3 count (today):** **0** rich blocks with a strict end-to-end typed `data` path and zero structural parsing in the leaf component. Trivial blocks (dividers) are not “typed” in `stream-events` either.
- **Next step:** Pick a row, define or tighten `*BlockData` in `stream-events.ts`, have the server always populate `data`, and change `BlockRenderer` + the leaf component to **only** consume that model (then delete the corresponding parser import).

When you update a block, change its **Level** in this table to **3** and add a one-line note pointing to the interface name and the component that consumes it.
