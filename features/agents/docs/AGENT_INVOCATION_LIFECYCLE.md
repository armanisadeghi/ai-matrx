# AGENT_INVOCATION_LIFECYCLE.md

**Status:** `active`
**Tier:** 1 (sub-feature of `features/agents/`)
**Last updated:** `2026-07-18`

> Read [`features/agents/FEATURE.md`](../FEATURE.md) first. This doc is the endpoint routing contract — the rules for which URL, which payload, which mode. Implementation source: [`features/agents/types/conversation-invocation.types.ts`](../types/conversation-invocation.types.ts).

---

## The unified launch entry point

Every surface — Chat, Runner, Shortcut, App, Builder — constructs a `ConversationInvocation` object and hands it to the single [`launchConversation`](../redux/execution-system/thunks/launch-conversation.thunk.ts) thunk. **No per-surface launch functions exist.** The thunk picks the endpoint from three inputs and dispatches accordingly:

1. `routing.apiEndpointMode` (`"manual" | "agent"`)
2. `origin.isEphemeral` (bool)
3. Whether `identity.conversationId` is already present (first-turn vs subsequent)

---

## Endpoint matrix

| Mode | Ephemeral | Turn | Endpoint | Body |
|---|---|---|---|---|
| `manual` (Builder) | false | any | `POST /ai/manual` | Flattened live definition + full client-held history + invocation inputs; no wire `conversation_id` |
| `agent` (Runner/Chat/Shortcut/App) | false | 1 | `POST /ai/agents/{id}` | Invocation inputs only |
| `agent` | false | 2+ | `POST /ai/conversations/{conversationId}` | Invocation inputs only |
| `agent` | true | 1 | `POST /ai/agents/{id}` with `is_new: false, store: false`, no `conversationId` | Invocation inputs |
| `agent` | true | 2+ | `POST /ai/chat` (NOT `/conversations/{id}` — DB row does not exist) | Full accumulated message history from Redux `messages/` slice |

This routing table is the single contract the entire invocation pipeline enforces. Full canonical encoding: `features/agents/types/conversation-invocation.types.ts:314-331`.

---

## Body assembly (`assembleRequest`)

`assembleRequest(state, instanceId)` reads across all 10 instance slices + `appContext` and builds a snake_case payload. Key mappings:

| Source slice | Selector | → Payload field |
|---|---|---|
| `instanceUserInput` | direct read | `user_input` (string or content block array) |
| `instanceResources` | `selectResourcePayloads` | merged into `user_input` as blocks |
| `instanceVariableValues` | `selectResolvedVariables` | `variables` |
| `instanceContext` | direct read | `context` |
| `instanceModelOverrides` | diff against snapshot | `config_overrides` (deltas only) |
| `instanceClientTools` | direct read | `client_tools` |
| `appContext` | direct read | `scope` (org, workspace, project, task) |

**Invariants:**
- `assembleRequest` never reads `agentDefinition`. The agent ID on the instance is the only link back to the definition, and the server resolves it (except in Builder `manual` mode, where the full definition is on `invocation.builder.*`).
- Payload is ALWAYS snake_case. Client is camelCase. Conversion happens once, at the boundary.
- An opted-in random choice is represented in `variables` by the exact object `{type:"auto_assign",strategy:"random"}`. Consumer surfaces never preselect an option; stored-agent execution resolves against the server-loaded definition. Builder manual execution additionally sends `variable_definitions` because its unsaved definition is the source of truth.

---

## The conceptual shift

Once the first saved-agent turn completes, **there is no longer an "agent" in play — there is an *agent conversation*.** The conversation is a live instance of the agent that evolves through messages and tool calls. You do not re-send instructions. You do not re-send history. You append to a running entity the server fully owns.

- First request: "here is an agent, start a conversation with it."
- Every subsequent request: "here is more input, advance the conversation."

This is why the endpoint shape shifts after turn 1: from agent-identified (`/ai/agents/{id}`) to conversation-identified (`/ai/conversations/{conversationId}`).

**Builder manual mode is the deliberate exception.** Every turn stays on `/ai/manual`, re-sends the live definition and client-held history, omits a wire `conversation_id`, and receives a fresh server conversation for that request. The Builder keeps a separate stable local Redux key so the panel still behaves as one multi-turn test session.

---

## The ephemeral branch

When `origin.isEphemeral: true`, the invocation is never persisted:

- Turn 1 → `POST /ai/agents/{id}` with `is_new: false, store: false` and **no** `conversationId`.
- Turn 2+ → `POST /ai/chat`. The client sends the **full accumulated message history** from the Redux `messages/` slice every turn. There is no DB row to target; the server is stateless for this branch.

**Why this exists:** public chat, throwaway tests, anonymous surfaces — anywhere we don't want a DB write. It costs more bandwidth (full history per turn) but keeps the server stateless.

**Do not** try to call `POST /ai/conversations/{conversationId}` on an ephemeral turn — the row doesn't exist and the call 404s.

---

## Builder vs. Runner payload difference (the critical distinction)

Both surfaces dispatch `launchConversation`. Both eventually fire a fetch. The difference is what's in the body:

**Builder** (`routing.apiEndpointMode: "manual"`):
```
POST /ai/manual
{
  // live definition flattened for the manual executor
  ai_model_id, messages, tools_replace, variable_definitions, ...modelSettings,
  // plus standard inputs and Builder controls
  variables, context, organization_id, project_id, task_id,
  debug, store, max_iterations, max_retries_per_iteration
}
```
Server runs exactly these bytes. No cache lookup, no current-pointer resolution.

**Runner / Chat / Shortcut / App** (`routing.apiEndpointMode: "agent"`):
```
POST /ai/agents/{id}
{
  variables, context, user_input, scope, config_overrides
}
```
Server hydrates the definition from the agent ID (current pointer or pinned version per `engine.isVersion`).

**Why the split exists:** the Builder engineer is editing. Their in-memory state may not match server cache. The Runner + consumer surfaces are invoking a saved, stable agent — caching is a feature, not a hazard.

---

## Key flows

### Flow 1 — New Chat turn (most common)

1. User types a message in Chat → dispatch `launchConversation` with `apiEndpointMode: "agent"`, `origin: "manual"`.
2. No `identity.conversationId` → first-turn branch.
3. Body assembled → `POST /ai/agents/{id}`.
4. Server responds with conversation ID in an early `data` event.
5. Client stores conversationId on the instance.
6. Second user turn → same thunk → `identity.conversationId` present → `POST /ai/conversations/{conversationId}`.

### Flow 2 — Builder test turn

1. Engineer in Builder clicks run. Dispatch `launchConversation` with `apiEndpointMode: "manual"`.
2. `assembleManualRequest` reads the live definition and all committed panel turns from Redux; it omits `conversation_id`.
3. `POST /ai/manual`.
4. The server mints a wire conversation for this stored request; `processStream` maps its events onto the stable local panel key.
5. Persisted-message follow-up work (including artifact materialization) uses the reserved message's database conversation, never the local key.

### Flow 3 — Ephemeral public chat

1. Public surface dispatches with `origin.isEphemeral: true`, `apiEndpointMode: "agent"`.
2. Turn 1 → `POST /ai/agents/{id}` with `store: false`. No DB row written.
3. Response streams back. Client builds up `messages/` slice locally.
4. Turn 2 → `POST /ai/chat` with full history. Not `/conversations/{id}` — there is none.

---

## Invariants & gotchas

- **Never bypass `launchConversation`.** Every surface goes through it. Custom launch paths fragment the routing contract and break observability.
- **The full definition is sent from the client ONLY in Builder (`manual`) mode.** Any other path sending the full definition is a bug.
- **Manual wire identity and Builder UI identity are different by design.** Never use the stable local panel key as a database FK; resolve through the server-reserved message/conversation.
- **`is_new: false, store: false` is the ephemeral signature on turn 1.** Don't confuse with normal agent mode.
- **Ephemeral turn 2+ MUST hit `/ai/chat`, not `/conversations/{id}`.** There is no conversation row to find.
- **`assembleRequest` does not read `agentDefinition`.** If it starts to, we've broken the layer-3 isolation contract.
- **Snake_case at the boundary, camelCase everywhere in TypeScript.** Do not leak snake_case into Redux state.

---

## Related

- [`AGENT_BUILDER.md`](./AGENT_BUILDER.md) — the `manual` mode surface
- [`AGENT_RUNNER.md`](./AGENT_RUNNER.md) — the `agent` mode surface with observability
- [`AGENT_ORCHESTRATION.md`](./AGENT_ORCHESTRATION.md) — what happens inside a single turn
- [`STREAMING_SYSTEM.md`](./STREAMING_SYSTEM.md) — what comes back over the wire
- [`../conversation-invocation-reference.md`](../conversation-invocation-reference.md) — `ConversationInvocation` shape reference

---

## Change log

- `2026-07-24` — codex: Enforced the documented ephemeral turn-1 identity contract in the shared saved-agent executor: `is_new:false, store:false` now omits the local Redux `conversation_id`, and the shared stream runner keeps server-minted transient wire IDs mapped to that local key. Fixes headless Agent Set prompt sync and every other one-shot ephemeral saved-agent launch.
- `2026-07-18` — codex: Replaced the retired `/prompts`/manual-continuation model with the live `/ai/manual` contract: every Builder turn carries the flattened live definition and client history, receives a fresh server wire conversation, and maps back to one stable local Redux test-panel key. Documented the message-derived persistence identity required by artifacts.
- `2026-07-18` — codex: Documented the automatic-assignment marker and Builder-only live `variable_definitions` companion payload.
- `2026-04-22` — claude: initial doc. Canonical endpoint matrix extracted from `agent-system-mental-model.md` §4 and `conversation-invocation.types.ts`.

---

> **Keep-docs-live:** changes to the endpoint matrix, `assembleRequest` body shape, ephemeral routing, or the Builder-vs-Runner payload contract must update this doc. This is the most-referenced contract in the system.
