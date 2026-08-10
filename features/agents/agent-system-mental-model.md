# AI Matrx — Agent System Mental Model

> **Agents are autonomous AI specialists.** The AI Matrx Harness is what turns a raw model into one — and lets it be invoked through many surfaces, sometimes without the user saying a single word. A click can be enough. Chat is one surface among many, not the default.

> **Status legend used below:** ✅ implemented · 🛠️ scaffolded (types/redux/routes exist, not yet wired end-to-end) · 🚧 planned (design locked, implementation pending)

### What the Harness provides

Every item below is included out of the box, and **every piece is toggleable, tunable, or fully customizable by the Agent Engineer in the Builder**:

- Persistent, engineered **context & memory**
- Safe, real-world **tool execution** and sandboxing
- Reliable **orchestration** and self-correction loops
- **State persistence** and observability for long-running tasks
- **Minimalism that scales** with the model — give a strong model less scaffolding; give a weak one more

The system runs in three stages — **Build → Test → Consume** — with three consumer surfaces.

---

## 1. Agent Builder — *the forge* ✅

**Path:** [`app/(authenticated)/agents/[id]/build/page.tsx`](app/(authenticated)/agents/[id]/build/page.tsx) · **API:** `POST /prompts` · **`apiEndpointMode: "manual"`**

Where engineers craft an agent's identity: instructions, model, settings, tools, variables, and context slots. The interface is a manual chat that hits the `prompts` endpoint with raw API calls (similar in spirit to Anthropic / OpenAI / Google direct APIs, but Matrx-shaped). Every request stands alone and is fully editable — nothing is hidden, nothing is implicit. This is the only surface with that level of control.

**What gets tuned here:** system prompt, model, temperature, thinking budget, token limits, tool access, variable definitions, context slots, permissions (e.g., whether consumers may see or override model settings), and the **default UI component + help text for each variable** (used when Runner or Chat needs to render an input for it).

**Builder-specific advanced settings** are captured in `BuilderAdvancedSettings` and travel on `ConversationInvocation.builder`:

- `debug`, `store`, `maxIterations`, `maxRetriesPerIteration`
- `useStructuredSystemInstruction` + `structuredInstruction` (for structured system prompts)

**Examples:**
- **Coding agent** — Opus-tier, max thinking, large token budget, tools for file read/write, patches, DB queries, shell. Trusted for depth; few guardrails.
- **Content structurer** — Haiku-tier, temp ~0.2, thinking off, no tools. Unstructured text → outline or table. Cheap, fast, deterministic.

### Versioning (critical)

**Every save in the Builder creates a new Agent Definition version.** The version table stores all versions; the "current" agent is a pointer to one of them.

- **Runner and Chat** default to the current version (Runner can pin any past version for testing). Controlled by `engine.isVersion = false`.
- **Shortcuts and Apps** pin to a **specific version** and stay frozen on purpose — since they depend on the agent's variable structure, an unplanned change would break every place they're embedded. They always set `engine.isVersion = true`. Drift is surfaced in the UI; the engineer can update on demand.

---

## 2. Variables vs. Context Slots

A core distinction the rest of the doc relies on.

> **Variables are things that would leave the agent confused if missing. Context slots are things the agent can use to do an even better job.**

**Variables** — named, declared inputs the agent *requires*. Each is defined in the Builder with a default UI component and help text. Bound **by name** from whatever the caller provides via `invocation.inputs.variables`.

**Context slots** — named, declared inputs that are **auto-filled in the background** from ambient sources when available: user profile, organization settings, active project, scope presets, conversation history, selection, and so on. Their absence is graceful; they enhance, they don't block.

**Everything else in context** — ambient data the agent hasn't declared a slot for — is still reachable, but **via tool call** rather than injection. The agent pulls what it needs.

*Variables are required inputs. Context slots are optional auto-fills. Anything else is fetched on demand.*

### Scope mapping

The `invocation.scope.applicationScope` object carries surface-level context (selection, content, broader context blob) that a resolver uses to fill variables and context slots. Shape lives at [`features/agents/utils/scope-mapping.ts`](features/agents/utils/scope-mapping.ts):

```ts
interface ApplicationScope {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}
```

Resolution: if the target name matches a declared variable → fills the variable. If it matches a context slot → fills the slot. Otherwise → surfaces as ad-hoc context the agent can reach via tool call. Stamped onto `cx_conversation.organization_id` / `project_id` / `task_id`.

---

## 3. Agent Runner — *the test track* ✅

**Path:** [`app/(authenticated)/agents/[id]/run/page.tsx`](app/(authenticated)/agents/[id]/run/page.tsx) · **`apiEndpointMode: "agent"`** · **`origin: "manual"` or `"test"`**

Runner and Chat are **the same runtime** — Runner is just Chat with observability turned on and the agent marked read-only. It defaults to the current version, but any past version can be pinned for comparison via `engine.isVersion`.

**What engineers see that end users don't:** server-side logs, stream debugging, token counts and costs per turn, tool invocations and their results, raw model settings in effect.

**Example:** Engineer loads the Tutor agent, sets `learner_level = 8th grade` and `subject_context = photosynthesis`, and fires the same agent through ten scenario variants to find where it breaks. The agent's guts don't move; the inputs do.

---

## 4. Chat — *the conversational surface* 🚧

**Path (not yet built):** `app/(authenticated)/chat/...` · **`apiEndpointMode: "agent"`** · **`origin: "manual"`**, **`sourceFeature: "chat-interface"`**

Where users converse with any agent they have access to. Identical runtime to Runner, minus the debugging. (Sharing and visibility are handled by the existing AI Matrx sharing system — out of scope here.)

> **Today:** the legacy chat at `/features/cx-conversation/` + `/features/cx-chat/` still services conversations. A deprecated route stub lives at [`app/(authenticated)/deprecated/chat/`](app/(authenticated)/deprecated/chat/). The new agent-first `/app/(authenticated)/chat/` route has not been built. See the roadmap doc for the rebuild plan.

### The request lifecycle (this is how Runner and Chat both work)

**First request** → `POST /ai/agents/{id}`
Client sends: `variables`, `scope`, `overrides`, `userInput`. That's the entire payload. The client **never sees** the agent's instructions, system prompt, model choice, or internals — those are the engineer's secrets, owned by the server. What the client *does* get back when loading an agent is the list of variable and context slots it needs to fill, with their default UI components and help text. (The engineer may opt to expose model choice and settings for override, but that is a deliberate permission, not the default.)

**Every request after** → `POST /ai/conversations/{conversationId}`
Client sends: the new `userInput`, plus any permitted `overrides`. Nothing else. The server holds history, state, tool results, and everything else.

**Ephemeral branch** (`origin.isEphemeral: true`) — the invocation is never written to the DB:
- Turn 1 → `POST /ai/agents/{id}` with `is_new: false, store: false`, no `conversationId`.
- Turn 2+ → `POST /ai/chat` (not `/conversations/{id}`, which would 404 because no DB row exists). Client sends the full accumulated message history from the Redux `messages/` slice each turn.

The full endpoint routing contract is documented in the type file: [`features/agents/types/conversation-invocation.types.ts:314-331`](features/agents/types/conversation-invocation.types.ts).

### The conceptual shift

Once the first request completes, **there is no longer an "agent" in play — there is an *agent conversation*.** An agent conversation is a live instance of the agent that evolves through messages and tool calls. You don't re-send instructions. You don't re-send history. You add to a running entity that the server fully owns.

### The unified launch entry point

Every surface (Chat, Runner, Shortcut, App, Builder) constructs a `ConversationInvocation` and hands it to the single [`launchConversation`](features/agents/redux/execution-system/thunks/launch-conversation.thunk.ts) thunk. No per-surface launch functions. The thunk picks the endpoint from `routing.apiEndpointMode` × `origin.isEphemeral` × whether `identity.conversationId` is present, adapts the grouped invocation to `ManagedAgentOptions`, and delegates to [`launchAgentExecution`](features/agents/redux/execution-system/thunks/launch-agent-execution.thunk.ts).

---

## 5. Agent Shortcuts — *invocation without conversation* 🛠️

**Status:** Redux slice, types, and selectors exist at [`features/agents/redux/agent-shortcuts/`](features/agents/redux/agent-shortcuts/). The UI surfaces that invoke them — [`UnifiedContextMenu`](features/context-menu/UnifiedContextMenu.tsx) and friends — still use the legacy prompts/builtins path. Bridge layer is pending.

A Shortcut is a first-class stored entity that wraps a specific agent definition version and **auto-maps variables from the surrounding UI context**. Most Shortcuts eliminate user input entirely — the user clicks, variables get wired in from what's already on screen, and the agent runs.

- **Agents have no awareness of Shortcuts.** A Shortcut is a wrapper; the agent sees a normal invocation with variables already filled.
- Shortcut records point to `(agentId, agentVersionId, useLatest, label, category, scopeMappings, resultDisplay, allowChat, autoRun, ...)`. They can also store source code for fully custom rendering — Shortcuts can ship UI, not just bindings.
- A Shortcut can also be configured to **trigger a Workflow** rather than a single agent (Workflows are out of scope for this doc).

### The current `AgentShortcut` type (canonical)

From [`features/agents/redux/agent-shortcuts/types.ts`](features/agents/redux/agent-shortcuts/types.ts):

```ts
interface AgentShortcut {
  id: string;
  categoryId: string;
  label: string;
  description: string | null;
  iconName: string | null;
  keyboardShortcut: string | null;
  sortOrder: number;
  agentId: string | null;
  agentVersionId: string | null;
  useLatest: boolean;              // false ⇒ version-pinned; true ⇒ follow current pointer
  enabledContexts: ShortcutContext[];
  scopeMappings: Record<string, string> | null;  // UI-context-key → agent-variable-name
  resultDisplay: ResultDisplay;    // displayMode + variableInputStyle + flags
  allowChat: boolean;
  autoRun: boolean;
  applyVariables: boolean;
  showVariables: boolean;
  usePreExecutionInput: boolean;
  isActive: boolean;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

The three-tier scoping (user / organization / project-task) means the same table backs **System, Organization, and Personal** shortcuts described below.

### How variables get bound: the UI context contract

Every surface that hosts Shortcuts — code editor, Notes, Agent Builder, user-built apps — exposes a **UI context object**. The Shortcut maps agent variables to keys on this object via `scopeMappings`. The surface author decides what those keys contain.

**Universal keys** (available on every surface):

| Key | Meaning |
|---|---|
| `selection` | Currently highlighted content |
| `textBefore` / `textAfter` | Text surrounding the selection or cursor |
| `content` | The primary payload of the current view (surface decides) |
| `context` | Broader situational context (surface decides) |
| `appFeature` | Which feature within the app the user is in |
| `featureAgentOverview` | Description of the current feature's purpose (for the agent) |
| `user_overview` | Normalized summary of the user |

**Surface-specific extensions** layer on top. The coding surface, for example, adds:

| Variable | Source | Content |
|---|---|---|
| `vsc_active_file_path` | `active_file.path` | Full path of the open file |
| `vsc_active_file_content` | `active_file.content` | Full text content |
| `vsc_active_file_language` | `active_file.language` | Language identifier (`python`, etc.) |
| `vsc_selected_text` | `selected_text` | Currently highlighted text |
| `vsc_diagnostics` | `diagnostics[]` | Formatted errors/warnings |
| `vsc_workspace_name` / `vsc_workspace_folders` | `workspace.*` | Workspace metadata |
| `vsc_git_branch` / `vsc_git_status` | `git.*` | Git state |

When a user builds their own app, they define the same kind of mapping — or the in-app AI agent writes it for them.

### The pattern that makes this powerful: `enableShortcuts` on components

The Card component is the clearest illustration. A Card has a title and a description — structured, meaningful content by construction. Flip one flag — `enableShortcuts` — and every card in the app instantly gains a context menu with **Search Web**, **Explain**, **Fact Check**, **Translate**, and whatever else is wired up.

Because the Card already *is* structured content, the binding is trivial — `content` maps to the card's body, `context` to its title. Cards look identical everywhere; the moment the flag is on, the full shortcut menu is reachable. The user sees three categories side by side:

1. **System shortcuts** — built-in across the platform.
2. **Organization shortcuts** — added by their company.
3. **Personal shortcuts** — ones they created themselves.

All three backed by fully custom agents, tools, and UI.

### Customizing a Shortcut's behavior

Shortcuts are highly configurable. Two key config axes:

**`displayMode`** — how the result is presented. One of 13:

> `inline` · `sidebar` · `modal-full` · `modal-compact` · `chat-bubble` · `flexible-panel` · `panel` · `toast` · `floating-chat` · `chat-collapsible` · `chat-assistant` · `background` · `direct` *(caller manages the UI)*

**`variableInputStyle`** — how variables are collected from the user when input is needed. One of 6 layouts:

> `inline` · `wizard` · `form` · `compact` · `guided` · `cards`

Other flags that reshape the experience:

| Flag | What it controls |
|---|---|
| `autoRun` | `true` = fire immediately, skipping variable entry; `false` = show variable inputs first |
| `allowChat` | `true` = user can keep talking after the first turn (multi-turn); `false` = one turn and done |
| `usePreExecutionInput` | With `autoRun`, still give the user a chance to edit or confirm before firing (optional `preExecutionMessage`) |
| `showVariablePanel` | Let the user see and modify auto-bound variable values |
| `showDefinitionMessages` | Expose non-system messages baked into the agent definition (see example below) |
| `showDefinitionMessageContent` | When messages are shown, show the fully-rendered content vs. just the user's literal text |
| `showSubAgents` | When `false`, sub-agent turns are filtered from the transcript selector but still live in the `messages/` slice — purely a rendering filter |
| `hideReasoning` / `hideToolResults` | Clean up what the user sees mid-run |

### One example that shows the full mechanism

**Agent:** Tutor agent with variables —
- `focus` — what the learner is working on right now
- `subject_context` — what they're studying (course, chapter, topic)
- `action` — one of: explain, go deeper, simplify, find evidence, give example
- `learner_name`, `learner_level`

**Shortcut:** "I'm Confused" button inside a flashcard module. Learner clicks it. Nothing else.

| Agent variable | UI context source |
|---|---|
| `focus` | current flashcard (front + back) |
| `subject_context` | last 5 flashcards in this session |
| `action` | `"explain"` (fixed by the Shortcut) |
| `learner_name` | user profile |
| `learner_level` | user preferences |

With `showDefinitionMessages: false`, the learner sees their first message as simply `"I'm confused"` — not the full payload of flashcard content the Shortcut actually injected. Flip it to `true` and the learner sees everything passed in. Same agent, same invocation, radically different feel.

---

## 6. Agent Apps — *purpose-built experiences* 🛠️

**Status:** Redux slice, selectors, and a provisional `AgentApp` type exist at [`features/agents/redux/agent-apps/`](features/agents/redux/agent-apps/). The backing database table (`agx_app` / `cx_app`) is not yet created — thunks currently stub and throw. No UI rendering path yet.

An App is a custom UI for a specific workflow. Where a **Shortcut auto-fills** variables, an **App provides a different way to supply them** — often one that doesn't look like AI at all. No chat box. Sometimes no model output in chat form at all — the agent's result is rendered as an **artifact** directly into the UI.

> **On artifacts:** AI Matrx artifacts are **bidirectionally interactive**. The model produces a structured output (task list, flashcard set, form, widget); the UI renders it as a real, usable component; the user's interactions with it (checking a task off, reordering cards, editing a field) are passed back to the model on the next turn. Model-authored artifacts can also sync with real application state — a generated task list can become actual tasks in the app. This is a significant departure from the one-way artifacts most providers offer.

### The current `AgentApp` type (provisional)

From [`features/agents/redux/agent-apps/types.ts`](features/agents/redux/agent-apps/types.ts):

```ts
interface AgentApp {
  id: string;
  label: string;
  description: string | null;
  iconName: string | null;
  origin: "template" | "ai_generated" | "custom";
  templateId: string | null;
  sourceCode: string | null;
  primaryAgentId: string | null;
  primaryAgentVersionId: string | null;
  useLatest: boolean;
  embeddedShortcutIds: string[];
  scopeMappings: Record<string, string> | null;
  isActive: boolean;
  isPublic: boolean;
  userId: string | null;
  organizationId: string | null;
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Three ways to create an App** (matching the `origin` enum):
1. **Start from a template** — a library of standard scaffolds the user can customize.
2. **Describe your vision** — the in-app AI agent builds the App for you (`"ai_generated"`).
3. **Build fully custom** — as long as the App stays within the structural rules of the framework.

Apps can contain Shortcuts (`embeddedShortcutIds`). Shortcuts inside an App can invoke agents from *other* Apps. This composition is where the model gets powerful.

### The example that demonstrates the whole picture

**Flashcard Generator App.** You land on a page. Enter topic, grade level, card count. Click generate. You receive a full flashcard interface — rendered as an artifact by the Flashcard Generator agent. To you, this is a flashcard website. There's no chat. You may not even realize an AI was involved.

**Inside that flashcard interface** lives the "I'm Confused" Shortcut from above, invoking the Tutor agent when you get stuck on a card.

**Also inside:** a "Make Me a Quiz" Shortcut that invokes the Quiz Maker agent with topic and cards auto-passed. You take the quiz inside the Quiz App (another App).

**Inside the Quiz App,** when you miss questions, a "Missed Question Study Aids" feature appears. One option: "Make Flashcards." That Shortcut invokes the Flashcard Generator agent — the same one that started the chain — feeding it the missed topics and your profile.

You've used three agents (Flashcard Generator, Tutor, Quiz Maker) across two Apps, connected by Shortcuts, and never once typed a prompt or opened a chat window. **That's the model.**

---

## 7. Widget Handle + Client Tools ✅

**Status:** Shipped. Full contract + usage in [`features/agents/docs/WIDGET_HANDLE_SYSTEM.md`](docs/WIDGET_HANDLE_SYSTEM.md).

When a Shortcut or App wants the agent to mutate surrounding UI — replace selected text, insert text, update a record, attach media — it registers a **Widget Handle** via the `useWidgetHandle(handle)` React hook: a single object containing the widget's method implementations plus lifecycle (`onComplete`, `onCancel`, `onError`). The invocation carries only a `widgetHandleId`.

**Per-turn derivation.** `execute-instance.thunk.ts` and `execute-chat-instance.thunk.ts` read the handle live via `callbackManager.get(widgetHandleId)` every turn and derive `client_tools` from the subset of methods the handle implements. Handle added after a conversation is rehydrated? Capability added via feature flag between turns? Works — the source of truth is the live handle, not a frozen snapshot from launch time.

**Stream routing.** When the model calls a `widget_*` tool mid-stream, the server emits a `tool_delegated` event; `process-stream.ts` branches on `isWidgetActionName(tool_name)` and dispatches `dispatchWidgetAction` which routes to the matching handle method, batches results through a microtask queue, and POSTs one consolidated request per conversationId to `/ai/conversations/{id}/tool_results`. The stream is never paused for widget tools (fast + fire-and-forget); non-widget delegated tools still pause.

**Lifecycle firing.** `handle.onComplete` fires at stream end for EVERY display mode (not just autoRun/direct as the prior design did). `handle.onError` fires on widget-method failures AND on stream-level errors.

Ten canonical widget tools live in `tool.definition` (tag `widget-capable`) and
are bound to `matrx-ai-core` through `tool.binding`:

`widget_text_replace` · `widget_text_insert_before` · `widget_text_insert_after` · `widget_text_prepend` · `widget_text_append` · `widget_text_patch` · `widget_update_field` · `widget_update_record` · `widget_attach_media` · `widget_create_artifact`

Python server-side implementations live at `matrx_ai.tools.implementations.widgets.*` (same name, same schema, owned by the Python team).

---

## 8. Message CRUD — *structured edits on a live conversation* ✅

Once an agent conversation exists, edits to it flow through dedicated thunks in [`features/agents/redux/execution-system/message-crud/`](features/agents/redux/execution-system/message-crud/):

- `editMessage` — DB-faithful content edit
- `forkConversation` — fork at a given message position (server duplicates the source conversation + messages up to the fork point into a new conversation; `forkedFromId` / `forkedAtPosition` reference the origin)
- `softDeleteConversation`
- `invalidateConversationCache`
- Cache-bypass state (`cache-bypass.slice.ts`) — flips the conversation's cache-bypass flag before the next outbound AI request when a mutation has just landed

The fork model is important: **forking doesn't create a shared-data branch.** The server duplicates everything up to the fork point into a brand-new, fully independent conversation, then stamps a reference so we remember where it came from. Each message in the fork is a standalone row; nothing is shared. `parentConversationId` is a *different* relationship — it's for nested / sub-conversations, not forks.

---

## 9. Redux slice inventory (what's where)

| Store key | Module | Purpose |
|---|---|---|
| `agentDefinition` | [`features/agents/redux/agent-definition/`](features/agents/redux/agent-definition/) | Loaded agent definitions for builder/execution |
| `agentConversations` | [`features/agents/redux/agent-conversations/`](features/agents/redux/agent-conversations/) | Agent-scoped conversation list caches (RPC) |
| `agentShortcut` | [`features/agents/redux/agent-shortcuts/`](features/agents/redux/agent-shortcuts/) | Shortcut definitions + variable bindings |
| `agentConsumers` | [`features/agents/redux/agent-consumers/`](features/agents/redux/agent-consumers/) | Which agents appear in which surfaces |
| `agentApps` | [`features/agents/redux/agent-apps/`](features/agents/redux/agent-apps/) | App scaffolds (DB table not yet wired) |
| `tools` | [`features/agents/redux/tools/`](features/agents/redux/tools/) | Tool catalog |
| `mcp` | [`features/agents/redux/mcp/`](features/agents/redux/mcp/) | MCP server state |
| `executionInstances` | `execution-system/execution-instances/` | Instance lifecycle (create/destroy) |
| `instanceVariableValues` | `execution-system/instance-variable-values/` | User-filled variables per instance |
| `instanceModelOverrides` | `execution-system/instance-model-overrides/` | LLM param overrides per instance |
| `instanceResources` | `execution-system/instance-resources/` | Attachments per instance |
| `instanceContext` | `execution-system/instance-context/` | Extra context payloads |
| `instanceClientTools` | `execution-system/instance-client-tools/` | Enabled client tools per instance |
| `instanceUIState` | `execution-system/instance-ui-state/` | UI flags, titles, `callbackGroupId`, panel state |
| `activeRequests` | `execution-system/active-requests/` | In-flight requests, streaming state, tool lifecycle |
| `instanceConversationHistory` | `execution-system/messages/` | Turns/messages per instance |
| `conversationFocus` | `execution-system/conversation-focus/` | Which conversation is focused per surface |

Legacy slices under `features/agents/redux/old/` are still mounted for migration but are no longer the source of truth.

> **Heads up:** several of the `instance-*` folder/key names above are scheduled to collapse in [audit 04 Wave 5](audits/04-legacy-obliteration-plan.md) (`instance-ui-state/` → `display/`, `instance-variable-values/` → `variables/`, etc.). Wave 5 lands after Chat (workstream 1 in the ROADMAP) ships.

---

## The full picture

```
        BUILD                  TEST                     CONSUME
   ┌─────────────┐      ┌──────────────┐      ┌───────────────────────┐
   │   Builder   │  →   │    Runner    │  →   │ Chat | Shortcut | App │
   │  POST       │      │  POST        │      │   POST /ai/agents     │
   │  /prompts   │      │  /ai/agents  │      │   POST /ai/conv'ns    │
   │  (manual)   │      │  /ai/conv'ns │      │   (or /ai/chat if     │
   │             │      │  (agent)     │      │    isEphemeral)       │
   └─────────────┘      └──────────────┘      └───────────────────────┘
         │                     │                         │
    every save            read-only,              pin a specific
    creates a           version-pinnable,       version — frozen
    new version         full observability     until engineer updates
         │                     │                         │
         └─────────── all go through ──────────────────────┘
                     launchConversation thunk
                     (single entry point)
```

- **Builder** defines the agent. Raw `prompts` endpoint, full control, secrets live here, every save = new version.
- **Runner ≡ Chat runtime.** Variables + context in, conversation out. Engineer's secrets stay server-side.
- **Chat, Shortcut, App** are three surfaces onto the same runtime, differing only in how variables get filled:
  - **Chat** — user types.
  - **Shortcut** — UI context auto-fills; invocation is highly configurable (13 display modes, 6 input styles, auto-fire or show-inputs-first, multi-turn or single-turn, etc.).
  - **App** — bespoke UI captures input, often with no chat at all; agent output renders as an interactive artifact.

**Every surface constructs a `ConversationInvocation`** and hands it to `launchConversation`. See [`conversation-invocation-reference.md`](conversation-invocation-reference.md) for the field-by-field contract.

---

## Operational references

- **What's left to build:** [`ROADMAP-agent-ecosystem-rebuild.md`](ROADMAP-agent-ecosystem-rebuild.md) — Chat, Shortcuts, Apps, Widget Handle, and legacy retirement, in priority order.
- **Tactical audits** (ground truth for specific narrow topics — [`audits/`](audits/)):
  - [`01-new-work-audit.md`](audits/01-new-work-audit.md) — what's fixed + the three deliberately-deferred exceptions (ephemeral short-circuit, cache-bypass race, tool-reservation gap).
  - [`02-chat-rewrite-gap-map.md`](audits/02-chat-rewrite-gap-map.md) — keep/rewrite/delete inventory for the four chat folders + Runner-critical imports.
  - [`03-type-duplication-scan.md`](audits/03-type-duplication-scan.md) — prioritized list of local types shadowing globals.
  - [`04-legacy-obliteration-plan.md`](audits/04-legacy-obliteration-plan.md) — seven-wave deletion plan with verification commands.
