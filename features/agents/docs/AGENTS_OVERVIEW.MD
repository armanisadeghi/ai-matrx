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

The preconditions, the `assembleRequest` source→payload map, the endpoint matrix, the stream
event → reducer map, and the Builder `/ai/manual` path are **cross-repo contracts and no longer
live here.** They are in the node's kit — read these before changing any of them:

- `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/INVOCATION-CONTRACT.md`
- `/Users/armanisadeghi/code/common-docs/systems/agents/execution-runtime/CLIENT-RUNTIME.md`

🚨 **What used to be written here was wrong on two points** — it routed Builder to
`POST /api/ai/chat` (it is `POST /ai/manual`) and it dispatched on `status_update` (removed; it is
`phase`). Do not restore it from git.

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
