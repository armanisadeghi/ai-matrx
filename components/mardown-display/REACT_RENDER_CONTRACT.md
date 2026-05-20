# React Render Contract — Block Streaming Protocol

> **This directory (`components/mardown-display/`) is the RICH DOCUMENT rendering engine** — the "basement" of the Rich Document system. It is NOT a thin markdown wrapper; it is the multi-thousand-line runtime that turns text + JSON into interactive components (flashcards, diagrams, task lists, tool-call traces, code, plans, …). The front door is `<RichDocument>` (`features/rich-document/RichDocument.tsx`), which wraps this engine and adds the action toolkit. See [`features/rich-document/FEATURE.md`](../../features/rich-document/FEATURE.md) and the `rich-document-actions` skill.

> This document is the **React team's counterpart** to `aidream/ai/processing/streaming-constitution.md`.
> It describes what Python guarantees, what React must handle, outstanding gaps, and the render pipeline.

---

## How Blocks Arrive at React

Python emits NDJSON events. Each line is either a regular stream event (`chunk`, `status_update`, etc.)
or a `content_block` event. React processes these in `StreamAwareChatMarkdown.tsx`.

### Regular events (TextChannel)

`chunk` events: `data.text` is appended to the accumulated `content` string, passed to
`EnhancedChatMarkdownInternal` → `splitContentIntoBlocksV2` → `BlockRenderer`.

### `content_block` events (BlockChannel + new TextChannel path)

Each `content_block` event carries:

```json
{
  "event": "content_block",
  "data": {
    "blockId": "blk_0",
    "blockIndex": 0,
    "type": "timeline",
    "status": "streaming | complete | error",
    "content": "raw text (Text Channel blocks)",
    "data": { "structured snapshot (Block Channel blocks)" },
    "metadata": {}
  }
}
```

`StreamAwareChatMarkdown` stores these in a `Map<blockId, ProcessedBlockState>`, sorted by
`blockIndex`, and passes them as `serverProcessedBlocks` to `EnhancedChatMarkdownInternal`.

`EnhancedChatMarkdown` maps each server block to a `ContentBlock` with `serverData = block.data`
and routes it to `BlockRenderer`. `BlockRenderer` checks `if (block.serverData)` first and uses
it directly — no client-side parsing needed.

---

## Render Path Summary

```
NDJSON stream
  ↓ StreamAwareChatMarkdown — dispatches on event.event
  ├── "chunk"         → accumulate text → setProcessedContent
  ├── "content_block" → upsert into serverBlockMap → setServerBlocks (via RAF)
  ├── "tool_event"    → buildCanonicalBlocks → setToolUpdates
  └── other           → ignored

EnhancedChatMarkdownInternal
  ├── useServerBlocks? YES → serverProcessedBlocks.map() → ContentBlock[]
  │     block.serverData = sb.data   ← what BlockRenderer uses
  └── NO → splitContentIntoBlocksV2(content) → ContentBlock[]

BlockRenderer (switch on block.type)
  ├── if (block.serverData) → render with structured data  ← FAST PATH
  ├── if (strictServerData) → StrictModeError              ← STRICT MODE
  └── else → client-side parse (fallback/legacy)
```

---

## Python Guarantees (from streaming-constitution.md)

1. **Every `content_block` event is independently renderable.** React can drop any prior events.
2. **`data` is always `object | null`, never a string.**
3. **`status` is monotonic:** `streaming` → `complete` or `streaming` → `error`. Never reversed.
4. **Every block that opens will close.** `finalize()` on the Python side guarantees this.
5. **Atoms in `data` are complete.** A quiz question in `data.questions` has all options.

---

## What React Must Handle

1. **`data: null` during streaming** — show skeleton/loading state until first data arrives.
2. **Growing snapshots** — `data` grows with each emission. Replace state wholesale. Do NOT
   merge or diff — just use the latest snapshot.
3. **`status: "error"` with partial `data`** — render whatever exists. Show a subtle error indicator.
4. **The Loader Exception** — `flashcards` (and future types) emit a card with `back: null`
   when the front is complete but the back is still streaming. Render a loading spinner on the back,
   not an error, not empty space. `FlashcardItem` handles this.
5. **Blocks with no groups** — not every structured block has categories/phases. Render items flat.
6. **Double-mode** — the same component may receive either `serverData` (new protocol) or
   `content` (legacy/fallback). Both paths must work.

---

## Current Implementation Gaps (React Team Action Required)

### GAP-1: `transcript` and `tasks` missing `serverData` path (TASK-009)

`BlockRenderer.tsx` lines 189–192 always pass `block.content` to the component and never check
`block.serverData`. Python now sends structured data. Add the fast path:

```tsx
case "transcript":
    if (block.serverData) {
        return <BlockComponents.TranscriptBlock key={index} serverData={block.serverData as any} />;
    }
    return <BlockComponents.TranscriptBlock key={index} content={block.content} />;

case "tasks":
    if (block.serverData) {
        return <BlockComponents.TasksBlock key={index} serverData={block.serverData as any} />;
    }
    return <BlockComponents.TasksBlock key={index} content={block.content} />;
```

Each component needs a `serverData` prop added and should skip its client-side parser when present.

---

### GAP-2: `flashcards` — FIXED ✅

`FlashcardsBlock.tsx` and `BlockRenderer.tsx` now support `serverData`. `FlashcardItem.tsx` now
accepts `back: string | null` and renders a loading spinner for the Loader Exception pattern.

---

### GAP-3: `generate_ts_types.py` must be re-run after Python model changes (TASK-007)

The script `ai/processing/blocks/generate_ts_types.py` generates
`types/python-generated/content-blocks.ts`. It is NOT run automatically. When Python models change
(e.g., field added/removed, type changed), the TypeScript types drift silently.

**Action:** Add to the deployment checklist: run `python ai/processing/blocks/generate_ts_types.py`
and commit the output whenever a model in `ai/processing/blocks/models/` changes.

---

### GAP-4: `isNewProtocol` in `types.ts` — FIXED ✅

`types.ts` was importing `isNewProtocol` from `stream-events.ts` but the function didn't exist.
It has been added to both `stream-events.ts` files (generated output and matrx-admin copy).

---

### GAP-5: `BlockRenderer` is the only gate for `strictServerData` — document the intent

`strictServerData` (from `BlockRenderingContext`) disables all client-side fallback parsing
when `true`, forcing all structured blocks to require `block.serverData`. This is meant for
production and end-to-end testing. Make sure the context defaults to `false` in all non-test
environments so existing flows using legacy `content`-based parsing still work.

---

## Streaming Behavior per Block Type (for React rendering decisions)

| Block type | Python behavior | `data` during streaming | `data` on complete |
|---|---|---|---|
| `text`, `thinking`, `reasoning`, `info`, etc. | INCREMENTAL | `null` | `null` (content only) |
| `code` | INCREMENTAL | `null` (language hint in `metadata`) | `{ language, code, isDiff }` |
| `timeline` | SEMANTIC_STREAM | growing snapshot at each sealed item | final snapshot |
| `flashcards` | PARTIAL_UPDATES | growing list of complete cards (back=null for in-progress) | all cards with backs |
| `table` | PARTIAL_UPDATES | growing list of complete rows | all rows |
| `tasks`, `transcript`, `questionnaire`, `cooking_recipe` | PARTIAL_UPDATES | growing list of complete items | all items |
| `research`, `resources`, `progress_tracker`, `troubleshooting` | MARKDOWN_COMPLETE | `null` (raw `content` streams) | parsed structured data |
| `quiz`, `presentation`, `decision_tree`, `comparison_table`, `diagram`, `math_problem` | COMPLETE_ONLY | `null` (raw `content` streams) | parsed structured data |

**Implication for React rendering:**

- For MARKDOWN_COMPLETE and COMPLETE_ONLY blocks: show a markdown preview using `block.content`
  while `block.data === null`. Switch to the structured renderer when `block.data` is populated.
- For PARTIAL_UPDATES: `block.data` grows incrementally — each update is a full snapshot.
  Replace, don't merge.
- For SEMANTIC_STREAM (`timeline`): same as PARTIAL_UPDATES — growing snapshot.

---

## The `metadata` Field

`block.metadata` contains block-type-specific hints. Current usages:

| Field | Block types | Meaning |
|---|---|---|
| `language` | `code` | Programming language (stable from opening fence, used as display hint during streaming) |
| `isComplete` | various | Whether the block's closing tag was detected |
| `parseError` | any | `true` if the parser threw an exception |
| `parseFailReason` | any | Human-readable explanation when `parseError` is true |
| `reasoningTexts` | `consolidated_reasoning` | Array of reasoning text strings (client-side consolidation) |

---

## Files Changed in This Session

| File | Change |
|---|---|
| `types/python-generated/stream-events.ts` | Added `CONTENT_BLOCK`, `ContentBlockPayload`, `ContentBlockEvent`, `isContentBlockEvent`, `isNewProtocol` |
| `types/python-generated/content-blocks.ts` | Removed `partialCard` from `FlashcardsBlockData`; `FlashcardItem.back` now `string \| null` |
| `lib/api/types.ts` | Added `ContentBlockPayload`, `ContentBlockEvent`, `isContentBlockEvent` re-exports |
| `components/mardown-display/chat-markdown/types.ts` | Now re-exports `isNewProtocol` (was missing, caused TS error) |
| `components/mardown-display/blocks/flashcards/FlashcardItem.tsx` | `back` prop now `string \| null`; renders loader spinner when `null` |
| `components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx` | Accepts `serverData` prop; uses it instead of re-parsing when available |
| `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` | `flashcards` case now has `serverData` fast path + `strictServerData` error |
