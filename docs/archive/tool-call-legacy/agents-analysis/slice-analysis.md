Now I have a comprehensive picture. Let me compile the complete analysis.

---

Here is the comprehensive map of **all Redux slices storing conversation/message data** in this codebase. I've organized them from **actively used** to **deprecated**, with overlap analysis at the end.

---

## SLICE 1: `instanceConversationHistory` (PRIMARY — Agent Execution System)

**File:** `features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.slice.ts`
**Selectors:** `features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.selectors.ts`

**Key:** `conversationId` (client-generated, used as instance identifier)

**State interface:**

```1:142:features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.slice.ts
// ... types above ...
export interface InstanceConversationHistoryState {
  byConversationId: Record<string, InstanceConversationHistoryEntry>;
}
```

Per-entry shape (`InstanceConversationHistoryEntry`):

```119:138:features/agents/redux/execution-system/instance-conversation-history/instance-conversation-history.slice.ts
export interface InstanceConversationHistoryEntry {
  conversationId: string;
  mode: ConversationMode; // "agent" | "conversation" | "chat"
  turns: ConversationTurn[];
  loadedFromHistory: boolean;
  title: string | null;
  description: string | null;
  keywords: string[] | null;
}
```

Each turn (`ConversationTurn`) stores: `turnId`, `role`, `content`, `contentBlocks` (multimodal), `timestamp`, `requestId`, `conversationId` (server), `tokenUsage`, `finishReason`, `completionStats`, `clientMetrics`, `systemGenerated`, `errorMessage`, plus DB fields like `cxMessageId`, `agentId`, `position`, etc.

**Data stored:** Full conversation turns (text + multimodal content blocks + stats + DB mirror fields)

**Actions (9):** `initInstanceHistory`, `addUserTurn`, `commitAssistantTurn`, `attachClientMetrics`, `loadConversationHistory`, `setTurnContentBlocks`, `setConversationLabel`, `clearHistory`, `removeInstanceHistory`

**Selectors (13):** `selectConversationTurns`, `selectTurnByTurnId`, `selectConversationMode`, `selectStoredConversationId`, `selectTurnCount`, `selectHasConversationHistory`, `selectLoadedFromHistory`, `selectLatestCompletionStats`, `selectAggregateStats`, `selectLatestClientMetrics`, `selectAggregateClientMetrics`, `selectConversationTitle`, `selectConversationDescription`, `selectConversationKeywords`

---

## SLICE 2: `chatConversations` (PRIMARY — CX Conversation UI)

**File:** `features/cx-conversation/redux/slice.ts`
**Types:** `features/cx-conversation/redux/types.ts`
**Selectors:** `features/cx-conversation/redux/selectors.ts`

**Key:** `sessionId` (client-generated UUID, independent from conversationId)

**State interface:**

```225:237:features/cx-conversation/redux/types.ts
export interface ChatConversationsState {
  sessions: Record<string, ConversationSession>;
  currentInputs: Record<string, string>;
  resources: Record<string, Resource[]>;
  uiState: Record<string, SessionUIState>;
}
```

Per-session (`ConversationSession`):

```181:219:features/cx-conversation/redux/types.ts
export interface ConversationSession {
  sessionId: string;
  conversationId: string | null; // DB UUID from X-Conversation-ID header
  agentId: string;
  apiMode: ApiMode; // "agent" | "conversation" | "chat"
  chatModeConfig: ChatModeConfig | null;
  status: SessionStatus;
  error: string | null;
  variableDefaults: PromptVariable[];
  requiresVariableReplacement: boolean;
  messages: ConversationMessage[];
  toolCallsById: Record<string, CxToolCall>;
  createdAt: number;
  updatedAt: number;
}
```

Each message (`ConversationMessage`) stores: `id`, `role`, `content`, `status`, `timestamp`, `rawContent` (DB blocks), `dbRole`, `dbStatus`, `conversationId`, `position`, `agentId`, `source`, `contentHistory`, `originalDisplayContent`, `streamEvents`, `toolUpdates`, `rawToolCalls`, `isCondensed`, `resources`, `metadata`

**Data stored:** Full session state with messages, streaming state, tool calls, variables, resources, UI state

**Actions (19):** `startSession`, `loadConversation`, `removeSession`, `setSessionStatus`, `setConversationId`, `addMessage`, `updateMessage`, `appendStreamChunk`, `pushStreamEvent`, `clearMessages`, `setCurrentInput`, `updateVariable`, `setExpandedVariable`, `addResource`, `removeResource`, `clearResources`, `updateUIState`, `setModelOverride`, `resetMessageContent`, `applyMessageHistory`

**Selectors (30+):** `selectSession`, `selectSessionStatus`, `selectMessages`, `selectGroupedMessages`, `selectIsStreaming`, `selectCurrentInput`, `selectResources`, `selectVariableDefaults`, `selectUIState`, `selectEffectiveModelId`, `selectToolCallsById`, `selectToolCallByCallId`, `selectMessageRawToolCalls`, `selectMessageContentHistory`, `selectMessageHasUnsavedChanges`, `selectDirtyMessages`, etc.

---

## SLICE 3: `activeRequests` (Streaming/Request Lifecycle)

**File:** `packages/chat/src/agents/redux/execution-system/active-requests/active-requests.slice.ts`

**Key:** `requestId` (per API call), indexed by `conversationId`

**State interface:**

```56:59:packages/chat/src/agents/redux/execution-system/active-requests/active-requests.slice.ts
export interface ActiveRequestsState {
  byRequestId: Record<string, ActiveRequest>;
  byConversationId: Record<string, string[]>;
}
```

**Data stored:** Per-request streaming data: `textChunks`, `accumulatedText`, `reasoningChunks`, `accumulatedReasoning`, `contentBlocks`, `toolLifecycle`, `pendingToolCalls`, `completion`, `warnings`, `infoEvents`, `reservations`, `dataPayloads`, `timeline`, `rawEvents`, `clientMetrics`, plus status and timing fields.

**Actions (26):** `createRequest`, `setRequestStatus`, `setConversationId`, `appendChunk`, `finalizeAccumulatedText`, `appendReasoningChunk`, `setCurrentPhase`, `upsertContentBlock`, `upsertToolLifecycle`, `addPendingToolCall`, `resolveToolCall`, `setCompletion`, etc.

---

## SLICE 4: `activeChat` (Chat Page State Coordinator)

**File:** `lib/redux/slices/activeChatSlice.ts`

**Key:** `sessionId` (references a `chatConversations` session)

**State interface:**

```60:85:lib/redux/slices/activeChatSlice.ts
interface ActiveChatState {
  sessionId: string | null;
  selectedAgent: ActiveChatAgent;
  isAgentPickerOpen: boolean;
  isBlockMode: boolean;
  firstMessage: FirstMessage | null;
  modelOverride: string | null;
  modelSettings: PromptSettings;
  agentDefaultSettings: PromptSettings;
  messageContext: Record<string, unknown>;
}
```

**Data stored:** NOT messages directly — stores the active session pointer, selected agent config, queued first message, model settings, and deferred context objects. Acts as a coordinator between the welcome screen and `chatConversations`.

---

## SLICE 5: `cxConversations` (Sidebar Conversation List)

**File:** `features/cx-chat/redux/cx-conversations.slice.ts`
**Types:** `features/cx-chat/redux/types.ts`

**Key:** `id` (conversation UUID from DB)

**State interface:**

```74:92:features/cx-chat/redux/types.ts
export interface CxConversationsState {
  items: CxConversationListItem[];
  status: CxConversationListStatus;
  error: string | null;
  hasMore: boolean;
  lastFetchedAt: number | null;
  pendingOperations: Set<string>;
}
```

**Data stored:** Sidebar list metadata only (id, title, updatedAt, messageCount, status). Explicitly does NOT own messages.

---

## SLICE 6: `agentConversations` (Agent Builder Conversation List)

**File:** `features/agents/redux/agent-conversations/agent-conversations.slice.ts`
**Types:** `features/agents/redux/agent-conversations/agent-conversations.types.ts`

**Key:** `cacheKey` = `{agentId}::all` or `{agentId}::v{N}`

**State interface:**

```10:12:features/agents/redux/agent-conversations/agent-conversations.slice.ts
export interface AgentConversationsState {
  byCacheKey: Record<string, AgentConversationsCacheEntry>;
}
```

**Data stored:** Per-agent conversation list metadata (conversationId, title, description, messageCount, version, status). Another sidebar-style list — no message content.

---

## SLICE 7: `messageActions` (Message Action Bar Context)

**File:** `features/cx-conversation/redux/messageActionsSlice.ts`

**Key:** Instance id (string)

**State interface:**

```28:30:features/cx-conversation/redux/messageActionsSlice.ts
export interface MessageActionsState {
  instances: Record<string, MessageActionInstance>;
}
```

Each instance: `content`, `messageId`, `sessionId`, `conversationId`, `rawContent`, `metadata`

**Data stored:** Snapshot of message content for action overlays (Save to Notes, Email, etc.). Ephemeral — registered on hover/click, unregistered on leave.

---

## SLICE 8: `agentAssistantMarkdownDraft` (Markdown Edit Drafts)

**File:** `packages/chat/src/agents/redux/agent-assistant-markdown-draft.slice.ts`

**Key:** `{conversationId}::{messageKey}`

**Data stored:** Draft edits of assistant message markdown content. `baseContent`, `draftContent`, `updatedAt`.

---

## SLICE 9: `instanceUserInput` (User Input Drafts — Agent System)

**File:** `packages/chat/src/agents/redux/execution-system/instance-user-input/instance-user-input.slice.ts`

**Key:** `conversationId`

**Data stored:** The text and content blocks the user is currently composing for each agent instance. Analogous to `chatConversations.currentInputs` but for the agent system.

---

## SLICE 10: `conversationFocus` (Surface Focus Registry)

**File:** `packages/chat/src/agents/redux/execution-system/conversation-focus/conversation-focus.slice.ts`

**Key:** `surfaceKey` (e.g. `"agent-builder"`, `"overlay:<id>"`)

**Data stored:** Just a `surfaceKey → conversationId` mapping. No message data.

---

## SLICE 11: `instanceUIState` (Agent Instance Display Config)

**File:** `packages/chat/src/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice.ts`

**Key:** `conversationId`

**Data stored:** Display configuration per instance (displayMode, autoRun, allowChat, showVariablePanel, hideReasoning, hideToolResults, jsonExtraction config, etc.). No message content.

---

## SLICE 12: `promptExecution` (OLD — Legacy Prompt Runner)

**File:** `lib/redux/prompt-execution/slice.ts`
**Types:** `lib/redux/prompt-execution/types.ts`

**Key:** `runId` (unique per execution instance)

**State interface:**

```192:222:lib/redux/prompt-execution/types.ts
export interface PromptExecutionState {
  instances: Record<string, ExecutionInstance>;
  currentInputs: Record<string, string>;
  resources: Record<string, Resource[]>;
  uiState: Record<string, InstanceUIState>;
  dynamicContexts: { ... };
  runsByPromptId: { ... };
  // ...
}
```

Each `ExecutionInstance` stores `messages: ConversationMessage[]` with role, content, taskId, timestamp, metadata.

**Data stored:** Full execution instances with conversation history, variables, settings, dynamic contexts. **Structurally very similar to `chatConversations`** — this appears to be the predecessor.

---

## DEPRECATED SLICES (from `lib/redux/features/aiChats/`)

These are explicitly marked `OLD AI CHAT SYSTEM (DEPRECATED)` in the root reducer.

### SLICE 13: `conversation` (DEPRECATED)

**File:** `lib/redux/features/aiChats/conversationSlice.ts`
**Key:** Single global `conversationId`
**Data stored:** Global conversation metadata (conversationId, label, model, mode, brokerValues). No message array.

### SLICE 14: `messages` (DEPRECATED)

**File:** `lib/redux/features/aiChats/messagesSlice.ts`
**Key:** `id` (normalized entity pattern: `byId` + `allIds`)
**Data stored:** `MessageRecordWithKey` — role, content, conversationId, displayOrder, systemOrder, metadata.

### SLICE 15: `newMessage` (DEPRECATED)

**File:** `lib/redux/features/aiChats/newMessageSlice.ts`
**Key:** Single global message being composed
**Data stored:** One message draft (id, conversationId, role, content, type, displayOrder).

### SLICE 16: `chatDisplay` (DEPRECATED)

**File:** `lib/redux/features/aiChats/chatDisplaySlice.ts`
**Key:** Flat array of messages
**Data stored:** Simple `ChatMessage[]` — role, content, tempId/id. Used for streaming display.

### SLICE 17: `aiChat` (DEPRECATED)

**File:** `lib/redux/slices/aiChatSlice.ts`
**Key:** `chatId` (UUID)
**Data stored:** `Record<string, Chat>` where each Chat has `messages: Message[]` with multimodal `ContentPart[]`.

### SLICE 18: `flashcardChat` (Domain-Specific)

**File:** `lib/redux/slices/flashcardChatSlice.ts`
**Key:** `flashcardId`
**Data stored:** Per-flashcard `ChatMessage[]` — domain-specific, not general conversation data.

---

## REACT CONTEXT (Non-Redux)

### `DEPRECATED-ChatContext` (DEPRECATED)

**File:** `features/public-chat/context/DEPRECATED-ChatContext.tsx`

**State interface:**

```55:69:features/public-chat/context/DEPRECATED-ChatContext.tsx
export interface ChatState {
  conversationId: string;
  dbConversationId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  isExecuting: boolean;
  error: { type: string; message: string } | null;
  currentAgent: AgentConfig | null;
  settings: ChatSettings;
  modelOverride?: string;
  useLocalhost: boolean;
  isBlockMode: boolean;
}
```

Uses `useReducer` internally with actions: `ADD_MESSAGE`, `UPDATE_MESSAGE`, `SET_STREAMING`, `CLEAR_MESSAGES`, `LOAD_CONVERSATION`, etc. This stores messages as `ChatMessage[]` with id, role, content, status, resources, toolUpdates, streamEvents, isCondensed.

**Marked DEPRECATED in the filename** — likely being replaced by the `chatConversations` Redux slice.

No other active `createContext` calls related to chat/conversation/message/streaming were found.

---

## OVERLAP AND DUPLICATION ANALYSIS

### Active Overlap: `instanceConversationHistory` vs `chatConversations`

This is the **most significant overlap**. Both store conversation messages with role/content/status for active chat sessions:

| Aspect | `instanceConversationHistory` | `chatConversations` |
|---|---|---|
| Key | `conversationId` | `sessionId` |
| Message type | `ConversationTurn` | `ConversationMessage` |
| Used by | Agent builder, agent runner, shortcuts, overlays | `/a/` chat route, cx-chat feature |
| Streaming | Via `activeRequests` (separate slice) | Inline via `appendStreamChunk`, `pushStreamEvent` |
| Tool calls | Via `activeRequests.toolLifecycle` | Via `toolCallsById` + `rawToolCalls` on messages |
| DB persistence | Mirrors `cx_message` fields on turns | Stores `rawContent`, `dbRole`, `dbStatus`, `contentHistory` |
| Edit/history | Basic (isEdited, originalContent) | Full (contentHistory, originalDisplayContent, applyMessageHistory) |
| Input draft | `instanceUserInput` (separate slice) | `currentInputs` (same slice, separate map) |
| Resources | `instanceResources` (separate slice) | `resources` (same slice, separate map) |

**They store the same data in different shapes for different UI surfaces.** The agent system (`instanceConversationHistory`) is used by the agent builder/runner. The cx-conversation system (`chatConversations`) is used by the `/a/` chat page and the cx-chat feature.

### Deprecated Overlap

All 5 deprecated slices (`conversation`, `messages`, `newMessage`, `chatDisplay`, `aiChat`) duplicate what `chatConversations` now does — they were the original socket.io-based chat system. They remain registered in the root reducer but are likely unused by active features.

### `promptExecution` vs `chatConversations`

The `promptExecution` slice is structurally almost identical to `chatConversations` (instances keyed by runId, each with messages[], variables, settings, input, resources, UI state). It appears to be the earlier version that was replaced by `chatConversations` for the `/a/` chat route.

### Summary of Message Storage Points

| Store Location | Active? | Key Type | Stores Messages? |
|---|---|---|---|
| `instanceConversationHistory` | **Active** | conversationId | Yes — `ConversationTurn[]` |
| `chatConversations` | **Active** | sessionId | Yes — `ConversationMessage[]` |
| `activeRequests` | **Active** | requestId | Yes — streaming chunks/text accumulation |
| `messageActions` | **Active** | instanceId | Yes — message content snapshots (ephemeral) |
| `agentAssistantMarkdownDraft` | **Active** | conversationId::key | Yes — markdown edit drafts |
| `promptExecution` | Semi-active | runId | Yes — `ConversationMessage[]` |
| `DEPRECATED-ChatContext` | Deprecated | Context | Yes — `ChatMessage[]` |
| `conversation` | Deprecated | single global | No — metadata only |
| `messages` | Deprecated | byId/allIds | Yes — `MessageRecordWithKey` |
| `newMessage` | Deprecated | single global | Yes — one draft message |
| `chatDisplay` | Deprecated | flat array | Yes — `ChatMessage[]` |
| `aiChat` | Deprecated | chatId | Yes — `Message[]` per chat |
| `flashcardChat` | Domain-specific | flashcardId | Yes — `ChatMessage[]` per flashcard |