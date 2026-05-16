# FEATURE.md — `agents`

**Status:** `migrating` (active rebuild — see `features/agents/migration/`)
**Tier:** `1` — core of the product
**Last updated:** `2026-05-15`

> This file is the **entry point** for the agents system. The system is large enough that it has its own `docs/` subdirectory with sub-feature docs. Start here, then jump to the relevant sub-doc.

---

## Purpose

Agents are autonomous AI specialists. The AI Matrx Harness turns a raw model into one by providing persistent context, tool execution, orchestration, and multi-surface invocation. Everything in the product that does AI work is ultimately an agent invocation — Chat, Runner, Shortcuts, Agent Apps, Builder.

---

## The mental model in one page

The system runs in three stages with three consumer surfaces:

1. **Build** — `Agent Builder` (`/agents/[id]/build`) — engineers craft identity, instructions, model, settings, tools, variables, context slots. Every save creates a new version.
2. **Test** — `Agent Runner` (`/agents/[id]/run`) — same runtime as Chat with observability on; can pin any past version.
3. **Consume** — `Chat` (user conversations), `Agent Shortcuts` (click-to-fire invocations with auto-mapped variables), `Agent Apps` (custom UIs for workflows).

### Two invocation payloads — the key distinction

| Surface | Endpoint on first turn | Payload includes | Why |
|---|---|---|---|
| **Builder** | `POST /prompts` | **Full agent definition** (system prompt, model, settings, tools, variables) | Cache-independent raw test — builder must see exactly what the server will run, no hidden state |
| **Runner / Chat / Shortcut / App** | `POST /ai/agents/{id}` | **Agent ID + form values** (variables, context, user input) | Server owns the agent definition; client sends only what changes per call |

After the first turn, everything collapses to `POST /ai/conversations/{conversationId}` (or `POST /ai/chat` for ephemeral). See **AGENT_INVOCATION_LIFECYCLE.md**.

### Variables vs. context slots

- **Variables** are required inputs — missing them leaves the agent confused. Bound by name from `invocation.inputs.variables`.
- **Context slots** are optional, auto-filled from ambient sources (user profile, org, active project, scope mappings). Their absence is graceful.
- **Everything else** is fetched on demand via tool call, not injection.

### Versioning

Every Builder save = new `agent_definition` version. Runner + Chat default to the current pointer. **Shortcuts and Apps pin to a specific version** so embeds never break when the agent evolves. Drift is surfaced in the UI; engineers update on demand. See **AGENT_VERSIONING.md**.

---

## Entry points

**Routes**
- `app/(authenticated)/agents/[id]/build/page.tsx` — Builder
- `app/(authenticated)/agents/[id]/run/page.tsx` — Runner
- `app/(authenticated)/chat/...` — Chat (🚧 not yet built; legacy at `features/cx-conversation/` + `features/cx-chat/`, deprecated stub at `app/(authenticated)/deprecated/chat/`)
- `app/(authenticated)/ai/agents/[id]/connections` — tool/integration config
- `app/(authenticated)/ai/shortcuts/` — shortcut admin

**API endpoints**
- `POST /ai/agents/{id}` — first turn of a new conversation (agent mode)
- `POST /ai/conversations/{conversationId}` — subsequent turns
- `POST /ai/chat` — ephemeral turns (no DB persistence)
- `POST /prompts` — Builder-mode raw request
- `POST /ai/conversations/{id}/tool_results` — durable + widget tool result submission

**Key thunks** (`features/agents/redux/execution-system/thunks/`)
- `launch-conversation.thunk.ts` — single entry point every surface hands a `ConversationInvocation` to
- `launch-agent-execution.thunk.ts` — low-level launch delegate
- `execute-instance.thunk.ts` — body assembly, fetch, stream parsing (agent mode)
- `execute-chat-instance.thunk.ts` — same but for ephemeral/chat mode
- `resume-conversation.ts` — rehydrate after refresh
- `submit-tool-results.ts` — durable tool call result submission

**Services**
- `features/agents/services/mcp.service.ts` — MCP protocol integration (see `features/api-integrations/FEATURE.md`)
- `features/agents/services/mcp-client/` — MCP client
- `features/agents/services/mcp-oauth/` — MCP OAuth flow

---

## Data model (Redux — four layers)

All state lives under `features/agents/redux/`. The four layers:

### Layer 1 — Agent Source (static definitions)

| Redux key | Slice | Role |
|---|---|---|
| `agentDefinition` | `agent-definition/` | Master registry — live + version snapshots, per-record fetch status, dirty tracking, field-level undo |
| `agentShortcut` | `agent-shortcuts/` | Stored launch buttons — agentId + scope mappings + display config |
| `agentConsumers` | `agent-consumers/` | Per-UI filter/sort/search state for list views |

### Layer 2 — App Context (external)

| Redux key | Location | Role |
|---|---|---|
| `appContext` | `lib/redux/slices/appContextSlice.ts` | Global scope: org, workspace, project, task IDs. Injected by `assembleRequest()`. |

### Layer 3 — Execution Instances (10 slices, `byInstanceId`)

Ephemeral runtime state. Core invariant: **`agentId` is read exactly ONCE — at instance creation.** After that the instance owns its data; if the definition changes mid-run the instance doesn't notice.

| Redux key | In API body? | Owns |
|---|:-:|---|
| `executionInstances` | No | Shell: agentId, origin, status lifecycle |
| `instanceModelOverrides` | Yes (`config_overrides`) | Model settings snapshot + user deltas |
| `instanceVariableValues` | Yes (`variables`) | Variable defs + resolved values (defaults → scope → user) |
| `instanceResources` | Yes (merged into `user_input`) | Attached files/content with status |
| `instanceContext` | Yes (`context`) | Context slot matches + ad-hoc entries |
| `instanceUserInput` | Yes (`user_input`) | Text + multimodal content blocks |
| `instanceClientTools` | Yes (`client_tools`) | Client-side tool IDs registered for this instance |
| `instanceUIState` | **No** | Display mode, panels, modals, visual state |
| `instanceConversationHistory` | No (server owns it) | Turn history, conversation mode, server conversation ID |
| `activeRequests` | No | Per-request stream state (chunks, status, content blocks, tool lifecycle) |

### Layer 4 — Thunks + aggregate selectors

See `features/agents/redux/execution-system/` and `selectors/aggregate.selectors.ts`.

---

## Sub-feature docs (read these for detail)

### New in this doc pass
- [`docs/AGENT_BUILDER.md`](./docs/AGENT_BUILDER.md) — authoring surface; ships full definition; cache-independent
- [`docs/AGENT_RUNNER.md`](./docs/AGENT_RUNNER.md) — observability-on test track; ID-only invocation
- [`docs/AGENT_VERSIONING.md`](./docs/AGENT_VERSIONING.md) — version semantics + pin-by-version for Shortcuts/Apps
- [`docs/AGENT_INVOCATION_LIFECYCLE.md`](./docs/AGENT_INVOCATION_LIFECYCLE.md) — endpoint routing, Builder vs Runner payloads, ephemeral branch
- [`docs/AGENT_ORCHESTRATION.md`](./docs/AGENT_ORCHESTRATION.md) — maxIterations, retries, self-correction, state persistence
- [`docs/STREAMING_SYSTEM.md`](./docs/STREAMING_SYSTEM.md) — canonical NDJSON streaming contract (anchor for the whole app)

### Existing (refresh as needed when editing)
- [`docs/AGENTS_OVERVIEW.MD`](./docs/AGENTS_OVERVIEW.MD) — four-layer architecture deep dive
- [`agent-system-mental-model.md`](./agent-system-mental-model.md) — long-form mental model
- [`docs/agent-rpcs-reference.md`](./docs/agent-rpcs-reference.md) — RPC surface (with `new-rpcs.md`)
- [`docs/STREAM_STATUS_LIFECYCLE.md`](./docs/STREAM_STATUS_LIFECYCLE.md) — stream event types + phases
- [`docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md`](./docs/DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md) — durable tools contract
- [`docs/WIDGET_HANDLE_SYSTEM.md`](./docs/WIDGET_HANDLE_SYSTEM.md) — widget handle + client tools
- [`docs/WIDGET_HANDLE_AND_CLIENT_TOOLS-STATE.md`](./docs/WIDGET_HANDLE_AND_CLIENT_TOOLS-STATE.md) — state integration
- [`docs/agent-undo-redo.md`](./docs/agent-undo-redo.md) — field-level undo
- [`docs/agents-migration-status.md`](./docs/agents-migration-status.md) — live migration status
- [`conversation-invocation-reference.md`](./conversation-invocation-reference.md) — `ConversationInvocation` shape
- [`ROADMAP-agent-ecosystem-rebuild.md`](./ROADMAP-agent-ecosystem-rebuild.md) — roadmap

---

## Invariants & gotchas

- **`agentId` is read once at instance creation.** Do not re-read during execution. If the agent definition changes mid-run, the instance must not notice.
- **Builder and Runner are not the same payload shape.** Builder ships the full definition; Runner ships only the ID. If you add a field to the agent definition, both paths must be updated — Runner needs server-side handling, Builder needs client-side bundling.
- **Shortcuts and Apps pin to version.** `useLatest: false` + `agentVersionId` is the frozen case. Breaking the version contract breaks every embedded invocation silently.
- **The stream is never paused for widget tools.** Fast + fire-and-forget. Non-widget delegated tools do pause.
- **Ephemeral conversations cannot call `/ai/conversations/{id}` on turn 2** — they must call `/ai/chat` with full accumulated history (there is no DB row to target).
- **Client never sees the system prompt or instructions.** Those are server-owned engineer secrets. The client only gets variable + context slot definitions on agent load.
- **Drift between a pinned Shortcut/App version and the live agent is surfaced in the UI, never auto-resolved.**

---

## Related features

- **Depends on:** `features/agent-context/` + `features/brokers/` (variable/context resolution), `features/api-integrations/` (MCP + external tools), `features/artifacts/` (rendering output), `features/tool-call-visualization/` (tool UI)
- **Depended on by:** `features/agent-shortcuts/`, `features/agent-apps/`, `features/conversation/`, almost every user-facing surface
- **Cross-links:** `features/agents/migration/MASTER-PLAN.md`, `features/scope-system/FEATURE.md`

---

## Current work / migration state

Active rebuild governed by `features/agents/migration/MASTER-PLAN.md`. Phase-ordered plan (20 phases). Key context:

- Legacy prompts stack is still wired in some places — do not extend it. See `migration/INVENTORY.md` for the legacy ↔ agent map.
- Phases 16–19 are deletion phases; run last.
- RTK only for new state; extend `features/agents/redux/**`, never create parallel local state.
- Multi-scope (admin/user/org) from day one — Shortcuts, categories, content blocks must all support it.

---

## UI component conventions

### JSON display
Always use `JsonInspector` from `@/components/official-candidate/json-inspector/JsonInspector` for any JSON data display.
Do **not** use raw `<pre>` or custom JSON renderers — `JsonInspector` bundles five display modes (formatted, explorer, tree, JSON-tree, truncator) plus built-in copy, lazy-loading, and an optional edit tab. Give the wrapper a defined height (`h-64`, `h-[calc(100dvh-12rem)]`, etc.) because `JsonInspector` is `flex-col h-full` internally.

```tsx
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";

<div className="h-64">
  <JsonInspector data={someObject} label="My data" className="h-full" />
</div>
```

---

## Change log

- `2026-05-15` — **Server-side conversation API: opt-in parallel paths wired.** The Python team shipped a batch of new HTTP endpoints that overlap with existing direct-Supabase RPC thunks (fork, delete, edit-and-fork) and add a whole new compaction capability (replace / hide / restore / turns-compact). Spec lives at [`docs/FE_CONVERSATION_API_CHANGES.md`](../../docs/FE_CONVERSATION_API_CHANGES.md); request/response types are in the auto-generated `types/python-generated/api-types.ts`. We wired every new endpoint **additively** — none of the existing thunks were touched, and no call site was changed:
  - **`lib/api/call-api.ts`** — added 7 typed wrappers: `callConversationFork`, `callConversationForkAndRun` (streaming), `callBatchDeleteMessages`, `callReplaceMessages`, `callHideMessages`, `callRestoreCompaction`, `callCompactTurns`. Body / response shapes are all inferred from the generated OpenAPI types — passing the wrong shape is a compile-time error.
  - **`features/agents/types/conversation-stream-events.ts`** — manual mirror of `ConversationForkedEvent`, the first-event-on-stream payload from `/ai/conversations/{id}/fork-and-run`. Not in `api-types.ts` because stream-event payloads aren't OpenAPI-shaped (same pattern as the scraper's `page_extraction` events).
  - **`features/agents/redux/execution-system/message-crud/server/`** — new directory holding one thunk per endpoint: `forkConversationServer`, `forkAndRunServer`, `batchDeleteMessages`, `replaceMessages`, `hideMessages`, `restoreCompaction`, `compactTurns`. Each calls the matching wrapper, runs `loadConversation` after a successful write so the messages/observability/variables slices mirror the new DB state, and fires the standard cache-bypass + invalidate. `README.md` in the same directory carries the pairing table — which legacy RPC thunk each one parallels, and which are net-new capabilities (compaction has no legacy equivalent).
  - **`forkAndRunServer` integration scope.** The thunk fires the stream, captures the `conversation.forked` first event, optionally navigates the surface via `setFocus`, and hydrates the new conversation via `loadConversation` after the stream completes. It does NOT yet route subsequent stream events into `processStream` for live token-by-token rendering into the fork's slice entries — that's a deliberate follow-up so the wire-up is testable first. The thunk's docstring calls this out explicitly.
  - **`zero-replacement guarantee.`** Existing `forkConversation`, `editMessage`, `deleteMessage`, `overwriteAndResend`, `atomicRetry`, `softDeleteConversation`, `invalidateConversationCache` thunks and their callers are unchanged. Surfaces opt in to the server-backed path one at a time; once a surface is validated end-to-end we consolidate.
- `2026-05-15` — Fork: RPC perf fix + explicit "Stay here / Go to new branch" prompt. Two bugs were ganged together; fixing them in one pass:
  - **Backend.** `cx_fork_conversation` was timing out on real conversations. Two causes: (1) a row-by-row PL/pgSQL loop over `cx_message` that rebuilt the `v_msg_map` JSONB on every iteration — O(N²) memory copies; (2) both `cx_tl_call` queries (the id-map loop and the bulk INSERT) omitted `conversation_id` from their WHERE clause, so the only usable predicate was `v_msg_map ? message_id::text` (a JSONB containment check with no index support), forcing a full table scan. Rewrote the RPC set-based: `jsonb_object_agg` builds both `v_msg_map` and `v_tc_map` in single passes, then single bulk INSERTs copy the rows. Every `cx_tl_call` query now filters by `conversation_id` first so `idx_ctc_conversation` drives the scan. Measured fork-at-position-215 on a 216-message / 89-tool-call conversation: **32 ms end-to-end**, down from statement-timeout (≥8 s). Behavior and return shape are unchanged — still returns the `get_cx_conversation_bundle` payload.
  - **Frontend.** The post-fork "where do you want to go?" affordance was a sonner toast that auto-dismissed after 8 s — easy to miss, made the action feel like a no-op. Replaced with the global imperative `confirm()` modal so the user is explicitly prompted to **Go to new branch** vs **Stay here**, with `requestSurfaceNavigation` firing on confirm. Renamed `ForkOutcomeToast.tsx` → `promptForkOutcome.ts` because the file no longer renders a toast. The other consumer (`UserActionBar` edit-and-resubmit) auto-navigates (the new branch is already streaming a response — user already chose), and its surface-less fallback is now a simple success toast instead of a button that silently no-ops.
- `2026-05-15` — Older-message pagination wired into `AgentConversationColumn` (used by `/agents/[id]/run` and `/chat/[conversationId]`). The bundle RPC always supported `p_before_position`, but no client trigger existed and `hydrateMessages` was clobbering everything. New pieces:
  - `features/agents/redux/execution-system/thunks/conversation-bundle.ts` — extracted the bundle fetcher + row converters out of `load-conversation.thunk.ts` so both initial-load and older-page fetches share one path.
  - `load-older-messages.thunk.ts` — re-entry-guarded, calls `get_cx_conversation_bundle` with the slice's `oldestPosition` cursor, dispatches `prependMessages` + `mergeToolCalls` only. Skips `cx_user_request` / `cx_request` fallback queries on the pagination path.
  - `messages.slice.ts` — `MessagesEntry` now carries `oldestPosition`, `hasMoreOlder`, `isLoadingOlder`. New `prependMessages` reducer is strictly additive (never overwrites existing `byId` entries — preserves references so per-message subscribers don't re-render). `hydrateMessages` seeds the cursor from `bundle.pagination`.
  - `observability.slice.ts` — new `mergeToolCalls` reducer mirrors the additive contract for the tool-call map so older tool turns hydrate without touching streaming tool calls.
  - `OlderMessagesSentinel.tsx` — invisible 1px sentinel at the top of the scroll container. Owns the `IntersectionObserver`, dispatches the older-page thunk with a 200px rootMargin prefetch, and uses a `useLayoutEffect` to restore visual scroll position after each prepend (shift `scrollTop` by the `scrollHeight` delta). Subscribes only to `hasMoreOlder` / `isLoadingOlder` / `firstMessageId` so its re-renders never reach the message tree.
  - `AgentConversationDisplay.tsx` — fixed a pre-existing auto-scroll bug where any length growth (including prepend) yanked the user to the bottom. Now only scrolls when the LAST message id changes AND the count grew.
  - **Stream-safety invariant:** prepend and merge writes touch only NEW ids — existing message and tool-call records keep their object references, so streaming bubbles and previously-rendered messages do not re-render when older history pages in.
- `2026-05-02` — AgentViewContent cleanup: hero block (name, copyable ID, description, status pills, tags), stat strip, reordered sections (settings → variables → context slots → tools → MCP → output schema → separator → messages), per-message MD/Plain toggle, JsonInspector for JSON view and output schema, admin-only Pretty/JSON page toggle. Variable rendering extended into inline code and fenced code blocks (`InlineCodeSnippet.renderVariables`, `BasicMarkdownContent` inline `code` handler). JsonInspector convention added to FEATURE.md.
- `2026-04-29` — Convert-to-system flow (`ConvertAgentToSystemBody`): when existing system agents are listed, each row has an external-link control that opens `/agents/{id}` in a new tab so admins can review before update.
- `2026-04-25` — Barrel import cleanup: external and core callers no longer import `conversation-list`, `message-crud`, `surfaces`, `mcp-client`, or execution-system index folders without a file — use `*.slice`, `*.thunks`, `*.selectors`, `mcp-client/client`, etc. (includes `lib/redux/rootReducer`, `cx-chat/ConversationInput` → `types/instance.types`, MCP API routes, window panels, `packages/matrx-agents` re-exports, and related).
- `2026-04-25` — Variable UI: `VariableInputComponent` now lives in `components/inputs/input-components/VariableInputComponent.tsx` (client); `input-components/index.tsx` re-exports only the leaf inputs (`ToggleInput`, `NumberInput`, etc.) and `useContainerWidth` — importers of the dispatcher use the dedicated file, not the barrel.
- `2026-04-25` — claude: Phase 2 — applied the message UX overhaul to every consumer that shares `AgentConversationColumn` or directly mounts `AgentUserMessage` / `AgentAssistantMessage`. `ChatRoomClient` (chat route) registers `kind: 'page'` with URL `/chat/{conversationId}`. `AgentBuilderRightPanel` registers `kind: 'window'` (test panel switches in place — builder route doesn't carry conversationId). `AgentRunWindow` registers `kind: 'window'`. `AgentChatAssistant` (floating chat-assistant widget) registers `kind: 'widget'` with `customNavigation: true` and on fork spawns a sibling widget for the target conversation while closing itself, preserving the one-widget-per-conversation mental model. `AgentRunnerPage` gained an optional `buildConversationUrl` prop; `CodeWorkspace`'s `ChatPanelSlot` passes one so fork navigation stays at `/code?agentId=X&conversationId=Y` instead of 404'ing on the runner's default `/code/{agentId}/run` pattern. The surfaces thunk now honors a `customNavigation` flag on `window`/`widget` registrations so consumers like the chat-assistant can react to navigation intents without a URL change. `flash-cards/AIChatInterface` is intentionally excluded — it talks to OpenAI directly and does not use the agent system.
- `2026-04-24` — claude: message-level UX overhaul on the runner — fork outcome toast (Go to new branch / Stay here), Edit & Resubmit dialog (Fork vs Overwrite, both auto-submit), per-message Delete dialog (Delete here / Fork without this message, with cascade warning for attached tool calls), and inline Retry button on failed assistant turns. Built on a new central surfaces registry (`features/agents/redux/surfaces/`) so action bars stay surface-agnostic — page consumers register `kind: 'page'` and get a 5-line pendingNavigation effect; window/widget consumers register without one and react to focus updates as before. New thunks (`deleteMessage`, `overwriteAndResend`, `atomicRetry`) are stable; they fall back to per-message soft-delete when the atomic Python RPC `cx_truncate_conversation_after` isn't deployed yet. Python team work captured in [`docs/PYTHON_RESUME_SPEC.md`](./docs/PYTHON_RESUME_SPEC.md). Other consumers (chat, build, AgentRunWindow, widgets) get the new dialogs automatically once they pass `surfaceKey` through `AgentConversationDisplay` and register their surface — separate PR.
- `2026-04-22` — claude: initial FEATURE.md umbrella + new sub-docs (BUILDER, RUNNER, VERSIONING, INVOCATION_LIFECYCLE, ORCHESTRATION, STREAMING_SYSTEM).
- `2026-04-22` — claude: admin surface for system (builtin) agents lives at `app/(authenticated)/(admin-auth)/administration/system-agents/agents/`. Reuses `AgentBuilderPage`, `AgentRunnerPage`, and `AgentCard` from the user-side `(a)/agents/` routes via new `basePath` / `backHref` props on `AgentHeader`, `AgentModeController`, `AgentRunHeader`, `AgentCard`, `AgentListItem`. The admin shell (`ClientAdminLayout`) suppresses its ModuleHeader on builder/runner detail routes so these pages can own the top strip. `SystemAgentsGrid` is a simpler admin-only grid that reads `selectBuiltinAgents` directly. System agent creation goes through `createSystemAgentFromSeed` server action (admin-gated, writes via `createAdminClient` with all scope columns null).

---

> **Keep-docs-live rule:** after any substantive change to agents — especially to thunks, slice shapes, invocation payloads, or stream event types — update this file, the specific sub-doc it touches, and the Change log. A broken mental model cascades across every parallel agent working on top of it.
