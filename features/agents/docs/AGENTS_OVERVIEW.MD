# Agent Execution System: Developer Guide

## System Overview

This module (`features/agents/redux`) is the complete client-side state layer for AI agent execution. It covers what agents are, how they're launched, and everything that happens during a live run — including NDJSON streaming, multi-turn conversations, and client-side tool delegation.

**Your job is to know this map before you write a line of code.**

---

## Architecture — Four Layers

The Redux store keys for this system are organized into strict layers. Every slice, selector, and thunk belongs to exactly one.

### Layer 1 — Agent Source

Static definitions. What agents and shortcuts exist, how they're configured, and how UI consumers filter them.

| Redux Key | Slice | Role |
|-----------|-------|------|
| `agentDefinition` | `agent-definition/` | Master registry of all agents (live + version snapshots). Per-record fetch status, dirty tracking, field-level undo, access metadata. 22 thunks for CRUD, versioning, sharing, drift. |
| `agentShortcut` | `agent-shortcuts/` | Pre-configured launch buttons. Bundles agentId + scope mappings + display config + variable overrides. |
| `agentConsumers` | `agent-consumers/` | Per-UI filter/sort/search state for agent list views. Multiple consumers browse the same registry independently. |

### Layer 2 — App Context (external)

| Redux Key | Location | Role |
|-----------|----------|------|
| `appContext` | `lib/redux/slices/appContextSlice.ts` | Global scope: org, workspace, project, task IDs. Injected into every API call by `assembleRequest()`. |

### Layer 3 — Execution Instances (10 slices)

Ephemeral runtime state. Each instance is a self-contained, isolated snapshot of everything needed to run an agent. The core invariant:

> **`agentId` is read exactly ONCE — at instance creation.** After that, the instance owns all its data. If the agent definition changes or is deleted mid-run, the instance doesn't notice and doesn't care.

All 10 slices use the same key structure: `byInstanceId: Record<string, T>`.

| Redux Key | Slice | Goes into API body? | What it owns |
|-----------|-------|:-------------------:|-------------|
| `executionInstances` | `execution-instances/` | No | Shell entity: agentId, origin, status lifecycle (`draft → ready → running → streaming → paused → complete → error`) |
| `instanceModelOverrides` | `instance-model-overrides/` | Yes (`config_overrides`) | Base LLM settings snapshot + user deltas (only deltas sent to API) |
| `instanceVariableValues` | `instance-variable-values/` | Yes (`variables`) | Variable definitions snapshot + three-tier resolution: defaults → scope → user |
| `instanceResources` | `instance-resources/` | Yes (merged into `user_input`) | Attached files/content with status tracking (`pending → resolved → error`) |
| `instanceContext` | `instance-context/` | Yes (`context`) | Context entries: slot-matched (from agent def) + ad-hoc (from shortcuts/UI) |
| `instanceUserInput` | `instance-user-input/` | Yes (`user_input`) | Text input + multimodal content blocks |
| `instanceClientTools` | `instance-client-tools/` | Yes (`client_tools`) | Client-side tool IDs registered for this instance |
| `instanceUIState` | `instance-ui-state/` | **No** | Display mode, panels, modals, expansion, variable focus, creator flags — purely visual |
| `instanceConversationHistory` | `instance-conversation-history/` | No (server owns history for agent/conversation modes) | Ordered turn history, conversation mode, server conversation ID |
| `activeRequests` | `active-requests/` | No | Per-request stream state with dedicated storage per event type: `accumulatedText` (chunks), `currentStatus`/`statusHistory` (status updates), `contentBlocks`/`contentBlockOrder` (keyed by blockId), `toolLifecycle` (per-callId state machine) + `pendingToolCalls` (delegations), `completion`, `error` (verbatim backend `ErrorPayload` — `error_type`/`message`/`user_message`/`code`/`details`; fatality is derived from `request.status === "error"`), `dataPayloads` (catch-all for unstructured data events only) |

### Layer 4 — Thunks + Cross-Cutting Selectors

| File | Role |
|------|------|
| `thunks/create-instance.thunk.ts` | Instance factory — 5 creation paths. Reads agent snapshot once, dispatches `init*` to all 10 sibling slices. |
| `thunks/execute-instance.thunk.ts` | The convergence point — reads ALL instance slices via `assembleRequest()`, fires the fetch, parses the NDJSON stream, dispatches events to `activeRequests` + `instanceConversationHistory`. |
| `selectors/aggregate.selectors.ts` | Cross-cutting selectors: instanceId → requestId → derived state (executing? streaming? latest text, errors, pending tools, display mode grouping). |

---

## Execution Pipeline

### Step A — Preconditions

1. **`agentDefinition` must be loaded.** The agent row must exist in Redux before any creation thunk can snapshot it. `executeInstance` never reads this slice — only creation does.

2. **`executionInstances` shell must exist.** `assembleRequest` returns null without one.

3. **Instance factories** — `createManualInstance` is the default. `createTestInstance`, `createManualInstanceNoAgent`, `createInstanceFromShortcut` only change how init runs (prefilled vars, overrides, scope mappings, no agent id). The run pipeline afterward is identical.

### Step B — Body Assembly (`assembleRequest`)

`assembleRequest(state, instanceId)` reads across all instance slices + `appContext` and builds a snake_case payload:

| Source Slice | Selector | → Payload Field |
|-------------|----------|----------------|
| `instanceUserInput` | direct read | `user_input` (string or content block array) |
| `instanceResources` | `selectResourcePayloads` | merged into `user_input` as blocks |
| `instanceVariableValues` | `selectResolvedVariables` | `variables` |
| `instanceModelOverrides` | `selectSettingsOverridesForApi` | `config_overrides` |
| `instanceContext` | `selectContextPayload` | `context` |
| `instanceClientTools` | direct read | `client_tools` |
| `appContext` | org/workspace/project/task selectors | scope fields on payload |

### Step C — Fire and Stream

1. **Auth** — `apiConfigSlice` (baseUrl) + `userSlice` (Bearer token or fingerprint) build headers.
2. **Routing** — `selectLatestConversationId(instanceId)` checks history first, `activeRequests` as fallback. Turn 1 → `POST /ai/agents/{agentId}`. Turn 2+ → `POST /ai/conversations/{conversationId}` with a narrowed body.
   - **AI runtime version (v1/v2 spine):** every AI path is version-resolved by `resolveEndpointPath` via `selectEndpointOverrideConfig`, which folds in the scoped overrides from `lib/api/ai-api-version.ts`. The default is **v2** (`AI_API_VERSION_DEFAULT`) — turn 1 actually POSTs `/v2/ai/agents/{id}`, turn 2+ `/v2/ai/conversations/{id}`, Builder `/v2/ai/manual`. `/v2` is inserted at the **front** of the in-app path (`/v2/ai/*`, never `/ai/v2/*`) and is scoped to ONLY the four covered surfaces (chat/manual/agents/conversations) — cancel, warm, resume, fork-and-run, blocks, etc. stay on v1. Admins flip v1⇄v2 live via the sidebar **AI v2/AI v1** toggle (or the Run Settings panel); the choice persists per browser. Flip `AI_API_VERSION_DEFAULT` to `"v1"` for an instant, code-level, app-wide revert.
3. **Optimistic turn** — `addUserTurn` fires before `createRequest` so the user's message appears instantly.
4. **`createRequest`** — Row in `activeRequests.byRequestId`, status `"pending"`.
5. **NDJSON stream loop** — `parseNdjsonStream(response)` yields typed events, each dispatched to its dedicated reducer:
   - `chunk` → `appendChunk` — string concat into `accumulatedText`
   - `status_update` → `setCurrentStatus` — overwrites `currentStatus`, appends to `statusHistory`
   - `content_block` → `upsertContentBlock` — keyed by `blockId`, preserves emission order in `contentBlockOrder`
   - `tool_event` (lifecycle) → `upsertToolLifecycle` — per-callId state machine (started → progress/step → completed/error)
   - `tool_event` (delegated) → `addPendingToolCall` — instance pauses, awaits client response
   - `completion` → `setCompletion` — single typed object, also extracts tokenUsage/finishReason for history
   - `error` → `setRequestStatus` with `isFatal` flag — non-fatal errors allow the stream to continue
   - `data` → `appendDataPayload` — genuine catch-all for unstructured events only
   - `broker` → `appendDataPayload` — basic storage (broker system likely to be deprecated)
   - `end` → `commitAssistantTurn` writes completed text to conversation history
6. **Client metrics** — computed after stream ends, attached to both request and conversation turn. Now tracks `contentBlockEvents` and `statusUpdateEvents` alongside the original counters.

### Step D — Chat Execution Path (Builder)

The builder right panel uses a separate execution path that always hits `POST /api/ai/chat` with the agent definition read FRESH from Redux (including unsaved dirty edits). This bypasses the agent/conversation routing entirely.

**Key files:**
- `execute-chat-instance.thunk.ts` — `assembleChatRequest()` + `executeChatInstance` thunk
- `process-stream.ts` — shared NDJSON stream processor used by both `executeInstance` and `executeChatInstance`

**Differences from the standard path (Step B/C):**

| Concern | Standard (`executeInstance`) | Builder (`executeChatInstance`) |
|---------|---------------------------|-------------------------------|
| Agent definition | Snapshotted at instance creation | Read FRESH on every execution |
| Endpoint | `/agents/{id}` → `/conversations/{id}` | Always `/api/ai/chat` |
| LLM params | `config_overrides` (delta only) | Spread flat at top level (full merged settings) |
| Messages | Server manages history; client sends `user_input` | Client builds full `messages[]` from priming + history + input |
| Control fields | N/A | `debug`, `store`, `max_iterations`, `max_retries_per_iteration` from `builderAdvancedSettings` |
| Conversation mode | `"agent"` or `"conversation"` | `"chat"` |

**`assembleChatRequest(state, instanceId)` source mapping:**

| Source Slice | Selector | → Payload Field |
|-------------|----------|----------------|
| `agentDefinition` (FRESH read) | `state.agentDefinition.agents[agentId]` | `ai_model_id`, `messages` (priming), `tools`, `custom_tools` |
| `instanceConversationHistory` | `historyEntry.turns[]` → `turnsToMessages()` | appended to `messages` |
| `instanceUserInput` | direct read | appended to `messages` as final user turn |
| `instanceResources` | `selectResourcePayloads` | merged into final user message blocks |
| `instanceModelOverrides` | `selectCurrentSettings` (full merged, NOT deltas) | spread flat on payload |
| `instanceVariableValues` | `selectResolvedVariables` | `variables` |
| `instanceContext` | `selectContextPayload` | `context` |
| `instanceClientTools` | direct read | `client_tools` |
| `instanceUIState` | `builderAdvancedSettings` | `debug`, `store`, `max_iterations`, `max_retries_per_iteration` |
| `instanceUIState` | `reuseConversationId` | conditionally sets `conversation_id` |

**Type safety:** `ChatRequestPayload` is derived directly from the auto-generated schema via `NonNullableFields<components["schemas"]["ChatRequest"]>` in `agent-api-types.ts`. No hand-rolled interfaces — `pnpm update-api-types` picks up backend changes automatically.

**Three scenarios in the builder:**
1. **First call** — No history. Priming messages + user input → `/api/ai/chat`.
2. **AutoClear ON + history exists** — `reInstanceAndExecute({ useChat: true })` destroys the old instance, creates a fresh one with `mode: "chat"`, then dispatches `executeChatInstance`.
3. **Multi-turn continuation** — Priming messages + accumulated history turns + new user input → `/api/ai/chat`.

**Structured System Instruction (parallel toggle):**

When `builderAdvancedSettings.useStructuredSystemInstruction` is ON, the system message from the agent's priming messages is **extracted** from the `messages` array and sent as a structured `system_instruction` object instead. This unlocks the server's `SystemInstruction` builder pipeline:

- `content` — the extracted system message text (what we currently use)
- `include_date` — inject current date (default: true)
- `intro` / `outro` — text placed before/after everything
- `prepend_sections` / `append_sections` — injected around the base instruction
- `content_blocks` — UUIDs or slugs fetched from the DB and injected automatically
- `tools_list` — tool names auto-formatted in the prompt
- `include_code_guidelines` / `include_safety_guidelines` — built-in sections

When the toggle is OFF (default), the system message stays in `messages[]` and the server extracts it automatically — identical to the current behavior. See `aidream-chat-endpoint.md` for the full `SystemInstruction` type and rendering order.

Types: `SystemInstruction` and `SystemInstructionInput` in `agent-api-types.ts`.

---

## Key Design Rules

### Snapshot Isolation
Instances never read back from `agentDefinition` after creation. Mid-execution edits to the agent don't corrupt running instances.

### Request ≠ Instance
One instance can spawn multiple requests (multi-turn). `activeRequests` is keyed by `requestId` with a reverse index `byInstanceId`. Components only know `instanceId` — aggregate selectors bridge the gap.

### Cleanup on Destroy
`activeRequests` and `instanceConversationHistory` listen to `destroyInstance` via `extraReducers` and auto-clean. `instanceUIState` also listens. Other slices rely on the creation thunk for lifecycle (init on create, no orphan risk because the shell is the source of truth).

### Progressive Fetch Status
`AgentFetchStatus` has strict precedence: `list < execution < customExecution < full < versionSnapshot`. Fetches never downgrade existing data — `shouldUpgradeFetchStatus()` enforces this.

### Factory Selectors
`makeSelect*` functions create per-component memoized instances (createSelector cache size = 1). Use `useMemo(makeSelectFoo, [])` in components.

---

## How to Extend This System

This section is the most important. The architecture above is not a reference you glance at — it is the authority on where things live.

### Your process for every task:

**1. Think architecturally.** Before touching code, identify where in this system your feature belongs. Not "where can I make it work" — where *should* it live so that other parts of the app can use it naturally.

**2. Go look.** Navigate to that exact slice and check whether the capability already exists. In a well-maintained system, it usually does.

**3. If it exists, use it.** Do not rebuild, re-fetch, re-derive, or store locally what the system already provides. Wire into it.

**4. If it doesn't exist, extend the system.** Add a targeted, architecturally correct addition to the existing slice where it belongs. The new piece should be consumable by any part of the app. You are extending the platform, not patching your feature.

### What you must never do:

- Create isolated local state for something that belongs in a shared slice.
- Build a parallel system because the existing one "doesn't have exactly what you need yet."
- Hack data into a shape that works for your component but breaks the contract for everything else.
- Treat a missing piece as a reason to abandon the architecture. It is your cue to strengthen it.

**The mental model:** The absence of a feature in the right place is not permission to build it in the wrong place.

### Concrete extension pattern:

**Scenario:** You need to track which variable display layout is active (form, stepper, stacked, minimal) and which variable is focused.

**Wrong:** Create `useState` in your component or a new local context.

**Right:**
1. Recognize this is per-instance UI state → belongs in `instanceUIState`.
2. Check the slice — `expandedVariableId` exists but no layout variant field.
3. Add `variableDisplayLayout` to `InstanceUIState` (with a type like `"form" | "stepper" | "stacked" | "minimal"`), a default in `initInstanceUIState`, and a `setVariableDisplayLayout` action.
4. Add a selector. Wire your component to it.
5. Now every modal, panel, chat-bubble, and future display mode can declare which variable layout to use — and any shortcut can configure it at creation time.

**What you gained beyond your feature:**
- Shortcuts can now pre-select the variable layout via `initInstanceUIState`.
- `expandedVariableId` already controls which variable is focused — combine with the layout for "launch with this variable open in stepper mode."
- Every other component gets this for free without any new wiring.

### Where each kind of state belongs:

| State Category | Slice | Example |
|---------------|-------|---------|
| How something is displayed | `instanceUIState` | Display mode, variable layout, panel visibility, expanded state |
| What the user typed / attached | `instanceUserInput`, `instanceResources` | Text, content blocks, files |
| Agent config for this run | `instanceModelOverrides`, `instanceVariableValues` | LLM overrides, variable values |
| Contextual data for the agent | `instanceContext`, `instanceClientTools` | Context entries, client tools |
| What happened during execution | `activeRequests` | Stream text, status updates, content blocks, tool lifecycle, completion, errors |
| Conversation record | `instanceConversationHistory` | Turn history, conversation mode |
| Agent definition (permanent) | `agentDefinition` | Name, messages, tools, settings |
| How a list of agents is filtered | `agentConsumers` | Search, sort, tab, category filters |
| Pre-configured launch config | `agentShortcut` | Scope mappings, display prefs, variable overrides |
