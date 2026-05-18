# Markdown / content edit paths — analysis from `AgentAssistantMessage`

> **Status (2026-05-17):** Two gaps closed in this round.
>
> 1. **`onContentChange` propagation** — Inline edits now route through
>    `commitInlineContentEdit` → `setRequestEditedText` (active-requests,
>    in-session) + optimistic `updateMessageRecord` + debounced
>    `cx_message_edit` RPC (DB + auto-archive to
>    `cx_message.content_history`). Recovery surfaces in
>    `AssistantActionBar` via the "Edit history" menu item +
>    `EditHistoryDialog`.
> 2. **Stream-parser gap with static splitter** — The streaming
>    accumulator (`stream-block-accumulator.ts`) previously emitted
>    `metadata: undefined` for every block, so `<decision>`,
>    `<artifact>`, `<editor_error>`, `<editor_code_snippet>` rendered as
>    raw text mid-stream and only "snapped in" after a refresh (when the
>    static splitter ran). Now the accumulator parses opening-tag
>    attributes, captures `rawXml`, and re-parses closed `<option>` tags
>    on every emit so the renderer's `metadata.decision` / `metadata.artifactId` /
>    `metadata.rawXml` / `metadata.isComplete` requirements are satisfied
>    live. Also added: `editor_error` + `editor_code_snippet` to the
>    attribute-XML tag set, and mid-line attribute-XML detection
>    mirroring `detectMidLineAttributeXml` in `content-splitter-v2`.
>
> The §5 and §10 gaps below remain accurate for paths that don't go
> through `replaceBlockContent` (CSV cells, nested previews, task-list
> checkboxes).

This document traces every route by which assistant message **content** can be viewed, transformed, or edited, from the agent run UI entry point through nested renderers. It flags **local component state** that does not propagate to a single upstream source (today: Redux conversation history + overlay slices).

**Scope entry:** [`AgentAssistantMessage.tsx`](./AgentAssistantMessage.tsx)

**Goal of the follow-up work:** one universal source of truth so any edit at any level updates persisted/display state consistently. This file is an inventory so nothing is missed.

---

## 1. Upstream data flow (before `MarkdownStream`)

| Layer | Role | Notes |
|--------|------|--------|
| [`AgentConversationDisplay.tsx`](./AgentConversationDisplay.tsx) | Builds `displayMessages` from `selectConversationTurns(conversationId)` + live stream | Assistant rows use `turn.content` or `streamingText`; `contentBlocks` on turns are **not** passed into `AgentAssistantMessage` (only `AgentUserMessage` receives them). |
| [`aggregate.selectors.ts`](../../../redux/execution-system/selectors/aggregate.selectors.ts) | `selectLatestAccumulatedText` | Streaming body text comes from `activeRequests` (`accumulatedText` / chunk pipeline), not from `MarkdownStream` events. |
| [`process-stream.ts`](../../../redux/execution-system/thunks/process-stream.ts) | NDJSON processor | Also maintains structured `contentBlocks` on the active request; that parallel structure is **not** wired into `AgentAssistantMessage` as `events` or `serverProcessedBlocks`. |

**Implication:** The agent assistant bubble is driven by a **single markdown string** (`content`). Any future universal state must decide how **parallel** structures (`contentBlocks` in Redux, tool lifecycle, etc.) relate to that string.

---

## 2. `AgentAssistantMessage` — direct behavior

| Mechanism | State / effect | Syncs to conversation? |
|-----------|----------------|---------------------------|
| `showOptionsMenu`, `isCopied` | Local UI | No |
| `openFullScreenEditor({ content, ... })` | Redux overlay open + **snapshot** of `content` | **No** — see §6 |
| `openHtmlPreview({ content })` | Overlay | No |
| `MarkdownStream` | No `onContentChange`; `allowFullScreenEditor={false}` | Inline full-screen editor inside `EnhancedChatMarkdown` is **disabled** here |
| Copy / menu actions | Use `content` prop | N/A |

---

## 3. `MarkdownStream` shell → implementation

| File | Purpose |
|------|---------|
| [`components/MarkdownStream.tsx`](../../../../../components/MarkdownStream.tsx) | Dynamic import; defines `onContentChange`, `events`, `serverProcessedBlocks`, etc. |
| [`components/MarkdownStreamImpl.tsx`](../../../../../components/MarkdownStreamImpl.tsx) | `BlockRenderingProvider` + `StreamAwareChatMarkdown` |

---

## 4. `StreamAwareChatMarkdown` — streaming aggregation state

**File:** [`StreamAwareChatMarkdown.tsx`](../../../../../components/mardown-display/chat-markdown/StreamAwareChatMarkdown.tsx)

| State | When used |
|-------|-----------|
| `processedContent` | Legacy path: mirrors `content` prop or accumulates `chunk` events |
| `canonicalBlocks` | Event mode: text + `tool_call` interleaving |
| `serverBlocks` | `content_block` events → server-processed blocks |
| `hasStreamError` | Error events |

**Agent path today:** typically **legacy** (`content` only, no `events`), so this layer mostly mirrors props unless another caller passes `events`.

**Tool UI:** When `canonicalBlocks` contains `tool_call`, it renders [`ToolCallVisualization`](../../../../../features/cx-conversation/ToolCallVisualization.tsx) (lazy). That is a **separate** visualization path from markdown string edits (tool state lives in stream/Redux elsewhere).

---

## 5. `EnhancedChatMarkdownInternal` — canonical “full document” edit hub

**File:** [`EnhancedChatMarkdown.tsx`](../../../../../components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx)

This is the **central place** that holds a **full-string** edit buffer for the markdown pipeline.

| State / callback | Behavior |
|------------------|----------|
| `editedContent` (`useState<string \| null>`) | When non-null, overrides incoming `content` for splitting/rendering (`currentContent = editedContent ?? content`). |
| `replaceBlockContent(original, replacement)` | Finds `original` in `currentContent`, splices `replacement`, then `setEditedContent` + `onContentChange?.(...)`. |
| `handleSaveEdit` / `FullScreenMarkdownEditor` | Only mounted when `allowFullScreenEditor` (disabled in agent assistant). |
| `useEffect` + `isStreamActive` | Clears `editedContent` when streaming is active so local edits do not fight the stream. |

**Agent gap:** `AgentAssistantMessage` does **not** pass `onContentChange` to `MarkdownStream`. So `replaceBlockContent` **still updates `editedContent` locally** (UI updates), but **nothing writes back** to `instanceConversationHistory` or execution state.

**`renderBlock` → `SafeBlockRenderer` → `BlockRenderer`:** passes `onContentChange` (undefined in agent path), `replaceBlockContent`, `handleOpenEditor`.

**`BlockRenderer` text blocks:** `renderBasicMarkdown` sets `onEditRequest={onContentChange ? handleOpenEditor : undefined}`. With no `onContentChange`, **pencil “edit” on prose blocks is disabled** (no `handleOpenEditor` from hover UI).

---

## 6. Full-screen editor overlays (Redux) — second copy of content

**Opened from:** `AgentAssistantMessage` → `openFullScreenEditor` / menu → [`MessageOptionsMenu`](../../../../../features/chat/components/response/assistant-message/MessageOptionsMenu.tsx)

**Rendered in:** [`OverlayController.tsx`](../../../../../components/overlays/OverlayController.tsx) → dynamic [`FullScreenMarkdownEditor`](../../../../../components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx)

| Instance | Persistence while typing |
|----------|--------------------------|
| Singleton (`instanceId === "default"`) | `onChange` → `updateOverlayData` in [`overlayDataSlice`](../../../../../lib/redux/slices/overlayDataSlice.ts) — **live** |
| UUID instances | `onSave` → `updateOverlayData` + optional `data?.onSave` |

**Critical:** Agent flow opens the editor with **initial** `content` from the message but does **not** register a callback to merge saved text back into the conversation turn. So the overlay and the message can **diverge**.

**`FullScreenMarkdownEditor` internal state:**

- `editedContent` + `setEditedContent` seeded from `initialContent`
- `handleContentChange` / `handleTextareaChange` → central setter that calls `onChangeRef.current?.(newContent)` (singleton sync to `overlayDataSlice`)
- Tabs can include **Matrx Split**, **TUI**, etc.; all funnel through that central content setter when wired
- Optional admin/analysis tabs may include tools like **JsonComparator** with **local** JSON state (does not feed the main markdown string unless explicitly wired)

---

## 7. `BlockRenderer` — per-block callbacks (all ultimately `replaceBlockContent` or nothing)

**File:** [`BlockRenderer.tsx`](../../../../../components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx)

Below: blocks that **can** mutate the markdown document string (via `replaceBlockContent` → parent `editedContent`), vs those that only hold **local** or **external** state.

### 7.1 String-replacing blocks (wired to `replaceBlockContent` when not streaming)

| Block type | Edit surface | Callback |
|------------|--------------|----------|
| `code` (normal, large) | [`CodeBlock`](../../../../../features/code-editor/components/code-block/CodeBlock.tsx) | `onCodeChange` → `replaceBlockContent(block.content, newCode)` |
| `code` (`markdown` / `md` / `mdx`) | [`MarkdownPreviewBlock`](../../../../../components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock.tsx) | Source mode uses `CodeBlock` with `onCodeChange` → `replaceBlockContent` |
| `table` | [`StreamingTableRenderer`](../../../../../components/mardown-display/blocks/table/StreamingTableRenderer.tsx) | `onContentChange` → `replaceBlockContent(block.content, updatedMarkdown)` via `notifyContentChange` |
| `matrxBroker` | [`MatrxBrokerBlock`](../../../../../components/mardown-display/blocks/brokers/MatrxBrokerBlock.tsx) | `onUpdate` → `replaceBlockContent(original, updated)`; **also** `dataBrokerActions.directUpdateRecord` (Redux entity) |
| `decision` | [`InlineDecisionBlock`](../../../../../components/mardown-display/blocks/inline-decision/InlineDecisionBlock.tsx) | `onResolve` → `replaceBlockContent(rawXml, chosenText)`; local: `selectedId`, `editText`, `expanded`, `fadeOut` |

### 7.2 Local / non-propagating edit or interaction state (must not miss for “universal source”)

| Block / area | Local state | Writes markdown? |
|--------------|-------------|------------------|
| [`StreamingTableRenderer`](../../../../../components/mardown-display/blocks/table/StreamingTableRenderer.tsx) | `internalTableData`, `editMode`, modals, “data stable” timer | Yes **only** when `notifyContentChange` runs (edit exit / save paths); intermediate cell edits are local until then |
| [`CodeBlock`](../../../../../features/code-editor/components/code-block/CodeBlock.tsx) | `editedCode`, UI flags, modals | Calls `onCodeChange` on save/apply paths; **without** `onCodeChange`, edits stay **local** to the code block |
| [`CsvBlock`](../../../../../components/mardown-display/blocks/csv/CsvBlock.tsx) | `data`, `editCell`, `editValue`, sort | **Inline cell edits update `data` only** — **no** `replaceBlockContent` / **no** serialization back to fenced CSV in the message |
| [`BasicMarkdownContent`](../../../../../components/mardown-display/chat-markdown/BasicMarkdownContent.tsx) | `isHovering`, checkbox render (`Checkbox` **uncontrolled** for task lists) | Edit button only if `onEditRequest`; checkboxes **do not** update source markdown |
| [`MarkdownPreviewBlock`](../../../../../components/mardown-display/blocks/markdown-preview/MarkdownPreviewBlock.tsx) | `mode` (preview/source), `copied` | Preview pane uses `BasicMarkdownContent` **without** `onEditRequest` |
| Quiz / questionnaire / flashcards / slideshow / decision tree / diagram / etc. | Various `useState` (navigation, expanded, quiz answers) | **Display/interaction only** unless a dedicated callback exists (none tied to `replaceBlockContent` here) |
| [`SearchReplaceBlock`](../../../../../components/mardown-display/blocks/search-replace/SearchReplaceBlock.tsx) / [`StreamingDiffBlock`](../../../../../components/mardown-display/chat-markdown/diff-blocks/StreamingDiffBlock.tsx) | Parsing/stream state | `CodeBlock` fallbacks **without** `onCodeChange` |
| [`ArtifactBlock`](../../../../../components/mardown-display/blocks/artifact/ArtifactBlock.tsx) | Canvas `open()`, embedded renderers | Routes to other components; no document-level `onContentChange` |
| [`ToolCallVisualization`](../../../../../features/cx-conversation/ToolCallVisualization.tsx) (interleaved) | Tool-specific | Not markdown body |

### 7.3 `BlockRenderingContext`

[`BlockRenderingContext.tsx`](../../../../../components/mardown-display/chat-markdown/BlockRenderingContext.tsx): `strictServerData` only affects **fallback when `serverData` missing** — not edit routing.

---

## 8. Nested markdown inside blocks

- **Preview panes** (e.g. `MarkdownPreviewBlock`, parts of `ArtifactBlock`) mount `BasicMarkdownContent` or `MarkdownStream` **without** an `onContentChange` bridge to the parent block’s source string.
- **Matrx Split** ([`MatrxSplit.tsx`](../../../../../components/matrx/MatrxSplit.tsx)): controlled `value` / `onChange`; used inside full-screen editor, not in the default agent bubble.

---

## 9. Summary: “sources of truth” today (agent assistant path)

1. **Authoritative for display from server/history:** `turn.content` / `accumulatedText` in Redux (`instanceConversationHistory` + `activeRequests`).
2. **Session-local overrides:** `EnhancedChatMarkdownInternal.editedContent` (sub-block edits that call `replaceBlockContent`, or full-screen-in-markdown when allowed).
3. **Overlay duplicate:** `overlayDataSlice` for singleton full-screen editor content while open.
4. **Orphan UI state:** `CsvBlock` cell edits, task-list checkboxes in rendered markdown, quiz/questionnaire answers, diff fallbacks’ code editor, etc.

---

## 10. Checklist for universal content state (implementation planning)

Use this as a verification list — each item either feeds the universal source or is explicitly classified as read-only/ephemeral.

- [ ] `AgentAssistantMessage` / `MarkdownStream`: pass through `onContentChange` (or equivalent) to Redux for the active turn / message id.
- [ ] `EnhancedChatMarkdownInternal`: keep `replaceBlockContent` as the single string patch API, or replace with block-ID-aware patches if structured `contentBlocks` become first-class.
- [ ] `StreamingTableRenderer`: ensure every exit path from edit mode calls the upstream updater; consider syncing `internalTableData` with prop changes.
- [ ] `CodeBlock`: when used without `onCodeChange`, decide whether editing should be disabled or serialized.
- [ ] `CsvBlock`: add serialization + parent callback, or disable editing in chat context.
- [ ] `BasicMarkdownContent`: task-list checkbox changes (if ever made interactive for editing).
- [ ] `MarkdownPreviewBlock` preview pane: if full-tree editing is required, wire `onEditRequest` through to the same store.
- [ ] `MatrxBrokerBlock`: reconcile **two** sinks (entity Redux vs message string).
- [ ] Full-screen overlay: on save/close, merge into conversation state (and clear `overlayDataSlice` or mark draft vs committed).
- [ ] Stream lifecycle: `isStreamActive` clears `editedContent` — define conflict rules when merging user edits with late chunks.
- [ ] **Parallel `contentBlocks`:** if assistants emit structured blocks, define whether the universal source is **markdown-only**, **blocks-only**, or a **joined** model; `AgentConversationDisplay` currently drops `contentBlocks` for assistant rows.

---

## 11. Related agent UI surfaces (same markdown stack, not fully traced here)

These also render `MarkdownStream` / `MarkdownStreamImpl` without necessarily passing `onContentChange`:

- [`AssistantMessageCard.tsx`](../../agent-widgets/chat-assistant/AssistantMessageCard.tsx)
- [`AgentEmptyMessageDisplay.tsx`](../shared/AgentEmptyMessageDisplay.tsx) (description)
- [`SmartAgentMessageList.tsx`](../../smart/SmartAgentMessageList.tsx) (similar conversation list)

Any universal content architecture should reuse the same wiring for these entry points.

---

*Generated for the task: unify markdown/content state. Update this file if block registry or agent wiring changes.*
