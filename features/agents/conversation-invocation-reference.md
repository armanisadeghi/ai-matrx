# `ConversationInvocation` — Field Reference

Everything a caller needs to pass when invoking an agent, shortcut, or manual prompt in AI Matrx. Organized by group to match the shape of the type.

For each field: **type**, **default**, and a plain-English description of what it does and when you'd actually set it.

> **Authoritative source:** [`features/agents/types/conversation-invocation.types.ts`](features/agents/types/conversation-invocation.types.ts). This doc is a plain-English mirror of that file — if the two diverge, the type file wins.
>
> **Single entry point:** every invocation goes through [`launchConversation`](features/agents/redux/execution-system/thunks/launch-conversation.thunk.ts). No per-surface launch functions.
>
> **Related:** [`agent-system-mental-model.md`](agent-system-mental-model.md) for the why · [`ROADMAP-agent-ecosystem-rebuild.md`](ROADMAP-agent-ecosystem-rebuild.md) for what's next · [`audits/`](audits/) for tactical checklists (salvage, type duplication, legacy deletion waves).

---

## Final shape (at a glance)

```ts
interface ConversationInvocation {
  identity:  { conversationId?; surfaceKey }
  engine:    { kind; agentId?; isVersion?; shortcutId?; manual? }
  routing:   { apiEndpointMode; reuseConversationId? }
  origin:    { origin; sourceApp?; sourceFeature; isEphemeral? }
  inputs?:   { variables?; userInput?; overrides? }
  scope?:    { applicationScope? }
  relation?: { parentConversationId?; forkedFromId?; forkedAtPosition? }
  display?:  { ...presentation flags... }
  behavior?: { allowChat?; autoRun?; usePreExecutionInput?; jsonExtraction? }
  callbacks?:{ onCompleteId?; onTextReplaceId?; onTextInsertBeforeId?; onTextInsertAfterId?; originalText? }
  builder?:  BuilderAdvancedSettings | null
  metadata?: Record<string, unknown>
}
```

---

## 1. `identity`

Who this invocation is and where it's coming from.

| Field | Type | Default | What it does |
|---|---|---|---|
| `conversationId` | `string?` | `undefined` | If present, this is a **continuing** conversation — request routes to `conversations/{id}`. If absent, it's a **first turn** — request routes to `agents/{id}`. |
| `surfaceKey` | `string` (required) | — | Stable key for the UI surface making the call (e.g. `"agent-builder"`, `"agent-runner:<agentId>"`, `"code-editor"`). Used for focus tracking and to resolve which UI-context contract applies for variable binding. |

---

## 2. `engine`

**The brain of the operation** — the source of the execution logic. What's actually driving this invocation? A stored agent definition, a stored shortcut, or a raw object passed in directly?

*Independent of `routing.apiEndpointMode`, which is about the API call shape.*

| Field | Type | Default | What it does |
|---|---|---|---|
| `kind` | `"agent" \| "shortcut" \| "manual"` | — | Where the execution logic comes from. **agent** = resolve from a stored agent definition. **shortcut** = resolve from a stored shortcut (which pins a specific agent version + bindings). **manual** = the logic object is passed in directly, not looked up. |
| `agentId` | `string?` | `undefined` | The agent to run, when `kind === "agent"` or `"shortcut"`. |
| `isVersion` | `boolean?` | `false` | When `true`, `agentId` is interpreted as a specific version ID rather than a pointer to the current version. **Shortcuts and Apps must always set this `true`** — they only work with pinned versions to prevent drift. Chat/Runner default to `false` (current pointer). |
| `shortcutId` | `string?` | `undefined` | Which shortcut triggered this, when `kind === "shortcut"`. |
| `manual.label` | `string?` | `undefined` | Display label for a manual invocation (no agent definition to pull one from). |
| `manual.baseSettings` | `Partial<LLMParams>?` | `undefined` | Model params for a manual invocation. |

---

## 3. `routing`

The **API call mode** — a different question from `engine.kind`.

`engine.kind` = *where the logic comes from*. `routing.apiEndpointMode` = *which API call shape to use*.

| Field | Type | Default | What it does |
|---|---|---|---|
| `apiEndpointMode` | `"agent" \| "manual"` | — | Selects the API path family. **agent** = full harness API (`POST /ai/agents/{id}` on turn 1 → `POST /ai/conversations/{id}` on turn 2+). **manual** = raw prompt-style API (`POST /prompts`) — what the Builder uses. Ephemeral invocations (see `origin.isEphemeral`) override the turn-2+ destination to `POST /ai/chat`. Legacy surfaces sometimes use `"chat"` as a second value; per [audit 01](audits/01-new-work-audit.md) the `launch-conversation.thunk.ts` adapter maps `"chat"` → `"manual"` (same as the endpoint swap `/ai/chat → /ai/manual`). |
| `reuseConversationId` | `boolean?` | `false` | **Only meaningful when `apiEndpointMode === "manual"` and `display.autoClearConversation === false`.** A Builder-mode tool for engineers iterating on a prompt chain. `true` → the next call sends the *same* `conversationId` and the server **replaces** the previous conversation (one DB row; engineer overwrites their last try). `false` → the next call generates a *new* `conversationId` and the previous chain stays in the DB untouched (two DB rows; engineer keeps the old chain and branches). In `agent` mode this flag has no effect — the conversationId is always reused. |

### Endpoint routing table (from the type file)

| `apiEndpointMode` | `isEphemeral` | Turn 1 | Turn 2+ |
|---|---|---|---|
| `"agent"` | `false` | `POST /ai/agents/{id}` | `POST /ai/conversations/{id}` |
| `"agent"` | `true` | `POST /ai/agents/{id}` (`is_new:false, store:false`, no conversationId) | `POST /ai/chat` (`is_new:false, store:false`, full accumulated history from the `messages/` slice) |
| `"manual"` | any | `POST /prompts` | `POST /prompts` (`reuseConversationId` toggles server REPLACE vs BRANCH) |

Callers never construct this table manually — `launchConversation` reads from the invocation and picks the endpoint.

---

## 4. `origin`

Where the invocation is coming from *inside the product*. Used for logging, analytics, and the `source_app` / `source_feature` columns stamped onto `cx_conversation`.

| Field | Type | Default | What it does |
|---|---|---|---|
| `origin` | `InstanceOrigin` (required) | — | Typed trigger source. One of **`"manual"`** (user opened a runner/chat surface and typed), **`"shortcut"`** (triggered by a Shortcut), **`"test"`** (parallel testing harness), **`"sub-agent"`** (spawned by a parent request). Independent of `engine.kind` — a sub-agent can come from any engine type. |
| `sourceApp` | `string?` | `undefined` | Which AI Matrx app initiated this (e.g., `"flashcard-generator"`, `"quiz-app"`). |
| `sourceFeature` | `SourceFeature` (required) | — | Which feature *within* the source app. Typed enum; current values: `"agent-builder"`, `"agent-runner"`, `"agent-tester"`, `"agent-launcher-sidebar"`, `"agent-creator-panel"`, `"agent-generator"`, `"chat-interface"`, `"context-menu"`, `"prompt-app"`, `"research"`, `"code-editor"`, `"agent-content-window"`. |
| `isEphemeral` | `boolean?` | `false` | When `true`, **no rows are persisted to the database** for this invocation. The Redux `messages/` slice is the only source of truth. Routing implication: turn 1 fires `POST /ai/agents/{id}` with `is_new:false, store:false` and no `conversationId`; turn 2+ fires `POST /ai/chat` (not `/conversations/{id}`, which would 404). Client sends the full accumulated history each turn. Use for fire-and-forget shortcuts, test runs, and any surface that shouldn't leave a DB trail. |

---

## 5. `inputs`

What the caller is actually providing for this turn.

| Field | Type | Default | What it does |
|---|---|---|---|
| `variables` | `Record<string, unknown>?` | `undefined` | Values for the agent's declared variables. Keyed by variable name. |
| `userInput` | `string?` | `undefined` | Optional free-text message. On first turn this is the opening message; on subsequent turns it's the new message. Can be absent when a shortcut is fully variable-driven. |
| `overrides` | `Partial<LLMParams>?` | `undefined` | Caller-supplied overrides of model settings. Delta-only — only the keys provided are sent. Applied only for settings the agent's engineer has marked as overridable. |

---

## 6. `scope`

The active org/project/task scope context for this invocation.

| Field | Type | Default | What it does |
|---|---|---|---|
| `applicationScope` | `ApplicationScope?` | `undefined` | The scope context (org / project / task) the invocation inherits. Stamped onto `cx_conversation.organization_id` / `project_id` / `task_id`, and surfaced to **context resolvers** so context policies can pull org-scoped data. Read at invocation time from `appContextSlice`. Type lives at [`features/agents/utils/scope-mapping.ts`](features/agents/utils/scope-mapping.ts); shape is `{ selection?; content?; context?; [key: string]: unknown }`. |

---

## 7. `relation`

How this conversation is linked to *other* conversations. These fields map directly to columns on `cx_conversation`.

> **Quick aside on the AI Matrx fork model:** forking doesn't create a shared-data branch. The server duplicates the source conversation + all its messages up to the fork point into a brand-new, fully independent conversation, then stamps a reference so we remember where it came from. Each message in the fork is a standalone row; nothing is shared. `parentConversationId` is a *different* relationship — it's for nested / sub-conversations, not forks.

| Field | Type | Default | What it does |
|---|---|---|---|
| `parentConversationId` | `string?` | `undefined` | Links this conversation to a parent — for sub-agent calls, nested conversations, or other cases where one conversation spawns another. Maps to `cx_conversation.parent_conversation_id`. |
| `forkedFromId` | `string?` | `undefined` | The conversation this one was forked from. Maps to `cx_conversation.forked_from_id`. |
| `forkedAtPosition` | `number?` (smallint) | `undefined` | The message position in the source conversation where the fork branched off. Maps to `cx_conversation.forked_at_position`. |

---

## 8. `display`

How the invocation is rendered. This is the largest group because it's where most user-experience customization for shortcuts lives.

| Field | Type | Default | What it does |
|---|---|---|---|
| `displayMode` | `ResultDisplayMode?` | caller-defined | One of 13 presentation styles — where/how the result shows up. Values: `modal-full`, `modal-compact`, `chat-bubble`, `inline`, `sidebar`, `flexible-panel`, `panel`, `toast`, `floating-chat`, `direct` *(caller manages the UI itself)*, `background`, `chat-collapsible`, `chat-assistant`. |
| `variableInputStyle` | `VariableInputStyle?` | varies by display mode | One of 6 layouts for variable collection: `inline`, `wizard`, `form`, `compact`, `guided`, `cards`. Layers on top of most `displayMode`s; unsupported combinations fall back to a default. |
| `showVariablePanel` | `boolean?` | `false` | Whether to **show the variable inputs to the user** — regardless of whether those values came from the user or were programmatically supplied by a shortcut. Set `true` when you want the user to see (and potentially edit) what's being sent. |
| `showDefinitionMessages` | `boolean?` | `true` | Whether messages baked into the agent definition (the ones containing variable placeholders) are **shown at all** in the transcript. Set `false` for shortcuts where you want the user to see only their own message (e.g., "I'm confused") rather than the full injected payload. |
| `showDefinitionMessageContent` | `boolean?` | `false` | Only relevant when `showDefinitionMessages` is `true`. If `true`, show the **fully rendered** message (all variables substituted). If `false`, show only the parts the user actually typed and hide the programmatically-injected content. |
| `showSubAgents` | `boolean?` | `true` | When `false`, sub-agent turns are filtered out of the transcript selector (`selectDisplayMessages`) but still live in the `messages/` slice — **purely a rendering filter, no data loss**. Set `false` when a parent agent spawned helpers whose internal back-and-forth isn't useful to the end user. |
| `hideReasoning` | `boolean?` | `false` | Hide the model's reasoning/thinking output mid-run. |
| `hideToolResults` | `boolean?` | `false` | Hide raw tool-call results from the transcript. Useful when tool output is noisy and the final summary is what the user actually wants to see. |
| `showAutoClearToggle` | `boolean?` | `false` | Whether to expose the auto-clear toggle in the UI so the user can flip it themselves. |
| `autoClearConversation` | `boolean?` | `false` | When `true`, the conversation clears after each turn — there can never be more than one turn. The next user input (or variable change) starts the agent over from scratch. **Especially useful for Agent Engineers in the Builder**, where every invocation should be a clean-slate test. |
| `preExecutionMessage` | `string \| null` | `null` | Message shown to the user before firing, when `behavior.usePreExecutionInput` is `true`. Gives them a chance to read, edit, or confirm before the agent actually runs. |

---

## 9. `behavior`

How the conversation runs. **`allowChat`, `autoRun`, and `usePreExecutionInput` are independent — each answers a different question.**

| Field | Type | Default | What it does |
|---|---|---|---|
| `allowChat` | `boolean?` | `true` | **Can the user keep talking after the first turn?** This is the multi-turn switch. `true` = conversation; `false` = one turn and done. |
| `autoRun` | `boolean?` | `false` | **Should the invocation fire immediately, skipping the variable-entry UI?** `true` = no chance to fill variables or type anything — runs with whatever's already bound (from the shortcut, from defaults) and the user sees the response. `false` = show variable inputs first. |
| `usePreExecutionInput` | `boolean?` | `false` | **Only meaningful when `autoRun: true`.** Inserts a lightweight optional gate — a chance for a partial user input between firing and response. Nonsensical without `autoRun` (the user already entered variables; asking for more after would be out of order). Pairs with `display.preExecutionMessage`. |
| `jsonExtraction` | `JsonExtractionConfig?` | `undefined` | Streaming JSON extraction config — for agents that produce structured output that should be parsed incrementally as it streams, rather than waiting for full completion. |

### The four meaningful UX patterns `autoRun` × `allowChat` produces

| `autoRun` | `allowChat` | Resulting UX |
|---|---|---|
| `false` | `true` | **Standard chat** — user fills variables + input, fires, keeps talking. (Chat page.) |
| `false` | `false` | **Form** — user fills variables + input, fires once, done. |
| `true` | `true` | **Multi-turn shortcut** — click fires immediately, user can chat with the result. |
| `true` | `false` | **Pure shortcut** — click, see result, end. The "I'm Confused" pattern. |

---

## 10. `callbacks`

Callback wiring. Function references never live on the invocation itself — they're registered via [`CallbackManager`](utils/callbackManager.ts), and the invocation just carries the ID.

| Field | Type | Default | What it does |
|---|---|---|---|
| `widgetHandleId` | `string?` | `undefined` | ID returned by `callbackManager.registerWidgetHandle(handle)` — or by the `useWidgetHandle(handle)` React hook, which wraps it. The handle is **one object** carrying both capability methods (`onTextReplace`, `onAttachMedia`, `onCreateArtifact`, ...) and lifecycle (`onComplete`, `onCancel`, `onError`). The launch path reads the handle live on every turn to derive `client_tools`; `process-stream.ts` routes `tool_delegated` events for `widget_*` tools to the matching method and fires `onComplete` at stream end. |
| `originalText` | `string?` | `undefined` | Original text payload for text-manipulation widgets (translate-selection, replace-selection shortcuts). The selection the user had highlighted before the shortcut fired. Forwarded to the handle's text methods alongside the agent's response. |

**Everything collapsed into one handle.** Before this refactor there were four per-action ID fields plus `originalText`. Capability + lifecycle now live in a single object; the invocation just points to it. See [`docs/WIDGET_HANDLE_SYSTEM.md`](docs/WIDGET_HANDLE_SYSTEM.md) for the handle contract and [`components/tools-management/CLIENT_SIDE_TOOLS.md`](components/tools-management/CLIENT_SIDE_TOOLS.md) for the underlying stream/POST protocol.

---

## 11. `builder`

Advanced settings specific to Builder-mode invocations.

| Field | Type | Default | What it does |
|---|---|---|---|
| `builder` | `BuilderAdvancedSettings \| null` | `null` | Populated only when `routing.apiEndpointMode === "manual"`. Shape: `{ debug, store, maxIterations, maxRetriesPerIteration, useStructuredSystemInstruction, structuredInstruction }`. Defaults: `{ debug: false, store: true, maxIterations: 100, maxRetriesPerIteration: 2, useStructuredSystemInstruction: false, structuredInstruction: {} }`. |

---

## 12. `metadata`

Open escape hatch for future or experimental fields that don't warrant a dedicated group yet.

| Field | Type | Default | What it does |
|---|---|---|---|
| `metadata` | `Record<string, unknown>?` | `undefined` | Free-form key-value bag. Use sparingly — anything that ends up here and becomes important should eventually graduate into a proper group. |

---

## What got dropped (and why)

Three fields were previously hanging around on the invocation that shouldn't have been:

- **`showVariables`** — was derived state (a yes/no question computed from `agent has variables` × `showVariablePanel` × `isFirstTurn` × `autoRun`). Now handled as a selector; removed from the invocation type entirely.
- **`ready`** — dropped entirely.
- **`hiddenMessageCount`** — Builder-internal, not part of this contract.

`reuseConversationId` was almost dropped but survived in narrow form — it's a real mechanism, just Builder-scoped, and now properly lives under `routing`.

---

## What changed from the prior draft of this doc

Two questions the old draft left open are now locked:

1. **`origin.isEphemeral`** — confirmed to gate DB persistence. `true` → no rows written; turn 2+ goes to `POST /ai/chat` with the full history from the `messages/` slice. See the routing table in §3.
2. **`display.showSubAgents`** — confirmed as a transcript rendering filter only. When `false`, sub-agent turns are hidden in `selectDisplayMessages` but remain in the `messages/` slice. No data loss.

One name change:

- **`routing.conversationMode` → `routing.apiEndpointMode`**. The legacy `"chat"` value of this enum is gone; the canonical values are `"agent"` and `"manual"`.

And one group is scheduled to be rewritten:

- **`callbacks`** — currently holds four per-action IDs + `originalText`. Per [`TODO-widget-tools-plan.md`](TODO-widget-tools-plan.md), this will collapse to `{ widgetHandleId?; originalText? }` once the Widget Handle + Client Tools system ships. No other invocation group changes as part of that refactor.
