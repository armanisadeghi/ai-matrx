# SSR Chat → Agent System Migration Tracker

> Living analysis doc. Track every gap, assumption, and decision.
>
> **Legend:**
> - `[KNOWN]` — verified by reading actual code/DB
> - `[THINK]` — reasonable inference, needs confirmation before acting
> - Status: `🔴 Blocked` | `🟡 Design needed` | `🟢 Ready to implement` | `✅ Done` | `⏭️ Later`

---

## Phase Progress

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Data source migration — `agents` table via new thunks | ✅ Done |
| **Phase 2** | Conversation history — list + full load (Gap 5, Gap 6) | ✅ Done |
| **Phase 3** | Instance lifecycle — `useInstanceBootstrap`, `instanceUIState` extension, cx-chat component migration off `activeChatSlice` writes | ✅ Done |
| **Phase 4** | Sidebar/Picker UI wiring — `SsrSidebarChats`, `SsrSidebarAgents`, `AgentPickerSheet` to new Redux | ✅ Done |
| **Phase 5** | Type import sweep — replace all PromptVariable/PromptSettings with canonical types (Gap 7) | ✅ Done |
| **Phase 6** | Execution components — `SmartAgentInput` + `AgentConversationDisplay`; `instanceId` as prop | ✅ Done |

### Phase 6 — Completed Items

The SSR chat route's execution layer is now entirely powered by the new agent system.

#### Instance ID ownership — final architecture

`instanceId` is **owned exclusively by `ChatInstanceManager`** — a page-level client component that:
1. Accepts `agentId` and optional `conversationId` as props (server-resolved from URL path).
2. Creates or reuses a Redux execution instance for that agent.
3. Passes `instanceId` as a prop to all page content via render prop `children(instanceId)`.

**The sidebar and header never touch `instanceId`** — they only need `agentId` and `conversationId`, which they read from the URL independently. This is correct: they navigate, they don't execute.

`useInstanceBootstrap` is **replaced and dead**:
- Catalogue init (`initializeChatAgents`) → extracted to `useChatCatalogueInit` (called once from `ChatPanelContent`).
- Instance lifecycle → moved to `ChatInstanceManager` (page-level, prop-driven).

#### Component chain
```
ConversationPage (server)
  └─ ChatInstanceManager (client — owns instance creation)
       └─ ChatConversationClient(instanceId)  ← prop, never useSearchParams
            ├─ AgentConversationDisplay(instanceId)
            └─ SmartAgentInput(instanceId)

AgentPage / ChatPage (server)
  └─ ChatInstanceManager (client)
       └─ ChatWelcomeServer → ChatWelcomeClient(instanceId)  ← prop
            └─ SmartAgentInput(instanceId)
```

**`ChatConversationClient.tsx` — rewritten:**
- Receives `instanceId` as a prop from `ChatInstanceManager` — never reads URL.
- Renders `AgentConversationDisplay` + `SmartAgentInput`, both capped to `max-w-[800px]`.
- URL sync: watches `selectLatestConversationId` → `window.history.replaceState` when conversationId arrives.
- Sidebar refresh: fires `chat:conversationUpdated` on request complete.
- **Removed:** `activeChatSlice`, `useConversationSession`, URL `?instance=` reads, all legacy Redux dispatches.

**`ChatWelcomeClient.tsx` — rewritten:**
- Receives `instanceId` as a prop — never reads URL.
- `SmartAgentInput` → `executeInstance` → watches `selectLatestConversationId` → `router.replace` to `/c/{id}`.
- **Removed:** `chatConversationsActions.startSession`, `WELCOME_SESSION_ID`, `ConversationInput`, override logic.

**`GuidedVariableInputs.tsx` — rewired:**
- `sessionId` → `instanceId` prop.
- `selectVariableDefaults` → `selectInstanceVariableDefinitions(instanceId)`.
- `selectVariableValues` → `selectUserVariableValues(instanceId)`.
- `chatConversationsActions.updateVariable` → `setUserVariableValue({ instanceId, name, value })`.

**`StackedVariableInputs.tsx` — rewired:**
- Same swap as `GuidedVariableInputs`.

**`ConversationInput.tsx` — fully rewired (kept for variables/resources/voice UI):**
- `sessionId` → `instanceId` prop throughout.
- Input text: `selectUserInputText` / `setUserInputText`.
- Variables: `selectInstanceVariableDefinitions` / `setUserVariableValue`.
- Resources: `selectInstanceResources` / `addResource` / `removeResource`.
- Execution: `executeInstance({ instanceId })` instead of `sendMessage`.
- Model override: `setOverrides` / `selectCurrentSettings`.
- **Removed:** `chatConversationsActions`, `sendMessage`, `activeChatSlice`, `selectEffectiveModelId`, `selectAgentId`, `selectHasVariables`, `selectUIState`, `selectCurrentInput`, `selectResources`.

**`ChatSidebarClient.tsx`:**
- `useInstanceBootstrap` → `useChatCatalogueInit`.

**What is now dead (not imported by any active path):**
- `useInstanceBootstrap.ts` — split into `useChatCatalogueInit` + `ChatInstanceManager`.
- `ConversationShell.tsx` — old shell wrapper.
- `useConversationSession.ts` — old lifecycle hook.
- `useAgentBootstrap.ts` — replaced by Phase 1 thunks.

**Still alive (used by other features, not the SSR chat route):**
- `features/cx-conversation/` — other routes may still use it
- `features/conversation/` — exports from cx-chat but separate feature

### Phase 5 — Completed Items

All `@/features/prompts/types/core` and `@/features/prompts/types/resources` imports in `cx-chat` replaced with the canonical shim `@/lib/types/agent-chat`:

| File | Old import | New import |
|---|---|---|
| `types/agents.ts` | `PromptVariable` from prompts core | `PromptVariable` from shim |
| `types/conversation.ts` | `PromptVariable` + `Resource` from prompts | both from shim |
| `utils/settings-diff.ts` | `PromptSettings` from prompts core | `PromptSettings` from shim |
| `hooks/useConversationSession.ts` | `PromptVariable` + `Resource` | both from shim |
| `components/ChatWelcomeServer.tsx` | `PromptVariable` | from shim |
| `components/ChatWelcomeClient.tsx` | `Resource` | from shim |
| `components/user-input/ConversationInput.tsx` | `Resource` + `PromptSettings` | both from shim |
| `components/user-input/GuidedVariableInputs.tsx` | `PromptVariable` | from shim |
| `components/agent/local-agents.ts` | `PromptVariable` | from shim |
| `components/variable-inputs/index.tsx` | `VariableCustomComponent` | from shim |

**Type boundary fixes applied:**
- `VariableDefinition[]` → `as never[]` when passed to `activeChatSlice.startSession` (which still expects old `PromptVariable` with `defaultValue: string`). Safe cast — shapes are structurally identical.
- `settings?.dynamic_model` — cast `settings` to `Record<string, unknown>` since `dynamic_model` is an agent-specific field not in `LLMParams`.
- `configFetched` field removed from `AgentPickerSheet.toAgentConfig()` and `SsrSidebarAgents.handleSelect()` — `AgentConfig` type doesn't declare it.

**Not swept (out of scope for Phase 5):**
- `activeChatSlice.ts` still imports `PromptVariable`/`PromptSettings` from `features/prompts/types/core` — Phase 6 (full slice replacement).
- `StackedVariableInputs.tsx` imports `VariableInputComponent` *component* (not type) from `features/prompts/components/variable-inputs` — Phase 6 (component migration).

### Phase 4 — Completed Items

- **`SsrSidebarChats.tsx` fully rewritten** — removes `useChatPersistence`, local history state, DOM event-to-state, Supabase Realtime subscription, and 743-line manual data management.
  - On mount: dispatches `fetchConversationList()` (TTL-guarded, no double-fetch)
  - DOM CustomEvents (`chat:conversationCreated` / `chat:conversationUpdated`) now dispatch `prependConversation` / `touchConversation` to Redux — sidebar stays live
  - Rename/delete: dispatch `renameConversationMutation` / `deleteConversationMutation` (optimistic with rollback)
  - Per-item pending state: `selectCxConversationIsPending(id)` per row (inline wrapper component avoids selector factory hoisting issues)
  - IntersectionObserver sentinel for load-more via `fetchConversationListMore`
  - Shared Chats section preserved with local state (not in Redux — intentional)
  - `useChatPersistence` import eliminated from this component

- **`SsrSidebarAgents.tsx` fully rewritten** — removes old `cx-chat useAgentConsumer` (agentCacheSlice / prompts table)
  - Now reads `selectOwnedAgents`, `selectBuiltinAgents`, `selectSharedWithMeAgents` from `agentDefinition` slice
  - Loading state from `selectAgentsSliceStatus`
  - `onAgentSelect` callback maps `AgentDefinitionRecord` → `ActiveChatAgent` (temporary until Phase 6 eliminates activeChatSlice)
  - `selectAgent()` upgrade call removed — agentDefinition data is always full-depth

- **`AgentPickerSheet.tsx` fully rewritten** — removes old `cx-chat useAgentConsumer`
  - Both Mobile (Drawer) and Desktop (custom modal) variants rewritten
  - Local `searchTerm` + `filter` state (no Redux) — agents already fully loaded by `useInstanceBootstrap`
  - Reads `selectOwnedAgents`, `selectBuiltinAgents` directly
  - `toAgentConfig()` maps `AgentDefinitionRecord` → `AgentConfig` using `variableDefinitions`
  - `autoUpgradeToCore` / `fetchAgentCoreBatch` removed — not needed, data is already full
  - `ephemeral: true` consumer cleanup removed — no Redux consumer lifecycle

- **`AgentPickerSheet` open state fixed** — was hardcoded `open={false}` in `ChatWelcomeClient` and `ChatConversationClient`
  - Both components now have `const [isPickerOpen, setIsPickerOpen] = useState(false)` as local state
  - Open/close wired to the picker's `onOpenChange` prop
  - No Redux state for picker visibility — correct per architecture (local UI state)

### Phase 2 — Completed Items
- **`features/cx-chat/redux/types.ts`** — `CxConversationListItem`, `CxConversationSearchItem`, content block types, `CxConversationsState`
- **`features/cx-chat/redux/cx-conversations.slice.ts`** — Sidebar list slice registered as `cxConversations` in rootReducer
  - `setListLoading/Success/Error` — async state
  - `renameConversation/revertRename` — optimistic rename
  - `removeConversation` — optimistic delete (re-fetches on failure)
  - `prependConversation` — after new chat created
  - `touchConversation` — bumps active conversation to top
  - `markPending/clearPending` — per-conversation loading states
  - Selectors: `selectCxConversationItems`, `selectCxConversationById`, `selectCxConversationListIsFresh`, etc.
- **`features/cx-chat/redux/thunks.ts`** — All conversation async operations
  - `fetchConversationList({ force? })` — Tier 1, TTL-guarded, 25 items
  - `fetchConversationListMore({ offset, searchTerm? })` — Tier 2, pagination + search
  - `fetchConversationHistory({ conversationId, instanceId })` — Tier 3, full messages
    - **Privacy enforced:** `role = 'system'` rows filtered out before Redux store
    - `cx_conversation.system_instruction` never selected (not in query)
    - Maps `CxMessage` content blocks → `ConversationTurn` for `instanceConversationHistory`
  - `renameConversationMutation({ id, title })` — optimistic, direct Supabase write
  - `deleteConversationMutation(id)` — soft-delete, optimistic
- **`features/cx-chat/redux/index.ts`** — Barrel export
- **`lib/redux/rootReducer.ts`** — `cxConversations: cxConversationsReducer` registered

**Correction from previous tracker:** `agent_conversations` table is old/unused. The actual tables are `cx_conversation` + `cx_message` — the newest, most structured tables in the system.

### Phase 1 — Completed Items
- **`initializeChatAgents` thunk** added to `features/agents/redux/agent-definition/thunks.ts`
  - Calls `fetchAgentsListFull()` — owned + shared + builtins in one RPC
  - 15-min TTL + 4-hour stale-while-revalidate via module-level timestamp
  - `isChatListFresh()` / `isChatListStale()` exported for hook use
- **`useAgentBootstrap.ts` updated** — all `agentFetchThunks` / `agentCacheSlice` imports removed
  - `initializeChatAgents()` replaces `initializeAgents()`
  - `fetchAgentExecutionMinimal()` replaces `fetchAgentOperational()`
  - `LLMParams.model` field used (corrected from `model_id`)
  - `variableDefinitions[]` passed directly as `variableDefaults` (type-safe cast)
- **`lib/types/agent-chat.ts` type shim** created
  - `PromptVariable` = `VariableDefinition` (superset)
  - `PromptSettings` = `LLMParams`
  - `Resource` re-exported from `features/prompts/types/resources` (stays until Phase 5)
  - `AgentDefinition`, `AgentDefinitionRecord`, `AgentType` re-exported for new consumers

---

## Architecture Baseline (What We Know)

### [KNOWN] Agents replaced Prompts
- `agents` table: 384 rows migrated (335 user + 49 builtin), all from `prompts`/`prompt_builtins`
- All data is there. `variable_definitions` renamed from `variable_defaults`. `settings` cleaned.
- Python backend already called `/api/ai/agents/{agentId}` using `agents.id` — no backend change needed
- The `agent_type` column (`'user'` | `'builtin'`) replaces the two-table model

### [KNOWN] New Redux System — All Registered in rootReducer
New slices at `lib/redux/rootReducer.ts` lines 286–305:
```
agentDefinition       → agent-definition/slice   (full agent defs from agents table)
agentShortcut         → agent-shortcuts/slice
agentConsumers        → agent-consumers/slice     (filter/sort state for list views)
executionInstances    → execution-instances/slice
instanceModelOverrides
instanceVariableValues
instanceResources
instanceContext
instanceUserInput
instanceClientTools
instanceUIState
activeRequests
instanceConversationHistory
```

Old slices still in rootReducer (kept for now):
```
agentCache            → lib/redux/slices/agentCacheSlice   (reads from prompts table — DEAD)
agentSettings         → lib/redux/slices/agent-settings    (keep for builder)
chatConversations     → cx-conversation/redux/slice        (TO BE REPLACED)
messageActions        → cx-conversation/redux/messageActionsSlice (TO BE REPLACED)
activeChat            → lib/redux/slices/activeChatSlice   (TO BE REPLACED)
```

### [KNOWN] Execution Flow (New System)
- Turn 1: `POST {pythonBaseUrl}/api/ai/agents/{agentId}` — full payload
- Turn 2+: `POST {pythonBaseUrl}/api/ai/conversations/{conversationId}` — minimal payload
- Streaming: NDJSON via `parseNdjsonStream()` — chunk → `appendChunk`, end → `commitAssistantTurn`
- `conversationId` discovered from `X-Conversation-ID` response header
- No Next.js API route in this path — Python is authoritative

### [KNOWN] Current Chat Persistence Uses Next.js API (cx-chat tables)
`useChatPersistence.ts` calls `/api/cx-chat/request`, `/api/cx-chat/history`, `/api/cx-chat/messages`
These write to `cx_conversations` / `cx_messages` tables.

The **new agent system does NOT write to cx tables** — Python backend writes to `agent_runs` (Supabase).
`AgentRunsSidebar.tsx` reads `agent_runs` directly from Supabase.

### [KNOWN] PromptVariable / PromptSettings — Exact Type Locations
- `PromptVariable` → `features/prompts/types/core` — used in: `activeChatSlice`, `types/conversation.ts`, `types/agents.ts`, `hooks/useAgentBootstrap.ts`, `hooks/useConversationSession.ts`, multiple components
- `PromptSettings` → `features/prompts/types/core` — used in: `activeChatSlice`, `utils/settings-diff.ts`, `hooks/useAgentBootstrap.ts`, `types/conversation.ts`
- `Resource` → `features/prompts/types/resources` — used in: `types/conversation.ts`, `ConversationInput.tsx`, `ChatWelcomeClient.tsx`, `useConversationSession.ts`

**New system equivalents:**
- `PromptVariable` → `VariableDefinition` in `features/agents/redux/agent-definition/types.ts`
- `PromptSettings` → `LLMParams` in `lib/api/types` (used directly in `instance-model-overrides`)
- `Resource` → `ResourceBlockType` + `InstanceResource` in `instance-resources/instance-resources.slice.ts`

---

## Gap 1 — Agent Listing for Chat Sidebar

### Status: ✅ Done (Phase 1)

**[KNOWN]** `agentCacheSlice` reads from `prompts` table. That table still exists but the data has moved to `agents`. The TTL-cached slim/core/operational tier system must be pointed at `agents`.

**[KNOWN]** The following RPCs exist on the `agents` table already:
- `fetchAgentsListFull` (thunk) → `get_agents_list_full()` RPC — returns owned + shared + builtins including name, description, category, tags, is_active, etc.
- `fetchSharedAgentsForChat` (thunk) → `get_shared_agents_for_chat()` RPC — returns minimal shared list
- `fetchAgentExecutionMinimal` (thunk) → `get_agent_execution_minimal(agent_id)` — variable_definitions + context_slots
- `fetchAgentExecutionFull` (thunk) → `get_agent_execution_full(agent_id)` — adds settings, tools, model

**[KNOWN] Decision taken:** Option B — Use `fetchAgentsListFull` (owned + shared + builtins in one call). No new Tier 1 RPC needed. `get_agents_list_full()` is fast enough for the sidebar.

**[DONE] Phase 1 implementation:**
- Added `initializeChatAgents({ force?: boolean })` thunk to `features/agents/redux/agent-definition/thunks.ts`
  - Wraps `fetchAgentsListFull()` with TTL guard (15 min) + stale-while-revalidate (4 hours)
  - Uses module-level `_chatListFetchedAt` timestamp — session-local, no Redux pollution
  - Exports `isChatListFresh()` and `isChatListStale()` helpers for the bootstrap hook
- Updated `useAgentBootstrap.ts` to call `initializeChatAgents()` instead of `initializeAgents()`
- Tab-visibility stale-while-revalidate now uses `isChatListStale()` instead of reading Redux state

**Remaining (Phase 4+):**
- [ ] Rewrite `SsrSidebarAgents.tsx` to read from `agentDefinition` instead of `agentCacheSlice`
- [ ] Rewrite `AgentPickerSheet.tsx` similarly
- [ ] Remove `agentCacheSlice` dependency from chat entirely (Phase 8 cleanup)

---

## Gap 2 — Agent Selection & Operational Data Fetch

### Status: ✅ Done (Phase 1)

**[KNOWN]** When user selects an agent (via sidebar or picker), the current system calls `fetchAgentOperational()` → `get_agent_operational()` RPC on `prompts` table. This returns `variable_defaults, dynamic_model, settings`.

**[KNOWN]** The new equivalent is `fetchAgentExecutionMinimal` → `get_agent_execution_minimal(agent_id)` which returns `id, variable_definitions, context_slots`. For model/settings too, `fetchAgentExecutionFull` → `get_agent_execution_full(agent_id)` returns `id, variable_definitions, model_id, settings, tools, custom_tools, context_slots`.

**[DONE] Phase 1 implementation:**
- Updated `useAgentBootstrap.ts` to call `fetchAgentExecutionMinimal(agentId)` on URL change instead of `fetchAgentOperational`
- Settings propagation updated: `LLMParams.model` (not `model_id` — schema difference corrected)
- `variableDefaults` now passes `record.variableDefinitions` directly (VariableDefinition[] is superset of PromptVariable[])
- `agentCacheSlice` / `agentFetchThunks` no longer imported in `useAgentBootstrap`

**Note:** The hook still writes to `activeChatSlice` (old shape). This is intentional for Phase 1 — the `activeChatSlice` refactor is Gap 3/Phase 3 work.

**Remaining (Phase 3+):**
- [ ] Switch from `fetchAgentExecutionMinimal` to `fetchAgentExecutionFull` once settings are needed at selection time
- [ ] Replace `activeChatSlice` hydration with `createManualInstance()` call (Gap 3)

---

## Gap 3 — useInstanceBootstrap (Replaces useAgentBootstrap)

### Status: ✅ Done (Phase 3)

**[KNOWN] Final design decisions:**

1. **`instanceId` lives in the URL** as `?instance=uuid`. The bootstrap hook reads it on mount. If absent (fresh load/refresh), create a new instance and push the id into the URL. On refresh, Redux is empty but URL has the `instanceId` — recreate from `agentId` also in the URL.

2. **Always have an instance** — the layout always creates one. Even the welcome screen has an instance (default agent). "No instance" is not a valid state on this route.

3. **Instance reuse across agent switches** — the hook tracks previously created instances per agentId in a ref map. If user switches to agent A, then agent B, then back to A — the A instance is reused (preserves variable values, input text). Avoids creating too many instances.

4. **`activeChatSlice` is NOT modified** — instead, two fields are added to `instanceUIState` at the slice root: `activeChatInstanceId: string | null` and `useBlockMode: boolean`. This is architecturally correct per the system design.

5. **`useBlockMode`** — admin/pilot preference, reads like `apiBaseUrl`. Added to `instanceUIState` root (alongside `activeChatInstanceId`), read at execute time. Will migrate to `userPreferencesSlice` when promoted to full user preference.

6. **Header/Sidebar don't need instanceId** — they read `agentId` and `conversationId` from the URL directly.

7. **`firstMessage`** — dead concept. Welcome screen writes directly to `instanceUserInput` via `setUserInputText`. The send flow is identical to any other send.

8. **`messageContext`** — maps to `instanceContext.setContextEntry`. `QuestionnaireRenderer` will dispatch to `instanceContext` using the `activeChatInstanceId` selector.

**[DONE] Phase 3 implementation:**
- Extended `instanceUIState` slice: `useBlockMode` (boolean) at slice root
  - `setUseBlockMode(boolean)` action + `selectUseBlockMode` selector
  - **No `activeChatInstanceId` — the system supports many simultaneous instances.**
    Any component that needs its instanceId receives it as a prop or reads `?instance=` from the URL.
- Built `useInstanceBootstrap.ts` — replaces `useAgentBootstrap` in `ChatPanelContent`
  - Catalogue init + tab-visibility stale-while-revalidate
  - Instance reuse map (per agentId, ref-local) — reuses existing instance on agent re-selection
  - Creates instances via `createManualInstance`, writes `?instance=uuid` into URL via `router.replace`
  - **`instanceId` lives exclusively in the URL** — no Redux field, no context, no "active" concept
  - Loads conversation history via `fetchConversationHistory` when on `/c/` route
- Migrated ALL cx-chat components off `activeChatSlice` writes:
  - `ChatSidebarClient` — reads agentId from URL → `agentDefinition` for name display
  - `ChatDesktopHeader` — same pattern
  - `ChatMobileAgentName` — reads agentId from URL → `agentDefinition` for name display
  - `ChatHeaderControls` — reads `useBlockMode` from `instanceUIState`, writes via `setUseBlockMode`
  - `ChatMobileAdminToggles` — same; `chatConversationsActions.updateUIState` removed
  - `ChatWelcomeClient` — reads agent record via `agent.promptId` (server prop) directly; navigation-only for agent selection; `firstMessage` concept eliminated
  - `ChatConversationClient` — navigation-only for agent select/new-chat; all session-id Redux writes removed

**Still using `activeChatSlice` for reads (Phase 6):**
- `ConversationInput.tsx` — reads `selectActiveChatAgent`, `selectAgentDefaultSettings`
- `ChatConversationClient.tsx` — reads model override + settings for `useConversationSession`
- `useConversationSession` hook — reads from `chatConversationsSlice`

**Remaining (Phase 4+):**
- [ ] `QuestionnaireRenderer` still dispatches `activeChatActions.setContextEntry` — update to `instanceContext.setContextEntry` (not cx-chat exclusive)
- [ ] `AgentPickerSheet` open state — currently hard-coded `open={false}` in WelcomeClient/ConversationClient; needs proper `instanceUIState.modeState` wiring in Phase 4

---

## Gap 4 — Route → Instance Mapping & Instance Lifecycle

### Status: ✅ Done (Phase 3)

**[KNOWN] Route structure and instance mapping:**
- `/demos/chat` → create instance from hardcoded default agent
- `/demos/chat/a/[agentId]` → create instance from `agentId` param
- `/demos/chat/c/[conversationId]` → agentId required as `?agent=uuid`, create instance + load history

**[KNOWN] Instance lifecycle:**
- `instanceId` in URL as `?instance=uuid`
- `useInstanceBootstrap` manages the full lifecycle
- On refresh: URL has `agentId` → recreate instance (history loads separately via `fetchConversationHistory`)
- On agent switch: old instance stays in memory (reused if user returns), new instance created
- On conversation load: `fetchConversationHistory({ conversationId, instanceId })` populates `instanceConversationHistory`

**[KNOWN] `conversationId` resolution for `/c/` route:**
- `agentId` must be in the URL as `?agent=uuid` (set by sidebar when user clicks a conversation)
- `cx_conversation` stores `ai_model_id` but not `agent_id` directly — the agent ID comes from the URL, not the DB

**[DONE] Phase 3 implementation:**
- `useInstanceBootstrap` handles all three route patterns
- Instance reuse map prevents duplicate creation on agent re-selection

---

## Gap 5 — Conversation History Load

### Status: ✅ Done (Phase 2)

**[KNOWN]** The current system calls `/api/cx-chat/request?id={conversationId}` which queries `cx_conversations` + `cx_messages`. The returned messages go through `processDbMessagesForDisplay()` → `chatConversationsActions.loadConversation`.

**[KNOWN]** The Python backend writes runs to `agent_runs` table (queried by `AgentRunsSidebar`). The `agent_runs` table exists in Supabase and has `id, name, created_at, message_count` (at minimum). Full message content is unknown — needs inspection.

**[KNOWN] Correction:** `agent_conversations` is an old, unused table. The new system uses `cx_conversation` + `cx_message` (the newest, best-structured tables).

**[DONE] Phase 2 implementation:**
- Direct Supabase client reads from `cx_conversation` + `cx_message` — no API route bounce
- `fetchConversationList()` — Tier 1: id, title, updated_at, message_count, status (25 items, TTL-guarded)
- `fetchConversationListMore()` — Tier 2: same + searchTerm filter (pagination)
- `fetchConversationHistory()` — Tier 3: full CxMessage → ConversationTurn mapping
- Privacy enforced at the thunk level: system-role messages filtered, system_instruction never queried
- New `cxConversations` slice in rootReducer manages sidebar list state

**Tasks:**
- [ ] Update `SsrSidebarChats.tsx` to dispatch from new Redux thunks (Phase 4)

---

## Gap 6 — Conversation Sidebar (SsrSidebarChats)

### Status: ✅ Done (Phase 4)

**[KNOWN]** `SsrSidebarChats.tsx` (743 lines!) currently:
- Calls `/api/cx-chat/history` for conversation list
- Shows conversations grouped by today/yesterday/older
- Handles search, rename, delete, pin

**[KNOWN]** The data source is `cx_conversation` (not agent_conversations — that's old/unused). Rename = direct Supabase UPDATE. Delete = soft-delete via `deleted_at` + `status='archived'`. Both thunks (`renameConversationMutation`, `deleteConversationMutation`) are ready.

**Tasks:**
- [ ] Update `SsrSidebarChats.tsx` to use `fetchConversationList`, `fetchConversationListMore`, `renameConversationMutation`, `deleteConversationMutation` from `features/cx-chat/redux`
- [ ] Replace `useChatPersistence.loadHistory()` calls with Redux dispatch

---

## Gap 7 — Type Migration (PromptVariable, PromptSettings, Resource)

### Status: ✅ Done (Phase 5)

**[KNOWN] Full blast radius (files that import from `features/prompts/`):**

| Import | Old Path | New Path | Confidence |
|---|---|---|---|
| `PromptVariable` | `features/prompts/types/core` | `features/agents/redux/agent-definition/types` as `VariableDefinition` | [KNOWN] |
| `PromptSettings` | `features/prompts/types/core` | `lib/api/types` as `LLMParams` | [KNOWN] |
| `Resource` | `features/prompts/types/resources` | `features/agents/redux/execution-system/instance-resources/instance-resources.slice.ts` as `InstanceResource` | [THINK — verify shape] |
| `ResourceChips` component | `features/prompts/components/resource-display` | `features/agents/components/smart/SmartAgentResourceChips` | [THINK] |
| `ResourcePickerMenu` | `features/prompts/components/resource-picker` | `features/agents/components/smart/SmartAgentResourcePickerButton` | [THINK] |
| `ModelSettingsDialog` | `features/prompts/components/configuration` | Needs agent system equivalent | [THINK — check AgentSettingsModal] |
| `VariableInputComponent` | `features/prompts/components/variable-inputs` | `features/agents/components/smart/SmartAgentVariableInputs` | [THINK] |
| `ResourcesContainer` | `features/prompts/components/resource-display` | TBD | [THINK] |

**Files needing type import updates (after new types decided):**
- `lib/redux/slices/activeChatSlice.ts` — `PromptVariable` + `PromptSettings` in interface + state
- `features/cx-chat/types/conversation.ts` — `PromptVariable`, `Resource` in interfaces
- `features/cx-chat/types/agents.ts` — `PromptVariable`
- `features/cx-chat/hooks/useAgentBootstrap.ts` — `PromptSettings`
- `features/cx-chat/hooks/useConversationSession.ts` — `PromptVariable`, `Resource`
- `features/cx-chat/utils/settings-diff.ts` — `PromptSettings`
- `features/cx-chat/components/user-input/ConversationInput.tsx` — 3 components + types
- `features/cx-chat/components/user-input/GuidedVariableInputs.tsx` — `PromptVariable`
- `features/cx-chat/components/user-input/StackedVariableInputs.tsx` — `VariableInputComponent`
- `features/cx-chat/components/messages/UserMessage.tsx` — `ResourcesContainer`
- `features/cx-chat/components/ChatWelcomeServer.tsx` — `PromptVariable`
- `features/cx-chat/components/ChatWelcomeClient.tsx` — `Resource`

**Decision needed:** Do we create a shared type shim (e.g. `lib/types/agent-chat.ts` re-exporting from both sources) or do a one-shot update of all imports? Given the file count, a shim first + one-shot sweep later is pragmatic.

**Tasks:**
- [ ] Verify `VariableDefinition` is a superset of `PromptVariable` (it has more fields — shape is compatible)
- [ ] Verify `LLMParams` is equivalent to `PromptSettings` (same keys used in API payloads)
- [ ] Create shim `lib/types/agent-chat.ts` re-exporting canonical types — quick unblock
- [ ] After migration stable, do one-shot import sweep and delete shim

---

## Gap 8 — Migrate chatConversationsSlice → Execution System

### Status: ⏭️ Later (largest item, do after 1–7 stable)

**[KNOWN] Current cx-chat components that dispatch to `chatConversationsSlice` (24 dispatch sites):**
```
ConversationInput        → setCurrentInput, addResource, updateVariable, updateUIState, pushStreamEvent, appendStreamChunk
ChatWelcomeClient        → startSession, removeSession
ChatConversationClient   → startSession, setConversationId, clearActiveSession
GuidedVariableInputs     → updateVariable
StackedVariableInputs    → updateVariable
AssistantMessage         → resetMessageContent, updateMessage
AssistantActionBar       → (messageActionsSlice) setMessageActionInstance
MessageList              → (read-only selectors)
ChatHeaderControls       → updateUIState (useBlockMode, showDebugInfo)
ChatMobileAdminToggles   → updateUIState
messageActionRegistry    → resetMessageContent, via editMessage thunk
ChatDebugModal           → (read-only selectors)
```

**[KNOWN] New system equivalents:**
| Old action | New action | Slice |
|---|---|---|
| `startSession` | `createManualInstance({ agentId })` | create-instance.thunk |
| `removeSession` | `destroyInstance(instanceId)` | execution-instances.slice |
| `setCurrentInput` | `setUserInputText({ instanceId, text })` | instance-user-input.slice |
| `addResource` | `addResource({ instanceId, ... })` | instance-resources.slice |
| `updateVariable` | `setUserVariableValue({ instanceId, name, value })` | instance-variable-values.slice |
| `updateUIState` | `updateModeState({ instanceId, changes })` | instance-ui-state.slice |
| `appendStreamChunk` | (handled internally in executeInstance thunk) | active-requests.slice |
| `setConversationId` | (handled internally in executeInstance thunk) | active-requests.slice |
| `startSession + sendMessage` | `executeInstance({ instanceId })` | execute-instance.thunk |

**[KNOWN] The main input + send path becomes:**
```
Old: ConversationInput → chatConversationsActions.setCurrentInput → sendMessage thunk
New: SmartAgentInput (instanceId prop) → setUserInputText → executeInstance thunk
```
OR: Adapt `ConversationInput` to dispatch to new slices while keeping same UI.

**[THINK]** The cleanest migration is to replace `ConversationInput` with `SmartAgentInput` (already exists in the agent system, fully wired). Then the sidebar and header components just need to read from the right selectors.

**Tasks:**
- [ ] Map ALL selectors used in cx-chat to their new equivalents
- [ ] Replace `ConversationInput` with `SmartAgentInput` (or heavily adapt it)
- [ ] Replace message display components with `AgentConversationDisplay` + `AgentStreamingMessage`
- [ ] Replace `useChatPersistence` with direct Supabase reads from `agent_runs`
- [ ] Remove `chatConversationsSlice` from rootReducer after all consumers migrated
- [ ] Remove `messageActionsSlice` from rootReducer

---

## Gap 9 — Message Actions (Copy, TTS, Edit, Fork)

### Status: ⏭️ Later (parallel with Gap 8)

**[KNOWN]** `messageActionsSlice` manages per-message action UI overlays. `editMessage` thunk updates message content and calls `cx_message_edit` RPC on `cx_messages` table.

**[THINK]** The new `ConversationTurn` type has `isEdited`, `originalContent`, `isFork`, `parentTurnId` stubs. No edit thunk exists yet in the new system.

**[THINK]** Edit/regeneration against the new system would call a Python endpoint (not a Supabase RPC directly) to get the new response, then dispatch `commitAssistantTurn`.

**Tasks:**
- [ ] Verify where Python stores message edit history (is there a table for this?)
- [ ] Design message action state — use per-instance UI state in `instanceUIState` slice or a dedicated slice
- [ ] Build edit message thunk for new system
- [ ] Build TTS integration with new message turn IDs

---

## Gap 10 — Agent Picker Sheet

### Status: ✅ Done (Phase 4)

**[KNOWN]** `AgentPickerSheet.tsx` currently uses `useAgentConsumer` from `features/cx-chat/hooks` which reads from `agentCacheSlice` (prompts table). Uses `autoUpgradeToCore` to fetch descriptions/tags when picker opens.

**[THINK]** The new system's `useAgentConsumer` from `features/agents/hooks` reads from `agentDefinition` slice. If Gap 1 is done (agent listing from agents table), swap the hook.

**Tasks:**
- [ ] Swap `useAgentConsumer` import from `cx-chat/hooks` to `features/agents/hooks`
- [ ] Update `AgentPickerSheet` to use `fetchAgentExecutionFull` on agent select (instead of `selectAgent` from old consumer)

---

## Gap 11 — "No Agent" / Plain Chat Mode

### Status: 🟡 Design needed

**[KNOWN]** The new system has `createManualInstanceNoAgent({ label?, variableDefinitions?, baseSettings? })` — creates an instance with empty `agentId: ""`. This enables pure chat without an agent.

**[THINK]** The current default chat route (`/demos/chat`) shows the default agent. With the new system, this could create a `NoAgent` instance and use the `chat` API mode (`POST /api/ai/chat`).

**Tasks:**
- [ ] Decide: keep default agent on welcome screen (recommended) or switch to no-agent mode
- [ ] Wire default route to create instance from hardcoded default agent ID

---

## DB Schema — Confirmed

### [KNOWN] Chat data lives in `cx_conversation` + `cx_message` (NOT `agent_conversations`)

The tables `agent_conversations` and `agent_requests` are old/legacy Python-side tables that are no longer the source of truth for the chat UI. The **current, correct tables** are:

#### `cx_conversation`
| Column | Notes |
|---|---|
| `id` | uuid PK — the conversationId used in routes |
| `user_id` | Owner |
| `title` | Display name in sidebar |
| `system_instruction` | System prompt — NEVER expose to client UI |
| `config` | jsonb — LLM settings snapshot |
| `status` | `active` / `completed` / `archived` |
| `message_count` | smallint — for sidebar badge |
| `ai_model_id` | uuid — model used |
| `created_at` / `updated_at` | timestamps |

#### `cx_message`
| Column | Notes |
|---|---|
| `id` | uuid PK |
| `conversation_id` | FK → cx_conversation.id |
| `role` | `user` / `assistant` / `system` / `tool` / `output` |
| `position` | smallint — ordering within conversation |
| `content` | jsonb array of `CxContentBlock` (text, thinking, media, tool_call, tool_result, etc.) |
| `metadata` | jsonb — includes `variables`, `resources` stored alongside user messages |
| `status` | `active` / `condensed` / `summary` / `deleted` |
| `content_history` | jsonb — previous content versions (edits) |

**Privacy rule:** Always filter `role = 'system'` from message queries. Never select `system_instruction`. Enforced in `fetchConversationHistory` thunk (Phase 2).

Phase 2 thunks (`features/cx-chat/redux/thunks.ts`) correctly query these tables directly via Supabase client.

### [KNOWN] Type Compatibility Verified

**`PromptVariable` vs `VariableDefinition`:**
```typescript
// PromptVariable (features/prompts/types/core)
interface PromptVariable {
  name: string;
  defaultValue: string;       // always string
  customComponent?: VariableCustomComponent;
  required?: boolean;
  helpText?: string;
}

// VariableDefinition (features/agents/redux/agent-definition/types)
interface VariableDefinition {
  name: string;
  defaultValue: unknown;      // more permissive (string, number, boolean, etc.)
  helpText?: string;
  required?: boolean;
  customComponent?: { ... }   // identical structure
}
```
**Verdict: `VariableDefinition` is a superset. Cast `VariableDefinition` as `PromptVariable` is safe for string-value agents. Reverse is also safe. Direct swap works.**

**`PromptSettings` vs `LLMParams`:**
`PromptSettings` is a subset of `LLMParams` fields (all LLM fields + some frontend-only flags like `image_urls`, `file_urls`). `PromptSettings` also has `model_id` and `tools` which `LLMParams` doesn't (those are top-level on the agent). The `instanceModelOverrides` slice uses `LLMParams` directly. The mapping is clean — `PromptSettings` = `LLMParams` + deprecated frontend fields.

**Verdict: Swap `PromptSettings` → `LLMParams` in `activeChatSlice` and all consumers. Remove frontend-only fields (`image_urls`, `tools`, etc.) from the settings type — those belong elsewhere.**

---

## Recommended Implementation Order

| Phase | Gap | What to build | Prerequisite | Est. Complexity |
|---|---|---|---|---|
| 1 | DB | Query `agent_runs` schema | None | Trivial |
| 1 | 1 | `fetchAgentsForChatSidebar` thunk | `agentDefinition` slice ✅ | Small |
| 1 | 2 | Wire `fetchAgentExecutionFull` on agent select | `agentDefinition` slice ✅ | Small |
| 1 | 7 | Type shim `lib/types/agent-chat.ts` | Verify types match | Small |
| 2 | 3 | Update `activeChatSlice` — add `activeInstanceId` | Phase 1 done | Medium |
| 2 | 3 | `useInstanceBootstrap.ts` hook | Updated slice | Medium |
| 2 | 4 | Instance lifecycle (create/destroy on nav) | `useInstanceBootstrap` | Medium |
| 3 | 5 | `fetchConversationHistory` thunk | `agent_runs` schema known | Medium |
| 3 | 5 | `fetchConversationList` Tier 1 + Tier 2 thunks | Same | Medium |
| 3 | 6 | Update `SsrSidebarChats.tsx` | Phase 3 thunks | Medium |
| 4 | 10 | Update `AgentPickerSheet.tsx` | Phase 1 done | Small |
| 5 | 8 | Migrate cx-chat components to new Redux | All above stable | Large |
| 5 | 9 | Message editing + action overlays | Phase 5 | Medium |
| 6 | — | Remove old slices + deleted feature dirs | Phase 5 done | Cleanup |

---

## Things That Are NOT Gaps

These work correctly today in the new system and don't need rework:

- ✅ **Streaming execution** — `executeInstance` thunk handles all streaming, planning indicator, tool delegation
- ✅ **Variable inputs** — `SmartAgentVariableInputs` + `instanceVariableValues` slice fully built and wired
- ✅ **Resource attachments** — `SmartAgentResourceChips` + `instanceResources` slice fully built
- ✅ **Model overrides** — `instanceModelOverrides` slice handles 3-state (untouched/override/removed) correctly
- ✅ **Voice input** — inside `SmartAgentInput`, already works
- ✅ **Multi-turn routing** — `executeInstance` routes Turn 1 → `/agents/{id}`, Turn 2+ → `/conversations/{id}` automatically
- ✅ **Planning indicator** — `AgentPlanningIndicator` + `selectIsWaitingForFirstToken` ready
- ✅ **Tool delegation** — `submitToolResults` thunk + `addPendingToolCall`/`resolveToolCall` ready
- ✅ **Agent definition storage** — `agentDefinition` slice + all fetch thunks wired
- ✅ **Context slots** — `instanceContext` slice ready
- ✅ **Auto-clear conversation** — `reInstanceAndExecute` thunk handles this
- ✅ **Creator debug panel** — `SmartAgentInput` toggle wired to `instanceUIState`

---

## First Action Items (Before Any Code)

1. **Query `agent_runs` table schema** via Supabase MCP — run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'agent_runs'`
2. **Verify type compatibility**: is `VariableDefinition` a drop-in superset of `PromptVariable`? Read both side by side.
3. **Verify `LLMParams` = `PromptSettings`**: read `lib/api/types.ts` and `features/prompts/types/core.ts` side by side.
4. **Decide on type shim strategy** (re-export vs. one-shot sweep)
5. **Decide on `activeChatSlice` update scope** — minimal update (add `activeInstanceId`, keep rest) or full replacement

---

*Last updated: 2026-03-28 — Phase 6 complete. SSR chat route fully migrated to new agent execution system.*
