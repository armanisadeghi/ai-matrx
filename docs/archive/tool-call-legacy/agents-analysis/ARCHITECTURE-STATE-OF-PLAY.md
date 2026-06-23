# Agent Conversation System — Architecture State of Play

> **Purpose**: A comprehensive map of the current conversation data architecture — where data lives, how it flows, what's broken, and what we need to do next. Written for engineers (or AI agents) who need full context before touching any of this code.

---

## Table of Contents

1. [Terminology — The Three Data Formats](#1-terminology--the-three-data-formats)
2. [The Canonical Protocol — What We Already Have (But Aren't Using)](#2-the-canonical-protocol--what-we-already-have-but-arent-using)
3. [Redux Slice Inventory — Where Data Lives](#3-redux-slice-inventory--where-data-lives)
4. [The Two Parallel Systems](#4-the-two-parallel-systems)
5. [Data Flow: Streaming (Live)](#5-data-flow-streaming-live)
6. [Data Flow: Commit (Stream End)](#6-data-flow-commit-stream-end)
7. [Data Flow: DB Load (History)](#7-data-flow-db-load-history)
8. [Rendering Pipeline](#8-rendering-pipeline)
9. [The Order-Loss Problem](#9-the-order-loss-problem)
10. [Deprecated / Dead Code](#10-deprecated--dead-code)
11. [Streaming Protocol Reference](#11-streaming-protocol-reference)
12. [Strengths of the Current System](#12-strengths-of-the-current-system)
13. [Weaknesses and Design Debts](#13-weaknesses-and-design-debts)
14. [Gap Analysis — What's Missing](#14-gap-analysis--whats-missing)
15. [Recommended Architecture](#15-recommended-architecture)
16. [Migration Plan](#16-migration-plan)

---

## 1. Terminology — The Three Data Formats

Data for a single conversation turn exists in **three formats** at different lifecycle stages. These are NOT three different kinds of data — they are the SAME data at different stages of processing.

### Format 1: Database Storage Format ("DB Format")

**What it is**: The raw serialized form stored in database tables. A single assistant message in `cx_message.content` is a JSONB array of typed dictionaries. Tool call data is stored separately in `cx_tool_call`. Media is stored in `cx_message.content` entries with `type: "media"`.

**Example** — a single `cx_message.content` array:
```json
[
  { "type": "thinking", "text": "", "metadata": {}, "provider": "google", "signature": "..." },
  { "type": "text", "text": "Hi there! I've put together..." },
  { "type": "thinking", "text": "**Assessing the Prompt**\n\nI've started by...", "metadata": {} },
  { "type": "thinking", "text": "\n\n**Generating the Flashcards**\n\nI'm now...", "metadata": {} },
  { "type": "thinking", "text": "", "metadata": {}, "provider": "google", "signature": "..." },
  { "type": "text", "text": "\n\nNow that you have...\n\n<flashcards>\n---\nFront: ...\n</flashcards>" }
]
```

**Key characteristics**:
- Ordered array preserving original emission sequence
- "Message Parts" — each entry is a DB-level part (text, thinking, tool_call, media)
- Text parts contain raw markdown including XML tags like `<flashcards>`, `<quiz>`, etc.
- Thinking parts with empty text are signature bookends (not renderable)
- Tool call references (type: "tool_call") point to `cx_tool_call` records by call_id
- **This is the "worst case" input** — requires the most processing to render

### Format 2: Stream Wire Format ("Stream Format")

**What it is**: The real-time NDJSON events from the Python backend. Each line is `{"event": "<type>", "data": {...}}`. During a stream, the equivalent of a single DB message arrives as a sequence of events over time.

**Key characteristics**:
- Events arrive in real-time order — the ordering IS the interleaving
- Text arrives as `chunk` events (many small fragments)
- Reasoning arrives as `reasoning_chunk` events
- Tool calls arrive as `tool_event` sub-events (started → progress → completed)
- Structured content arrives as `content_block` events with `status: "streaming" | "complete"`
- **When Python pre-parses**, it sends the parsed blocks as `content_block` events — identical to what `splitContentIntoBlocksV2` would produce client-side

### Format 3: Render Format ("Render Blocks")

**What it is**: The final, ready-to-render array of typed blocks that the component tree iterates over. This is what `BlockRenderer` consumes.

**THIS IS IDENTICAL whether Python parsed it or the client parsed it.** A flashcard block from Python and a flashcard block from `splitContentIntoBlocksV2` are the same shape. The only difference is who did the work.

**The render format is a flat, ordered array of blocks:**
```typescript
// Example render output for the message above:
[
  { type: "thinking", content: "**Assessing the Prompt**\n\n..." },
  { type: "thinking", content: "**Generating the Flashcards**\n\n..." },
  { type: "text", content: "Hi there! I've put together..." },
  { type: "text", content: "Now that you have the recommendations..." },
  { type: "flashcards", content: "Front: What language...\nBack: Spanish...", metadata: { isComplete: true } },
  { type: "tool_call", toolUpdates: [...] },  // if tools were used
]
```

After a block-type-specific secondary parser runs (e.g., `flashcard-parser.ts`), a flashcards block becomes:
```typescript
{ flashcards: [{ front: "...", back: "..." }, ...], isComplete: true, partialCard: null }
```

### The Processing Pipeline

```
FORMAT 1 (DB)  ──translate──→  FORMAT 2 equivalent  ──parse──→  FORMAT 3 (Render Blocks)
FORMAT 2 (Stream)  ──────────────────────────────────parse──→  FORMAT 3 (Render Blocks)
FORMAT 3 (from Python)  ─────────────────────────────────────→  FORMAT 3 (Render Blocks) ✓ direct
```

**Critical insight**: If Python sends us pre-parsed Format 3 blocks, we skip all parsing. If Python sends raw text (Format 2), we parse it client-side. If we load from DB (Format 1), we first reconstruct what would have streamed, then parse. But the output is ALWAYS the same Format 3.

### Streaming Completion Flags

When Python streams structured blocks (flashcards, quiz, timeline, etc.), each `content_block` event carries a `status` field:
- `status: "streaming"` — block is still being built, show loading/skeleton
- `status: "complete"` — block is finalized, render fully
- `status: "error"` — block parsing failed, show error fallback

This allows lazy updates during streaming and prevents unnecessary re-renders of incomplete blocks.

### What Belongs in Redux

For each conversation turn, Redux should store **all three formats** as they become available:

| Field | What | Required? | When populated |
|---|---|---|---|
| `dbContent` | Format 1 — raw DB arrays | Optional | On DB load, or when record_update events confirm persistence |
| `streamEvents` | Format 2 — raw stream events (or reconstructed equivalent) | Optional | During/after streaming, or synthesized from DB |
| `renderBlocks` | Format 3 — the parsed, ordered, ready-to-render blocks | **Required** | Always — this is the ONLY format the UI reads |

The renderer ONLY ever reads `renderBlocks`. The other two formats exist for debugging, re-processing, and as the "source of truth" for data integrity.

### Terminology Resolution

| Term | Meaning | NOT to be confused with |
|---|---|---|
| **Message Part** | A single entry in `cx_message.content[]` (DB Format 1) | Not a "block" — a message can have 6 parts that produce 15 render blocks |
| **Stream Event** | A single NDJSON line from the backend (Stream Format 2) | Not a "block" — multiple chunk events merge into one text render block |
| **Render Block** | A single renderable unit in the final ordered array (Format 3) | The ONLY format components consume |
| **Artifact Candidate** | A render block that represents structured content (flashcards, quiz, diagram, etc.) — may or may not become a saved Artifact | Subset of render blocks |
| **Content Block (legacy)** | `ContentBlock` interface in `content-splitter-v2.ts` — this IS a render block | Same thing, just the current TypeScript name |
| **ContentBlockPayload (legacy)** | Wire protocol shape from `stream-events.ts` — a partially-processed stream event | Must be converted to a render block before rendering |

---

## 2. The Canonical Protocol — What We Already Have (But Aren't Using)

**Critical discovery**: `lib/chat-protocol/` is a complete, well-documented, pure-TypeScript package that already implements the unified Format 3 architecture described above. It has converters from both DB and stream sources, immutable output, protocol versioning, and legacy adapters. **It is barely wired into the active Redux pipeline.**

### What `lib/chat-protocol/` contains

| File | Purpose | Status |
|---|---|---|
| `types.ts` | `CanonicalMessage`, `CanonicalBlock` union (TextBlock, ThinkingBlock, MediaBlock, ToolCallBlock, ErrorBlock), `StreamingState` | Complete, well-typed |
| `from-stream.ts` | `buildCanonicalBlocks(events)` — converts `StreamEvent[]` → `CanonicalBlock[]` with correct interleaving | Complete |
| `from-db.ts` | `buildCanonicalMessages(dbMessages, toolCalls)` — converts `CxMessage[]` + `CxToolCall[]` → `CanonicalMessage[]` handling V1+V2 schemas, tool output patching, thinking/media/code blocks | Complete |
| `adapters.ts` | `canonicalToLegacy()` — bridges to old `ChatMessage` / `ToolCallObject[]` for existing renderers. Marked `@deprecated`. | Complete |
| `README.md` | Full architecture docs, usage examples, migration plan, tool state contract | Complete |

### The `CanonicalBlock` union — our Format 3

```typescript
type CanonicalBlock =
  | TextBlock        // { type: 'text', content: string }
  | ThinkingBlock    // { type: 'thinking', content: string }
  | MediaBlock       // { type: 'media', kind: 'image'|'audio'|'video'|'document'|'youtube', url: string }
  | ToolCallBlock    // { type: 'tool_call', callId, toolName, input, output?, error?, progress, phase }
  | ErrorBlock       // { type: 'error', errorType: string, message: string }
```

### What's missing from `CanonicalBlock` vs what we need

The `CanonicalBlock` union covers the "message-level" block types (text, thinking, media, tools, errors) but does NOT cover **artifact candidates** — the structured content blocks that `splitContentIntoBlocksV2` and Python both produce:

**Not in CanonicalBlock yet**: flashcards, quiz, presentation, cooking_recipe, timeline, progress_tracker, comparison_table, troubleshooting, resources, decision_tree, research, diagram, math_problem, code, table, transcript, tasks, structured_info, questionnaire, matrxBroker

These are currently handled by the `ContentBlock` type in `content-splitter-v2.ts` and by `BlockRenderer.tsx` — both of which sit in the rendering layer, not in the protocol layer.

### Why it's not connected

The active Redux pipeline (`processStream` → `activeRequests` → `commitAssistantTurn` → `instanceConversationHistory`) was built independently. It uses:
- `ContentBlockPayload` from `types/python-generated/stream-events.ts` (wire format)
- `normalizeContentBlocks` from `features/agents/redux/execution-system/utils/normalize-content-blocks.ts`
- Direct text accumulation (`textChunks.join("")`)

It does NOT use:
- `buildCanonicalBlocks()` from `lib/chat-protocol/from-stream.ts`
- `buildCanonicalMessages()` from `lib/chat-protocol/from-db.ts`
- `CanonicalMessage` or `CanonicalBlock` types anywhere in the Redux layer

### Who does import from `lib/chat-protocol/`

Only 5 files import from it — none of them are in the active pipeline:
- `StreamAwareChatMarkdown.tsx` — the event-driven rendering path (used by public chat only)
- `EnhancedChatMarkdown.tsx` — imports types but doesn't use the converters
- `ChatStreamDisplay.tsx` — a chat feature component
- `DEPRECATED-useAgentChat.ts` — deprecated hook
- `MessageDisplay.tsx` — public chat display
- `sendMessage.ts` — cx-conversation thunk (System B)

### The gap

We have **two parallel conversion systems**:
1. `lib/chat-protocol/` — correct design, handles text+thinking+media+tools, order-preserving, immutable, well-tested
2. `normalize-content-blocks.ts` + `processStream` + `commitAssistantTurn` — the active system, handles streaming but loses ordering and drops reasoning on commit

**Neither system handles the full Format 3 render block set** (artifact candidates like flashcards, quiz, etc.). That parsing currently only happens at render time in `EnhancedChatMarkdown` → `splitContentIntoBlocksV2`.

---

## 3. Redux Slice Inventory — Where Data Lives

### Active Slices That Store Messages

| # | Slice Name | Key | Stores | Used By |
|---|---|---|---|---|
| 1 | **`instanceConversationHistory`** | `conversationId` | `ConversationTurn[]` (text + contentBlocks) | SSR chat route, agent builder, agent runner, overlays |
| 2 | **`chatConversations`** | `sessionId` | `ConversationMessage[]` (text + rawContent + toolCalls + streaming) | Legacy `/a/` route, cx-conversation feature |
| 3 | **`activeRequests`** | `requestId` (indexed by `conversationId`) | Live streaming data: textChunks, reasoningChunks, contentBlocks, toolLifecycle, timeline | Used during active stream, read by AgentAssistantMessage |
| 4 | **`promptExecution`** | `runId` | `ConversationMessage[]` (structural clone of chatConversations) | Prompt apps runner (legacy) |

### Active Slices That Store Metadata Only (No Messages)

| # | Slice Name | Key | Stores |
|---|---|---|---|
| 5 | **`activeChat`** | `sessionId` ref | Active session pointer, selected agent, queued first message, model settings |
| 6 | **`cxConversations`** | `id` (DB UUID) | Sidebar list: title, updatedAt, messageCount (no messages) |
| 7 | **`agentConversations`** | `agentId::version` | Agent builder sidebar list (no messages) |
| 8 | **`conversationFocus`** | `surfaceKey` | Surface → conversationId mapping |
| 9 | **`instanceUIState`** | `conversationId` | Display config per instance |
| 10 | **`instanceUserInput`** | `conversationId` | User input draft per instance |

### Ephemeral / Domain-Specific Slices

| # | Slice Name | Purpose |
|---|---|---|
| 11 | **`messageActions`** | Snapshot of message content for action overlays (Save to Notes, etc.) |
| 12 | **`agentAssistantMarkdownDraft`** | Draft edits of assistant messages |
| 13 | **`flashcardChat`** | Per-flashcard chat history (domain-specific) |

### Deprecated Slices (Still Registered in Root Reducer)

| # | Slice Name | Era | Replacement |
|---|---|---|---|
| 14 | `conversation` | Socket.IO v1 | `instanceConversationHistory` |
| 15 | `messages` | Socket.IO v1 | `instanceConversationHistory` |
| 16 | `newMessage` | Socket.IO v1 | `instanceUserInput` |
| 17 | `chatDisplay` | Socket.IO v1 | `instanceConversationHistory` |
| 18 | `aiChat` | Socket.IO v1 | `instanceConversationHistory` |

### React Context (Non-Redux)

| # | Context | Status | Replacement |
|---|---|---|---|
| 19 | `DEPRECATED-ChatContext` | Deprecated (filename says so) | `chatConversations` / `instanceConversationHistory` |

### The Overlap Problem

**`instanceConversationHistory` and `chatConversations` store the same data in different shapes for different UI surfaces.** They both represent a conversation with messages, both track role/content/status, both load from the same `cx_message` table, but they:

- Use different keys (`conversationId` vs `sessionId`)
- Use different message types (`ConversationTurn` vs `ConversationMessage`)
- Have different feature sets (chatConversations has inline streaming and tool calls; instanceConversationHistory delegates those to `activeRequests`)
- Have independent DB query paths (direct Supabase vs API route)

They do NOT dual-load the same conversation — each route/surface picks one system — but they represent **two competing architectures** that should be unified.

---

## 4. The Two Parallel Systems

### System A: Agent Execution System (the active, primary system)

**Route**: `/demos/chat/c/[conversationId]`
**Orchestrator**: `ChatInstanceManager`
**Slices**: `instanceConversationHistory` + `activeRequests` + `instanceUIState` + `instanceUserInput` + `conversationFocus`
**DB Query**: Direct Supabase client → `cx_message` only
**Streaming**: HTTP NDJSON → `processStream` thunk → `activeRequests` → `commitAssistantTurn` → `instanceConversationHistory`
**Rendering**: `AgentConversationDisplay` → `AgentAssistantMessage` → `MarkdownStream` → `EnhancedChatMarkdown` → `BlockRenderer`

**This is the system we are actively building and should be the sole survivor.**

### System B: CX Conversation System (legacy, parallel)

**Route**: `/a/[agentId]/[conversationId]` (old layout)
**Orchestrator**: `useConversationSession`
**Slices**: `chatConversations` + `activeChat`
**DB Query**: `fetch('/api/cx-chat/request')` → server-side `loadFullConversation` (3 tables)
**Streaming**: Inline on `ConversationMessage` via `appendStreamChunk` / `pushStreamEvent`
**Rendering**: `ConversationShell` → various cx-conversation components

**This system should be deprecated and removed.**

### System C: Public Chat (deprecated, uses React Context)

**Route**: `/p/chat/c/[conversationId]`
**State**: `DEPRECATED-ChatContext` (useReducer)
**DB Query**: `useChatPersistence().loadConversation` → same API route as System B
**Rendering**: `ChatLayoutShell` → public chat components

**Already marked deprecated. Should be migrated to System A or a minimal variant.**

---

## 5. Data Flow: Streaming (Live)

```
User submits message
  ↓
dispatch(addUserTurn)                          → instanceConversationHistory.turns.push(userTurn)
  ↓
dispatch(executeInstance / processStream)
  ↓
HTTP POST → Python backend → NDJSON response stream
  ↓
parseNdjsonStream (read-ahead queue)           → AsyncGenerator<StreamEvent>
  ↓
for-await loop in processStream:
  │
  ├─ chunk event          → appendChunk           → activeRequests.textChunks.push(text)
  ├─ reasoning_chunk      → appendReasoningChunk   → activeRequests.reasoningChunks.push(text)
  ├─ content_block        → upsertContentBlock     → activeRequests.contentBlocks[blockId] = payload
  │                                                  activeRequests.contentBlockOrder.push(blockId)
  ├─ data (typed)         → appendDataPayload      → activeRequests.dataPayloads.push(data)
  │                         upsertContentBlock      → promoted to contentBlocks (non-metadata types)
  ├─ tool_event           → upsertToolLifecycle     → activeRequests.toolLifecycle[callId] = lifecycle
  ├─ phase                → setCurrentPhase         → activeRequests.currentPhase
  ├─ init                 → trackOperationInit      → (metadata tracking)
  ├─ completion           → trackOperationCompletion → tokenUsage, finishReason, completionStats
  ├─ record_reserved      → upsertReservation       → activeRequests.reservations[table::id]
  │                         setConversationId       → (if cx_conversation row reserved)
  ├─ record_update        → upsertReservation       → status update
  ├─ warning              → addWarning              → activeRequests.warnings.push(warning)
  ├─ info                 → addInfoEvent            → activeRequests.infoEvents.push(info)
  ├─ error                → setRequestStatus(error) → breaks loop
  ├─ end                  → setRequestStatus(complete)
  ├─ broker               → appendDataPayload       → activeRequests.dataPayloads.push(broker)
  ├─ heartbeat            → (timeline only)
  └─ ALL events           → appendRawEvent          → activeRequests.rawEvents.push(event)
                            appendTimeline          → activeRequests.timeline.push(entry)
```

**During streaming, the UI reads directly from `activeRequests`:**
- `selectAccumulatedText(requestId)` → joins `textChunks` on each render
- `selectAllContentBlocks(requestId)` → maps `contentBlockOrder` to `contentBlocks`
- `selectStreamPhase(conversationId)` → from `activeRequests`

---

## 6. Data Flow: Commit (Stream End)

```
Stream loop ends (end event or error)
  ↓
dispatch(finalizeAccumulatedText)     → joins textChunks into accumulatedText
dispatch(finalizeAccumulatedReasoning) → joins reasoningChunks into accumulatedReasoning
  ↓
Read final state:
  completedText = activeRequests.accumulatedText
  finalContentBlocks = contentBlockOrder.map(id → contentBlocks[id])
  tokenUsage, finishReason, completionStats from completion event
  ↓
dispatch(commitAssistantTurn({
  conversationId,
  requestId,
  content: completedText,              ← flat text string
  contentBlocks: finalContentBlocks,    ← ContentBlockPayload[] (audio, search, flashcards, etc.)
  tokenUsage,
  finishReason,
  completionStats,
}))
  ↓
instanceConversationHistory.turns.push({
  turnId: uuid(),
  role: "assistant",
  content: completedText,               ← JUST the LLM text output
  contentBlocks: finalContentBlocks,     ← everything else (thinking NOT included here — see §8)
  timestamp, requestId, conversationId, ...
})
```

---

## 7. Data Flow: DB Load (History)

```
User navigates to /demos/chat/c/[conversationId]
  ↓
Server Component renders <ChatInstanceManager conversationId={id}>
  ↓
ChatInstanceManager.useEffect:
  1. dispatch(createManualInstance)     → sets up instanceConversationHistory entry
  2. dispatch(fetchConversationHistory) → Supabase query
  ↓
fetchConversationHistory thunk:
  ↓
  Supabase.from("cx_message")
    .select(explicit columns)
    .eq("conversation_id", id)
    .is("deleted_at", null)
    .order("position", { ascending: true })
  ↓
  For each row (user or assistant):
    rawBlocks = row.content (JSONB array)    ← these are DbContentEntry[]
    textBlock = rawBlocks.find(type === "text")
    primaryText = textBlock.text             ← extracted as the "content" string
    richBlocks = rawBlocks.filter(type !== "text")
    normalizedBlocks = normalizeContentBlocks(richBlocks)  ← DbContentEntry[] → ContentBlockPayload[]
    ↓
    ConversationTurn = {
      content: primaryText,                  ← flat text
      contentBlocks: normalizedBlocks,       ← everything except the text block
    }
  ↓
dispatch(loadConversationHistory({ conversationId, turns }))
  ↓
instanceConversationHistory.byConversationId[id].turns = turns
instanceConversationHistory.byConversationId[id].loadedFromHistory = true
```

**Critical detail**: The DB stores ALL content as an array of typed blocks in `cx_message.content`. The `fetchConversationHistory` thunk separates the `text` block from everything else, putting the text string in `turn.content` and the rest in `turn.contentBlocks`. This is the same split that `commitAssistantTurn` produces — text goes to `content`, rich blocks go to `contentBlocks`.

---

## 8. Rendering Pipeline

### For Committed Turns (from history or after stream end)

```
instanceConversationHistory.turns
  ↓
selectConversationTurns(conversationId)
  ↓
AgentConversationDisplay
  ↓ (for each turn with role=assistant)
AgentAssistantMessage
  │
  ├─ content = turn.content                    ← flat text string
  ├─ serverProcessedBlocks = turn.contentBlocks ← ContentBlockPayload[]
  ↓
MarkdownStream (wrapper)
  ↓
StreamAwareChatMarkdown (legacy mode path, no events prop)
  ↓
EnhancedChatMarkdownInternal
  ↓
  useMemo block splitting:
    │
    ├─ IF serverProcessedBlocks exist:
    │   supplementaryBlocks = serverProcessedBlocks.map(toContentBlock)   ← ContentBlockPayload → RenderSegment (with serverData)
    │   IF content.trim():
    │     textBlocks = splitContentIntoBlocksV2(content)                  ← parse text into RenderSegments
    │     return [...textBlocks, ...supplementaryBlocks]                  ← TEXT FIRST, then rich blocks
    │   ELSE:
    │     return supplementaryBlocks                                      ← rich blocks only
    │
    └─ ELSE (text-only, no server blocks):
        return splitContentIntoBlocksV2(content)                          ← client-side parsing only
  ↓
processedBlocks (reasoning consolidation if not streaming)
  ↓
{processedBlocks.map(block → <SafeBlockRenderer> → <BlockRenderer>)}
  ↓
BlockRenderer switch(block.type):
  │
  ├─ "text","info","task",etc.  → BasicMarkdownContent (render markdown)
  ├─ "code"                     → CodeBlock (syntax highlighting)
  ├─ "thinking","reasoning"     → ThinkingVisualization / ReasoningVisualization
  ├─ "flashcards","quiz",etc.   → Dual-path: serverData → structured component, else client parse
  ├─ "audio_output"             → AudioOutputBlock (from serverData.url)
  ├─ "search_results"           → SearchResultsBlock (from serverData)
  ├─ "unknown_data_event"       → UnknownDataEventBlock
  └─ default                    → BasicMarkdownContent fallback
```

### For Streaming Turns (during active stream)

Same component tree, but:
- `turnId` is null, `requestId` is set, `isStreamActive` is true
- `content` comes from `selectAccumulatedText(requestId)` (live textChunks.join)
- `serverProcessedBlocks` comes from `selectAllContentBlocks(requestId)` (live contentBlocks)
- Reasoning consolidation is skipped
- `BlockRenderer` receives `isStreamActive=true` for animation hints

---

## 9. The Order-Loss Problem

This is the most significant data integrity issue in the current system.

### What the server sends (in order):
```
1. reasoning_chunk "Let me think..."
2. reasoning_chunk "I should consider..."
3. chunk "Here is my answer"
4. chunk " to your question."
5. content_block { type: "flashcards", data: {...} }
6. chunk " And here's more text after the flashcards."
7. content_block { type: "audio_output", data: {...} }
```

### What we store (after commit):
```
turn.content = "Here is my answer to your question. And here's more text after the flashcards."
turn.contentBlocks = [
  { type: "flashcards", data: {...} },
  { type: "audio_output", data: {...} }
]
```

### What we render:
```
[text block] "Here is my answer to your question. And here's more text after the flashcards."
[flashcards block]
[audio block]
```

### The problem:

**Interleaving is destroyed.** The original sequence was: reasoning → text → flashcards → more text → audio. But after commit, all text is concatenated into a single string and all blocks are appended at the end. The flashcards should appear between two paragraphs of text, but instead they appear after all the text.

**Reasoning is lost entirely on commit.** The `commitAssistantTurn` action stores `accumulatedText` (only chunk events) in `content`. The `accumulatedReasoning` (reasoning_chunk events) is finalized but never stored on the committed turn. It only persists in the `activeRequests` slice, which is ephemeral.

**DB-loaded messages have the same problem.** The `fetchConversationHistory` thunk extracts the `text` block from `cx_message.content` and puts it in `turn.content`, then puts everything else in `turn.contentBlocks`. Even though the DB preserves ordering in its JSONB array, we flatten it.

### Root cause:

The `ConversationTurn` type uses `content: string` (a single flat text field) plus `contentBlocks: ContentBlockPayload[]` (a separate array). This two-field design inherently cannot represent interleaved content. You cannot express "text, then flashcards, then more text" — only "all text" and "all blocks."

---

## 10. Deprecated / Dead Code

The following should be removed:

### Socket.IO System (dead)
- `lib/redux/socket-io/` — 32 files, completely disabled. `establishConnection` returns `null`. The Python server no longer supports Socket.IO.

### Deprecated Redux Slices
- `lib/redux/features/aiChats/conversationSlice.ts` — old global conversation metadata
- `lib/redux/features/aiChats/messagesSlice.ts` — old normalized messages
- `lib/redux/features/aiChats/newMessageSlice.ts` — old single message draft
- `lib/redux/features/aiChats/chatDisplaySlice.ts` — old streaming display
- `lib/redux/slices/aiChatSlice.ts` — old multi-chat state

### Deprecated Context
- `features/public-chat/context/DEPRECATED-ChatContext.tsx` — React Context chat state

### CX Conversation System (System B)
- `features/cx-conversation/redux/` — the parallel `chatConversations` slice
- `features/cx-conversation/redux/thunks/` — independent DB loading path

### Prompt Execution System
- `lib/redux/prompt-execution/` — structural clone of chatConversations, replaced

### Chat Protocol Adapters
- `lib/chat-protocol/adapters.ts` — `canonicalToLegacy` conversion layer, no longer needed if we unify on the streaming protocol types

---

## 11. Streaming Protocol Reference

### Transport
HTTP POST → NDJSON response (`\n`-delimited JSON lines). Read-ahead queue parser prevents backpressure drops.

### Headers
- `X-Request-ID` — unique per API call
- `X-Conversation-ID` — server-assigned conversation UUID

### Event Envelope
```json
{ "event": "<type>", "data": { ...payload } }
```

### 16 Event Types
| Event | Purpose | Key Payload Fields |
|---|---|---|
| `chunk` | LLM text token | `text` |
| `reasoning_chunk` | LLM reasoning token | `text` |
| `phase` | Stream lifecycle phase | `phase` (12 values) |
| `init` | Operation lifecycle start | `operation`, `operation_id` |
| `completion` | Operation lifecycle end | `operation`, `status`, `result` (token usage, stats) |
| `content_block` | Structured content | `blockId`, `blockIndex`, `type`, `status`, `content?`, `data?` |
| `data` | Typed data payload (16 sub-types) | `type` discriminator + per-type fields |
| `tool_event` | Tool lifecycle (7 sub-types) | `event`, `call_id`, `tool_name`, `data?` |
| `record_reserved` | DB row pre-created | `table`, `record_id`, `parent_refs?` |
| `record_update` | DB row status change | `table`, `record_id`, `status` |
| `warning` | Non-fatal warning | `code`, `system_message`, `user_message?` |
| `info` | Progress FYI | `code`, `system_message` |
| `error` | Fatal error | `error_type`, `message`, `user_message?` |
| `broker` | Broker value update | `broker_id`, `value` |
| `heartbeat` | Keep-alive | `timestamp?` |
| `end` | Stream termination | `reason?` |

### Typical Event Order
1. `phase(connected)` → `data(conversation_id)` → `record_reserved` (DB rows)
2. `phase(processing)` → `init(user_request)` → optional `warning`/`info`
3. `reasoning_chunk`* → `chunk`* (interleaved with `content_block` and `tool_event`)
4. `data(conversation_labeled)` → `record_update` → `completion(user_request)`
5. `end`

### Server Capability Reminder
**We control both client and server.** The Python backend can be modified to:
- Promote sub-events to top-level events with new names
- Add new event types
- Change event payload shapes
- Add ordering/sequencing metadata to events
- Send richer completion payloads

---

## 12. Strengths of the Current System

1. **Well-defined streaming protocol.** The 16-event NDJSON protocol is clean, well-typed (auto-generated from Pydantic), and well-documented. Every event type has a TypeScript interface and type guard.

2. **Read-ahead stream parser.** The `parseNdjsonStream` decouples network reads from React processing, preventing backpressure drops with large payloads.

3. **Comprehensive event routing.** `processStream` handles all 16 event types with no gaps. Every event hits `appendRawEvent` and `appendTimeline` for full debug visibility.

4. **Rich block renderer.** `BlockRenderer` handles 40+ block types with lazy-loaded components, loading states, and a dual-path (serverData vs. client-parse) fallback strategy.

5. **Normalizer exists.** `normalizeContentBlocks` already bridges the gap between DB shapes and stream protocol shapes, handling legacy media types, text-field blocks, and user-input types.

6. **Unified streaming + committed rendering.** `AgentAssistantMessage` uses the same component tree for both live and committed messages — just different data sources.

7. **Record reservation system.** The server pre-creates DB rows and streams back their IDs, so the client has real DB IDs for conversations, requests, and messages before the stream ends.

---

## 13. Weaknesses and Design Debts

### Critical

1. **Order loss on commit.** Text is concatenated into a flat string and blocks are appended at the end, destroying interleaved content ordering. (See §8.)

2. **Reasoning lost on commit.** `accumulatedReasoning` is never stored on the committed turn. Reasoning blocks only exist in `activeRequests` (ephemeral).

3. **Two competing architectures.** `instanceConversationHistory` (System A) and `chatConversations` (System B) are parallel implementations of the same concept. Both actively used by different routes.

4. **Text/blocks split destroys DB ordering.** `fetchConversationHistory` separates the `text` block from the content array, even though the DB array preserves the original emission order.

### Significant

5. **Terminology collision.** Three different things called "block" — protocol blocks, render segments, and DB content entries. This confuses every developer and AI agent working on the system.

6. **No shared conversation loading service.** System A queries Supabase directly (client-side, messages only). System B goes through an API route (server-side, 3 tables). Same data, different paths, different transforms.

7. **BlockRenderingContext in rendering tree.** A React Context (`BlockRenderingContext`) was added inside the rendering pipeline with `strictServerData`. This is a debug toggle that should be a dev-tools flag, not a context provider in the render tree.

8. **Deprecated slices still registered.** Five deprecated slices from the Socket.IO era are still in the root reducer, increasing bundle size and confusion.

9. **Socket.IO dead code.** 32 files, `establishConnection` returns null. Complete dead weight.

### Minor

10. **`chatConversations` mixes streaming and storage.** It has inline `appendStreamChunk` / `pushStreamEvent` actions alongside persistent `messages[]`. System A correctly separates these concerns (`activeRequests` for streaming, `instanceConversationHistory` for persistence).

11. **`promptExecution` is a structural clone** of `chatConversations`. Likely no longer needed.

12. **`DEPRECATED-ChatContext`** still exists and may still be imported by public chat routes.

---

## 14. Gap Analysis — What's Missing

This section maps every piece that exists, every piece that's missing, and the exact work needed to connect them into a single pipeline.

### What EXISTS and is CORRECT

| Component | Location | What It Does | Status |
|---|---|---|---|
| Stream protocol types | `types/python-generated/stream-events.ts` | 16 event types, TypedStreamEvent union, type guards | Production, auto-generated |
| NDJSON parser | `lib/api/stream-parser.ts` | Read-ahead queue, backpressure-safe | Production |
| Event routing | `features/agents/redux/execution-system/thunks/process-stream.ts` | Routes all 16 event types | Production |
| Canonical protocol types | `lib/chat-protocol/types.ts` | CanonicalMessage, CanonicalBlock union | Complete, unused by active pipeline |
| Stream → Canonical | `lib/chat-protocol/from-stream.ts` | buildCanonicalBlocks() with correct interleaving | Complete, unused by active pipeline |
| DB → Canonical | `lib/chat-protocol/from-db.ts` | buildCanonicalMessages() with V1/V2 support | Complete, unused by active pipeline |
| Legacy adapters | `lib/chat-protocol/adapters.ts` | canonicalToLegacy() bridge | Complete, used by 2-3 consumers |
| Block renderer | `BlockRenderer.tsx` | 40+ block types with dual-path (serverData vs client-parse) | Production |
| Block component registry | `BlockComponentRegistry.tsx` | Lazy-loaded components for all block types | Production |
| Content splitter | `content-splitter-v2.ts` | Markdown → render blocks (text, flashcards, code, etc.) | Production |
| DB normalizer | `normalize-content-blocks.ts` | DbContentEntry → ContentBlockPayload | Production |
| Tool call builder | `ToolRendererPreview.tsx` / `buildToolCallObjects()` | Stream events → ToolCallObject[] | Exists in demo code, not extracted |
| Fold stream events | `fold-stream-events.ts` | Complete event-to-bucket fold with tool mapping | Exists in demo code, not extracted |
| Tool renderer registry | `lib/tool-renderers/registry.tsx` | Static + dynamic tool renderers | Production |

### What's MISSING

#### Gap 1: CanonicalBlock doesn't include artifact candidates

`CanonicalBlock` = TextBlock | ThinkingBlock | MediaBlock | ToolCallBlock | ErrorBlock

But render blocks include 30+ artifact types (flashcards, quiz, timeline, etc.). These are currently only handled at the renderer level by `splitContentIntoBlocksV2` and `BlockRenderer`.

**Fix**: Two approaches:
- **Option A**: Add an `ArtifactBlock` variant to `CanonicalBlock` with `artifactType: string` + `content: string` + `data?: unknown` + `metadata?: unknown`. The content splitter produces these, Python produces these, and BlockRenderer reads `artifactType` to dispatch.
- **Option B**: Keep artifact parsing in the renderer and extend `TextBlock.content` to carry the unparsed markdown. The renderer calls `splitContentIntoBlocksV2` at render time.

**Recommendation**: Option A is cleaner — it means Format 3 is truly complete before it reaches the renderer. But it requires the Python team to send pre-parsed artifact blocks (which they already do via `content_block` events). For client-side parsing of raw markdown, `splitContentIntoBlocksV2` would produce `ArtifactBlock` entries instead of/alongside `TextBlock` entries.

#### Gap 2: processStream doesn't produce CanonicalBlocks

The active streaming pipeline accumulates text into `textChunks[]`, reasoning into `reasoningChunks[]`, and content blocks into `contentBlocks{}` — all separately. It never calls `buildCanonicalBlocks()`.

**Fix**: Replace the manual accumulation in `processStream` with calls to `buildCanonicalBlocks()` (extended to handle artifact blocks). Or: keep `processStream` as-is for real-time state (it works well for that), but at commit time, use the canonical protocol to build the final ordered array.

#### Gap 3: commitAssistantTurn loses ordering and drops reasoning

`commitAssistantTurn` stores `content: string` (concatenated text) and `contentBlocks: ContentBlockPayload[]` (appended at end). Reasoning never reaches the committed turn.

**Fix**: `commitAssistantTurn` should store `renderBlocks: CanonicalBlock[]` (or extended equivalent) built from the full timeline, replacing the split `content` + `contentBlocks` fields.

#### Gap 4: fetchConversationHistory doesn't use from-db.ts

The DB loading path in `features/cx-chat/redux/thunks.ts` manually extracts the text block and normalizes rich blocks. It does NOT call `buildCanonicalMessages()` from `lib/chat-protocol/from-db.ts` — which already handles all block types, V1/V2 schemas, tool output patching, and produces ordered CanonicalBlocks.

**Fix**: Replace the manual DB processing with `buildCanonicalMessages()`. This also means fetching `cx_tool_call` records alongside `cx_message` records (which the API route path in System B already does, but the direct Supabase path in System A does not).

#### Gap 5: ConversationTurn type doesn't support Format 3

`ConversationTurn` has `content: string` + `contentBlocks?: ContentBlockPayload[]`. It needs a `renderBlocks: CanonicalBlock[]` field (or extended variant) that the renderer reads directly.

**Fix**: Add `renderBlocks` to `ConversationTurn`. Mark `content` and `contentBlocks` as deprecated. The renderer reads `renderBlocks` first; if absent, falls back to the legacy fields.

#### Gap 6: buildToolCallObjects is stuck in demo code

The function that converts stream tool events into the `ToolCallObject[]` format needed by `ToolCallVisualization` exists only in `app/(public)/demos/api-tests/tool-testing/components/ToolRendererPreview.tsx`. It should be a shared utility.

**Fix**: Extract to `lib/tool-renderers/build-tool-call-objects.ts`. The function body is complete and correct — just needs to be moved.

#### Gap 7: No streaming completion flag propagation

When Python streams a content_block with `status: "streaming"`, the client can show a skeleton. But the current `upsertContentBlock` action only stores the full `ContentBlockPayload` — it doesn't propagate the `status` field to the rendering layer in a way that the renderer can use to show a loading state vs. final render.

**Fix**: The render block type should carry `isComplete: boolean` (or `status: "streaming" | "complete" | "error"`). BlockRenderer should check this before doing expensive secondary parsing (e.g., don't run the flashcard parser on an incomplete flashcard block).

#### Gap 8: EnhancedChatMarkdown does the merge wrong

`EnhancedChatMarkdown` concatenates: `[...textBlocks, ...supplementaryBlocks]` — text first, server blocks after. This destroys interleaving.

**Fix**: If we have Format 3 render blocks, `EnhancedChatMarkdown` doesn't need to merge anything. It receives an ordered array and iterates. The merge logic should be removed entirely.

#### Gap 9: Server-side pre-parsing not fully leveraged

Python already has the capability to send pre-parsed blocks via `content_block` events. But the current system treats these as "supplementary" rather than as the primary render source. When Python sends `content_block` events for flashcards, quiz, etc., they should be the authoritative Format 3 output — no client-side re-parsing needed.

**Fix**: When a `content_block` event arrives with a known artifact type and `status: "complete"`, it should be stored directly as a render block. Only fall back to client-side `splitContentIntoBlocksV2` when Python sends raw text without pre-parsing.

#### Gap 10: Two DB query paths for the same data

System A (SSR chat) queries `cx_message` only via direct Supabase client. System B (cx-conversation) queries `cx_conversation` + `cx_message` + `cx_tool_call` via API route. Neither uses `buildCanonicalMessages()`.

**Fix**: Create one shared conversation loading service that:
1. Queries `cx_message` + `cx_tool_call` (at minimum)
2. Calls `buildCanonicalMessages()` from `lib/chat-protocol/from-db.ts`
3. Returns `CanonicalMessage[]`
4. Both systems import from this service

### Summary: The Bridge

The architecture we need already exists in `lib/chat-protocol/`. The work is:
1. **Extend** CanonicalBlock to include artifact candidates
2. **Wire** the active pipeline to use it (processStream commit, DB load, ConversationTurn type)
3. **Remove** the parallel conversion systems (normalize-content-blocks.ts, manual text extraction in thunks)
4. **Simplify** the renderer to just iterate render blocks (no merge logic)

---

## 15. Recommended Architecture

### One System, One Slice, Three Formats Per Turn

```
instanceConversationHistory (the sole conversation slice)
  ├── byConversationId: Record<string, ConversationEntry>
  │   └── turns: ConversationTurn[]
  │       ├── renderBlocks: RenderBlock[]     ← REQUIRED, ordered, what the UI reads
  │       ├── dbContent?: DbMessagePart[]     ← Optional, raw DB format for debugging/re-processing
  │       └── streamEvents?: StreamEvent[]    ← Optional, raw stream events for debugging/replay
  │
  └── Every component reads ONLY renderBlocks — never the other two
```

### Extending CanonicalBlock into the Full Render Block

The existing `CanonicalBlock` union in `lib/chat-protocol/types.ts` needs one new variant to cover artifact candidates:

```typescript
// New block type to add to the CanonicalBlock union:
interface ArtifactBlock {
  readonly type: 'artifact';
  readonly artifactType: string;   // "flashcards", "quiz", "timeline", "code", "table", etc.
  readonly content: string;         // raw content (markdown/XML text that secondary parsers consume)
  readonly data?: unknown;          // pre-parsed structured data (if Python parsed it)
  readonly metadata?: Record<string, unknown>;
  readonly isComplete: boolean;     // false while streaming, true when finalized
}

// Extended union:
type RenderBlock =
  | TextBlock           // { type: 'text', content: string }
  | ThinkingBlock       // { type: 'thinking', content: string }
  | MediaBlock          // { type: 'media', kind, url, ... }
  | ToolCallBlock       // { type: 'tool_call', callId, toolName, input, output?, phase, ... }
  | ArtifactBlock       // { type: 'artifact', artifactType, content, data?, isComplete }
  | ErrorBlock          // { type: 'error', errorType, message }
```

**Key design decisions:**
- `ArtifactBlock.artifactType` holds the specific type ("flashcards", "quiz", "code", etc.)
- `ArtifactBlock.data` holds pre-parsed structured data when Python did the parsing — BlockRenderer can use this directly without calling the secondary parser
- `ArtifactBlock.isComplete` tells the renderer whether to show a skeleton or the final component
- `TextBlock` remains for plain markdown text that doesn't contain artifact tags
- When `splitContentIntoBlocksV2` finds `<flashcards>` tags in a text string, it produces `ArtifactBlock` entries (not `TextBlock`)

### Server-Side Enhancements

**Sequence indices**: The Python backend should send an explicit `seq` on chunk and content_block events:

```json
{ "event": "chunk", "data": { "text": "Hello", "seq": 0 } }
{ "event": "content_block", "data": { "blockId": "...", "seq": 1, "type": "flashcards", "status": "streaming" } }
{ "event": "chunk", "data": { "text": " world", "seq": 2 } }
{ "event": "content_block", "data": { "blockId": "...", "seq": 1, "type": "flashcards", "status": "complete", "data": {...} } }
```

**Pre-parsed blocks**: When Python parses content (flashcards, quiz, etc.), it sends `content_block` events with `data` populated. The client stores these directly as `ArtifactBlock` entries with `data` set — no client-side re-parsing needed.

**Completion flag**: `status: "streaming" | "complete" | "error"` on every `content_block` event maps directly to `ArtifactBlock.isComplete`. The renderer shows a skeleton for `isComplete: false` and the full component for `isComplete: true`.

### DB Loading (using existing `lib/chat-protocol/from-db.ts`)

`buildCanonicalMessages()` already handles text, thinking, media, tool_call, code_exec, code_result, and web_search blocks. Extend it to:
1. Run `splitContentIntoBlocksV2` on `TextBlock.content` to extract embedded artifact tags
2. Produce `ArtifactBlock` entries for detected structured content
3. Return `RenderBlock[]` (extended CanonicalBlock) that can be stored directly on the turn

Alternatively, keep the text parsing at the renderer level (simpler change, same result).

### Streaming Accumulation

During streaming, `buildCanonicalBlocks()` from `lib/chat-protocol/from-stream.ts` (extended) runs on every event batch:

- `chunk` events → append to / create TextBlock (consecutive chunks merge)
- `reasoning_chunk` events → append to / create ThinkingBlock
- `content_block` events → create / update ArtifactBlock (with isComplete from status)
- `tool_event` events → create / update ToolCallBlock (with phase from sub-event)

On commit, the `RenderBlock[]` array is copied directly to the turn. **No lossy text concatenation. No separate contentBlocks field. No reasoning loss.**

### Rendering

`EnhancedChatMarkdown` receives `renderBlocks: RenderBlock[]` — a single ordered array. It iterates in order:
- `TextBlock` → call `splitContentIntoBlocksV2(block.content)` to detect embedded artifacts, then render each sub-block
- `ThinkingBlock` → render reasoning visualization
- `ArtifactBlock` → if `block.data` exists, pass structured data directly to the block component; else pass `block.content` for client-side secondary parsing
- `ToolCallBlock` → render tool call visualization
- `MediaBlock` → render audio/image/video
- `ErrorBlock` → render error display

**No merge. No concatenation. No `[...textBlocks, ...supplementaryBlocks]`. Just iterate.**

---

## 16. Migration Plan

### Phase 0: Dead Code Removal (unblocks everything)
1. Delete `lib/redux/socket-io/` (32 files) — connection returns null, complete dead code
2. Remove deprecated slices from root reducer: `conversation`, `messages`, `newMessage`, `chatDisplay`, `aiChat`
3. Delete `features/public-chat/context/DEPRECATED-ChatContext.tsx`
4. Audit `promptExecution` — if no active consumers, remove
5. **This is safe and immediate** — none of this code is reachable

### Phase 1: Extend the Canonical Protocol
1. Add `ArtifactBlock` to the `CanonicalBlock` union in `lib/chat-protocol/types.ts`
2. Update `buildCanonicalBlocks()` in `from-stream.ts` to handle `content_block` events → `ArtifactBlock`
3. Update `buildCanonicalMessages()` in `from-db.ts` to handle embedded artifact tags in text blocks (call `splitContentIntoBlocksV2` or just preserve text for renderer-level parsing)
4. Add `isComplete` / streaming status support to `ArtifactBlock`
5. Extract `buildToolCallObjects()` from `ToolRendererPreview.tsx` → `lib/tool-renderers/build-tool-call-objects.ts`
6. Update type guards and barrel exports

### Phase 2: Wire the Active Pipeline
1. Add `renderBlocks: RenderBlock[]` to `ConversationTurn` type (keep `content` + `contentBlocks` temporarily)
2. Update `commitAssistantTurn` to build `renderBlocks` using `buildCanonicalBlocks()` from the active request timeline — this replaces the lossy `content + contentBlocks` split
3. Update `fetchConversationHistory` to use `buildCanonicalMessages()` from `lib/chat-protocol/from-db.ts` — also fetch `cx_tool_call` records
4. Update `addUserTurn` to produce `renderBlocks` for user messages
5. Update `loadConversationHistory` reducer to accept `CanonicalMessage[]` and map to `ConversationTurn[]` with `renderBlocks`
6. Delete `normalize-content-blocks.ts` — no longer needed

### Phase 3: Simplify the Renderer
1. Update `AgentAssistantMessage` to pass `turn.renderBlocks` directly instead of `content + serverProcessedBlocks`
2. Update `EnhancedChatMarkdown` to accept `renderBlocks: RenderBlock[]` as primary input
3. Remove the `useMemo` merge logic (`[...textBlocks, ...supplementaryBlocks]`)
4. For `TextBlock` entries, still call `splitContentIntoBlocksV2` to detect embedded artifacts (unless Python already parsed them)
5. For `ArtifactBlock` entries with `data`, pass structured data directly to the block component
6. For `ToolCallBlock` entries, convert to `ToolCallObject[]` via the extracted builder and pass to `ToolCallVisualization`
7. Remove `BlockRenderingContext` / `strictServerData` — move to dev tools

### Phase 4: Deprecate System B
1. Migrate remaining `/a/` routes to use System A components and `instanceConversationHistory`
2. Remove `chatConversations` slice and `features/cx-conversation/redux/`
3. Create one shared conversation loading service backed by `buildCanonicalMessages()`
4. Both SSR chat and any future public chat use this single service

### Phase 5: Server-Side Enhancements
1. Add `seq` field to chunk, reasoning_chunk, and content_block events for ordering insurance
2. Ensure `content_block` events carry `status: "streaming" | "complete"` consistently
3. When Python pre-parses artifact content (flashcards, quiz, etc.), send the structured `data` field on the content_block event so client can skip secondary parsing
4. Ensure `cx_message.content` array preserves strict emission ordering
5. Consider merging `reasoning_chunk` into `chunk` with a `chunk_type` discriminator (simplifies the canonical protocol)

### Phase 6: Cleanup
1. Remove deprecated `content` and `contentBlocks` fields from `ConversationTurn`
2. Remove `adapters.ts` from `lib/chat-protocol/` (legacy bridge no longer needed)
3. Remove duplicate conversion paths (cx-content-converter.ts, tool-event-engine.ts, etc.)
4. Update all documentation to reflect the single-pipeline architecture

---

## Appendix A: File Index

| Category | File | Purpose |
|---|---|---|
| **Canonical Protocol** | `lib/chat-protocol/types.ts` | CanonicalMessage, CanonicalBlock union, StreamingState — **the target architecture** |
| **Canonical Protocol** | `lib/chat-protocol/from-stream.ts` | `buildCanonicalBlocks()` — StreamEvent[] → ordered CanonicalBlock[] |
| **Canonical Protocol** | `lib/chat-protocol/from-db.ts` | `buildCanonicalMessages()` — CxMessage[] + CxToolCall[] → CanonicalMessage[] |
| **Canonical Protocol** | `lib/chat-protocol/adapters.ts` | `canonicalToLegacy()` — bridge to old formats (deprecated) |
| **Canonical Protocol** | `lib/chat-protocol/README.md` | Full architecture docs, usage, migration plan, tool state contract |
| **Types** | `types/python-generated/stream-events.ts` | 16 event types, TypedStreamEvent union, type guards |
| **Types** | `types/python-generated/content-blocks.ts` | BlockType enum (34 types), BlockDataTypeMap, ContentBlockPayload |
| **Stream** | `lib/api/stream-parser.ts` | `parseNdjsonStream` read-ahead queue parser |
| **Stream** | `features/agents/redux/execution-system/thunks/process-stream.ts` | Event routing loop, commit logic |
| **Redux** | `features/agents/redux/execution-system/active-requests/active-requests.slice.ts` | Live streaming state |
| **Redux** | `features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.slice.ts` | Committed conversation turns |
| **Redux** | `features/cx-conversation/redux/slice.ts` | Legacy `chatConversations` (System B) — to be removed |
| **DB** | `features/cx-chat/redux/thunks.ts` | `fetchConversationHistory` — System A DB loading (should use from-db.ts) |
| **Normalize** | `features/agents/redux/execution-system/utils/normalize-content-blocks.ts` | DbContentEntry → ContentBlockPayload (to be replaced by from-db.ts) |
| **Render** | `components/mardown-display/chat-markdown/EnhancedChatMarkdown.tsx` | Block splitting + rendering orchestration |
| **Render** | `components/mardown-display/chat-markdown/block-registry/BlockRenderer.tsx` | 40+ block type switch |
| **Render** | `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` | Lazy-loaded block components |
| **Render** | `components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts` | Markdown → render blocks parser |
| **Demo (extract)** | `app/(public)/demos/api-tests/tool-testing/utils/stream-processing-beta/fold-stream-events.ts` | Complete event fold with tool mapping — should be extracted |
| **Demo (extract)** | `app/(public)/demos/api-tests/tool-testing/utils/stream-processing-beta/build-tool-call-objects.ts` | Stream events → ToolCallObject[] — should be extracted |
| **Orchestrator** | `features/cx-chat/components/ChatInstanceManager.tsx` | Instance creation + history load |
| **Display** | `features/agents/components/run/AgentConversationDisplay.tsx` | Turn list rendering |
| **Display** | `features/agents/components/run/AgentAssistantMessage.tsx` | Single message rendering (streaming + committed) |
| **Docs** | `features/agents/redux/execution-system/thunks/event-change-documentation.md` | V2 protocol reference |
| **Docs** | `features/agents/docs/analysis-future/sample-message-chain.md` | Full DB→Stream→Render example with tool calls |
