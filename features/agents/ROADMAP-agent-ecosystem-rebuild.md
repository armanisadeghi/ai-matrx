# Agent Ecosystem — Rebuild Roadmap

> **Purpose.** The agent harness refactor is landed. Several consumer-facing systems either (a) need to be rebuilt on top of the new foundation, or (b) are still wired through the legacy prompts path and must be migrated.
>
> This doc enumerates that work in priority order, with file paths, type references, and dependencies. It is not a commitment on schedule — it's the complete map of what's left.
>
> **Companion docs:**
> - Architecture overview: [`agent-system-mental-model.md`](agent-system-mental-model.md)
> - Invocation contract: [`conversation-invocation-reference.md`](conversation-invocation-reference.md)
> - Active TODO for Phase 0 item below: [`TODO-widget-tools-plan.md`](TODO-widget-tools-plan.md)
>
> **Audits persisted at [`features/agents/audits/`](audits/) — these are the operational tactical checklists that complement this strategic roadmap:**
>
> | Report | What it covers |
> |---|---|
> | [`01-new-work-audit.md`](audits/01-new-work-audit.md) | Correctness bugs + integration gaps in Phase 5–9 work. Critical items fixed in-session; noted exceptions documented. |
> | [`02-chat-rewrite-gap-map.md`](audits/02-chat-rewrite-gap-map.md) | Keep / rewrite / delete inventory for `cx-chat`, `cx-conversation`, `conversation`, `chat` folders. Identifies the 4 Runner-critical imports that MUST survive deletion. Recommended rebuild order in 5 weeks. |
> | [`03-type-duplication-scan.md`](audits/03-type-duplication-scan.md) | Prioritized list of local types shadowing globals. 2 HIGH (`ConversationMessage` shape split + `MessageRole` too-narrow), 1 MED (`ApiMode` single-source), 1 LOW (`CxArtifactRow`). |
> | [`04-legacy-obliteration-plan.md`](audits/04-legacy-obliteration-plan.md) | Wave-by-wave deletion plan. Waves 1 + 2 can land NOW (zero risk). Waves 3–7 scheduled after chat rewrite. |

---

## Priority order at a glance

| # | Workstream | Depends on | Status |
|---|---|---|---|
| **Now** | **Legacy Waves 1 + 2** (zero-risk alias + orphan deletions) | Nothing — both verified zero-consumer | 🚧 pending execution; see [audit 04](audits/04-legacy-obliteration-plan.md) |
| 0 | **Widget Handle + Client Tools** | Nothing — landing pad for all shortcut UI mutation | 🚧 design locked, 0/9 phases done |
| 1 | **Agent Chat** — `app/(a)/chat/` | Current invocation contract only | 🚧 not started; salvage plan in [audit 02](audits/02-chat-rewrite-gap-map.md) |
| 2 | **Agent Shortcuts — UnifiedContextMenu integration** | Widget handle (0) | 🛠️ redux done, bridge missing |
| 3 | **Agent Shortcuts — Admin + User management UIs** | Redux slice (done) | 🚧 not started |
| 4 | **Built-in Shortcuts catalog (100+)** | Admin UI (3), UnifiedContextMenu (2) | 🚧 not started |
| 5 | **Agent Apps — DB + server + UI** | Shortcuts (2–4) for embedding | 🛠️ provisional types + redux scaffold; no DB table |
| 6 | **Legacy Waves 3–7** (rename + shim delete + folder flatten) | Waves 4–7 gate on Chat (1) | 🚧 pending; see [audit 04](audits/04-legacy-obliteration-plan.md) |
| — | **Type duplication cleanup** (cross-cutting) | Parallelizable | 🚧 see [audit 03](audits/03-type-duplication-scan.md) |

---

## 0. Widget Handle + Client Tools System ✅ LANDED

**Source of truth:** [`docs/WIDGET_HANDLE_SYSTEM.md`](docs/WIDGET_HANDLE_SYSTEM.md) — end-to-end contract, usage, and smoke tests.
**State snapshot + remaining work:** [`docs/WIDGET_HANDLE_AND_CLIENT_TOOLS-STATE.md`](docs/WIDGET_HANDLE_AND_CLIENT_TOOLS-STATE.md).
**Historical planning:** [`TODO-widget-tools-plan.md`](TODO-widget-tools-plan.md) (kept for history; no longer current).

**What shipped.** The invocation `callbacks` group collapsed from five fields to two:

```ts
// Before
callbacks: { onCompleteId?; onTextReplaceId?; onTextInsertBeforeId?; onTextInsertAfterId?; originalText? }

// After
callbacks: { widgetHandleId?; originalText? }
```

`useWidgetHandle(handle)` registers one object (capability methods + lifecycle) with CallbackManager; the launch-path reads it live per-turn to derive `client_tools`; `process-stream.ts` routes `widget_*` tool_delegated events to the matching method and posts results through a microtask batcher to `/ai/conversations/{id}/tool_results`.

**Seeded in `public.tools` (tag `widget-capable`):**

`widget_text_replace` · `widget_text_insert_before` · `widget_text_insert_after` · `widget_text_prepend` · `widget_text_append` · `widget_text_patch` · `widget_update_field` · `widget_update_record` · `widget_attach_media` · `widget_create_artifact`

**Unblocks:** ROADMAP §2 (UnifiedContextMenu → agent shortcut integration), §4 (shortcuts catalog), §5 (Agent Apps artifact rendering reuses the handle contract).

---

## 1. Agent Chat — `app/(a)/chat/` 🚧

**Today.** The legacy chat lives at [`features/cx-conversation/`](features/cx-conversation/) + [`features/cx-chat/`](features/cx-chat/). A deprecated stub is at [`app/(authenticated)/deprecated/chat/`](app/(authenticated)/deprecated/chat/). The new agent-first route has not been built.

**What "Chat" actually is now.** In the post-refactor world, Chat is *Runner without the observability* — the same runtime, the same `launchConversation` thunk, the same `messages/` slice. The only differences from Runner:

- Picks an agent from a sidebar instead of being scoped to `[id]`.
- Runs against `isVersion: false` (current pointer, not a pinned version).
- Multi-agent sessions: user can switch which agent they're chatting with mid-session (spawns a new conversation, `parentConversationId` optional).
- No debug panels; no raw tool-result visibility by default (`display.hideToolResults: true`, `display.hideReasoning: true` as defaults).

### Scope of the build

#### 1.1 Route structure

- `app/(authenticated)/chat/page.tsx` — landing (list conversations, pick agent, start new).
- `app/(authenticated)/chat/[conversationId]/page.tsx` — active conversation.
- `app/(authenticated)/chat/new/page.tsx` — agent picker + opening message; on submit, dispatch `launchConversation` and redirect to `[conversationId]`.

#### 1.2 Components to build or adapt

- **ChatLayout** — sidebar (conversation list, agent picker) + main pane (message transcript + input).
- **ConversationList** — backed by `agentConversations` slice's RPC cache. Click → route to `[conversationId]`.
- **AgentPicker** — searchable list of agents the user has access to. Filters by category, recent use.
- **MessageTranscript** — reuse the existing message rendering from `features/cx-conversation/MessageList.tsx` if the API matches; otherwise build new on top of `execution-system/messages/` selectors (`selectDisplayMessages`).
- **ChatInput** — text box + attach + model override panel (if agent permits).
- **ConversationOptionsMenu** — fork, edit title, soft-delete, export. Uses message-crud thunks already in place.

#### 1.3 Invocation template

```ts
const invocation: ConversationInvocation = {
  identity: { conversationId, surfaceKey: "chat" },
  engine: { kind: "agent", agentId, isVersion: false },
  routing: { apiEndpointMode: "agent" },
  origin: { origin: "manual", sourceFeature: "chat-interface" },
  inputs: { userInput, variables: {}, overrides },
  scope: { applicationScope: currentScope },
  display: { displayMode: "chat-assistant", showSubAgents: true, hideReasoning: true, hideToolResults: true },
  behavior: { allowChat: true, autoRun: false },
};
```

#### 1.4 Runner-critical files that MUST survive deletion (from [audit 02](audits/02-chat-rewrite-gap-map.md))

The Agent Runner's `AgentAssistantMessage` transitively imports these four from the chat folders. **Copy them into `app/(a)/chat/components/` (or a shared folder) BEFORE deleting the cx-conversation / conversation folders.**

| Import | Source | Notes |
|---|---|---|
| `AssistantActionBar` | `features/cx-conversation/AssistantActionBar.tsx` | Calls `messageActionsActions.registerInstance` — already wired to new slice |
| `MessageOptionsMenu` | `features/cx-conversation/MessageOptionsMenu.tsx` | Lazy-loaded; calls new message-actions slice |
| `ToolCallVisualization` | `features/cx-conversation/ToolCallVisualization.tsx` | Pure presentational — no Redux |
| `useDomCapturePrint` | `features/conversation/hooks/useDomCapturePrint.ts` | Pure utility; html2canvas + jsPDF |

#### 1.5 What the rebuild consumes from `@matrx/agents` (from [audit 02](audits/02-chat-rewrite-gap-map.md))

**Thunks:**
- `launchConversation(invocation)` — first turn
- `loadConversation({ conversationId, surfaceKey })` — history
- `editMessage`, `forkConversation`, `softDeleteConversation`, `invalidateConversationCache`

**Selectors:**
- `selectDisplayMessages(cid)` — ordered turns projected from `byId`
- `selectMessageContent` / `selectMessageStatus` / etc. — narrow re-render-safe selectors
- `selectConversation(cid)` — entity read
- `selectGlobalConversationList` — sidebar

**Actions:**
- `messageActionsActions.registerInstance` — for per-message context menu
- `reserveMessage`, `updateMessageRecord`, `hydrateMessages` — stream commit path (usually dispatched by thunks, not components)

#### 1.6 Recommended rebuild order (5 weeks, from [audit 02](audits/02-chat-rewrite-gap-map.md))

1. **Week 1 — Protect.** Copy the 4 Runner-critical files into the new chat location (or shared folder). Verify Runner still builds.
2. **Week 1–2 — Rewrite `useConversationSession`** on `@matrx/agents` thunks + selectors.
3. **Week 3 — MessageList / AssistantMessage / UserMessage** on narrow selectors + DB-faithful `byId`.
4. **Week 4 — Route-level at `app/(a)/chat/**`**. Replace `app/(dev)/demos/chat/**` routes.
5. **Week 5 — Delete cx-chat / cx-conversation / conversation / chat legacy.** Unblocks legacy-shims deletion (Wave 4 in audit 04).

#### 1.7 Dependencies + open questions

- **Agent picker data source.** Is `agentConsumers` slice the right source, or do we need a new "chat-eligible agents" query? Decide before building.
- **Message-reply UX when an agent invokes sub-agents.** `showSubAgents` flag gates visibility, but we still need a visual treatment for sub-agent turns (collapsed-by-default card, probably).
- **Conversation list pagination.** RPC currently returns a flat list — for heavy users this needs windowing.
- **Share / visibility controls.** Out of scope for the doc but in scope for the build. Uses existing AI Matrx sharing infrastructure.
- **Artifact display surface.** When an agent produces an artifact (HTML preview, flashcard set, etc.), chat needs a side panel or modal. Reuse `HtmlPreviewBridge` pattern (already in the "keep" list from audit 02).

#### 1.8 Additional tasks

- [ ] Design sidebar/main layout (desktop-first, mobile drawer per CLAUDE.md).
- [ ] Build `ChatLayout`, `ConversationList`, `AgentPicker`, `ChatInput`.
- [ ] Artifact rendering surface (panel alongside transcript).
- [ ] Agent switcher mid-session.
- [ ] Mobile drawer layout per `ios-mobile-first` skill.
- [ ] Accessibility audit (message live region, input labels, keyboard nav).
- [ ] Port `messageActionRegistry` entries that still apply (edit, fork, copy, export, TTS, save-to-notes, HTML preview) — legacy no-op shims at lines 41–64 are retired in this step.

---

## 2. Agent Shortcuts — UnifiedContextMenu integration 🛠️

**Today.** [`features/context-menu/UnifiedContextMenu.tsx`](features/context-menu/UnifiedContextMenu.tsx) is fully functional against the **legacy prompts/builtins** system. It loads shortcuts from DB, binds text selection → prompt variables, and executes via `usePromptRunner()`.

**What's missing.** The bridge from `AgentShortcut` (new) to the context menu. The redux slice at [`features/agents/redux/agent-shortcuts/`](features/agents/redux/agent-shortcuts/) already holds the definitions, scope mappings, and result-display config; nothing consumes it yet.

### Scope of the migration

#### 2.1 Parallel surfaces

Current menu supports these surfaces — every one needs to work after migration:
- **Text editors / textareas** (native HTML controlled inputs, Remirror, Notes)
- **Code editor** (Monaco) — `features/code-editor/`
- **Terminal / shell output** — `features/shell/`
- **Message options menu** (right-click on a chat message)

The user's spec adds:
- **Markdown viewers** — render-side context menu on headings, paragraphs, code blocks, lists.
- **Custom widgets** — any component with `enableShortcuts={true}` flips on the menu, binds to the component's structured content.

#### 2.2 Binding contract — the `UIContext` object

Each surface exposes a normalized `UIContext`:

```ts
interface UIContext {
  // Universal
  selection?: string;
  textBefore?: string;
  textAfter?: string;
  content?: string;         // primary payload (document body, selected message, widget content)
  context?: Record<string, unknown>;   // broader situational context
  appFeature?: string;
  featureAgentOverview?: string;
  user_overview?: string;

  // Surface-specific extensions layer on top (e.g. vsc_*, terminal_*, card_title)
  [key: string]: unknown;
}
```

A Shortcut's `scopeMappings` (stored on the `AgentShortcut` row) maps `UIContext` keys → agent variable names. Missing keys don't block — they simply don't fill the variable, and the invocation's variable-input UI (or defaults) takes over.

#### 2.3 Work items

- [ ] **Bridge hook:** `useAgentShortcutInvoker({ surfaceKey, uiContext })` — given the current surface's context, returns a list of eligible `AgentShortcut` records (filtered by `enabledContexts`) and an `invoke(shortcut)` function that constructs the `ConversationInvocation` and dispatches `launchConversation`.
- [ ] **Refactor `UnifiedContextMenu`** to consume agent shortcuts alongside (or replacing) legacy prompt builtins. Show System / Organization / Personal categories side-by-side.
- [ ] **Markdown viewer wiring** — decorate the existing markdown renderers in `components/mardown-display/` with `UIContext` extraction (block type, block content, surrounding blocks).
- [ ] **Code editor wiring** — map Monaco selection + file metadata to `vsc_*` keys (already partially done for legacy — port to new).
- [ ] **Custom widget opt-in** — document and implement the `enableShortcuts` pattern on Card, Callout, and any other structured-content components.
- [ ] **Text-replace/insert callbacks** — these are the exact surfaces that need `WidgetHandle` (depends on Phase 0).
- [ ] **Keyboard shortcuts** — `AgentShortcut.keyboardShortcut` field exists but has no global listener yet.
- [ ] **Retirement plan** for `features/context-menu/` legacy codepaths once migration is complete.

---

## 3. Agent Shortcuts — Admin + User management UIs 🚧

**Parallel to:** `/app/(authenticated)/(admin-auth)/administration/prompt-builtins/` (old system).

### 3.1 Admin (system + organization scope)

- **Route:** `app/(authenticated)/(admin-auth)/administration/system-agents/` _(renamed 2026-04-22 — was `agent-shortcuts`)_
  - `page.tsx` — list of all shortcuts (filter by scope, category, agent, active status).
  - `[id]/page.tsx` — edit a shortcut (label, category, icon, keyboard binding, agent + version pin, scope mappings, result display config, all the `display`/`behavior` flags).
  - `new/page.tsx` — create form.
  - `categories/page.tsx` — manage categories (rename, reorder, icon).

### 3.2 User (personal scope)

- **Route:** `app/(authenticated)/shortcuts/` — personal shortcuts.
  - `page.tsx` — list the user's own shortcuts.
  - `[id]/page.tsx` — edit.
  - `new/page.tsx` — create. Options: "start from a system shortcut" (fork), "build from agent" (pick an agent, configure bindings), or "AI-build" (describe it, agent constructs the config).

### 3.3 Shared components

- **ShortcutEditor** — one component with visibility scoped per-role.
- **ShortcutBindingEditor** — visual mapper: `UIContext` keys (LHS) → agent variables (RHS). Uses the agent's declared variable list.
- **DisplayConfigEditor** — picks `displayMode`, `variableInputStyle`, and all the flags.
- **ShortcutPreview** — live render of the shortcut firing against a sample surface.

### 3.4 Work items

- [ ] Admin routes + pages.
- [ ] Personal-scope routes + pages.
- [ ] Shared editor components.
- [ ] Category management.
- [ ] Bulk actions (enable/disable, duplicate, export).
- [ ] Import/export (JSON) for sharing shortcut configs across orgs.
- [ ] Drift detection UI (surface when an agent's variable schema changed after the shortcut was pinned).
- [ ] Audit log view (who created/edited what, when).

---

## 4. Built-in Shortcuts catalog (100+) 🚧

**Parallel to:** the system-level prompt-builtins catalog that ships today.

**Scope.** Ship a curated catalog of 100+ system-level shortcuts across categories. Each backed by a version-pinned agent, with scope mappings and result-display config already tuned.

### 4.1 Category plan (starting set)

1. **Writing** — rewrite, expand, summarize, shorten, change tone (5 tones), fix grammar, translate (top 10 languages), fact-check, cite sources.
2. **Coding** — explain, document, write tests, refactor, find bug, optimize, add types, convert language, review PR diff.
3. **Markdown / Notes** — outline, extract action items, convert to table, convert to flashcards, generate quiz, ELI5.
4. **Research** — web search, find related, define, compare, summarize sources, draft literature review.
5. **Productivity** — draft email (with tone picker), reply, schedule, extract tasks, generate meeting notes, agenda-to-action.
6. **Data** — schema from example, SQL from description, regex from description, explain regex, format JSON/YAML.
7. **Media** — describe image, alt text, transcribe audio, extract table from image.
8. **Conversation actions** — respond in voice, continue thought, challenge argument, fact-check claim, TL;DR.
9. **Organization-specific templates** — placeholders for org admins to clone and customize.

### 4.2 Per-shortcut deliverables

For each of the 100+:
- Agent definition (name, system prompt, model tier, tools, variables, defaults).
- Agent version pinned at creation; `useLatest: false`.
- Shortcut row: label, category, icon (Lucide), keyboard binding (where reasonable), scope mappings, display config, behavior flags.
- Test fixture documenting expected inputs / outputs.

### 4.3 Work items

- [ ] Finalize category taxonomy + icon picks.
- [ ] Spec each shortcut (one YAML/JSON per shortcut, reviewed before build).
- [ ] Build agents (many can share the same agent with different `variables` defaults).
- [ ] Seed shortcuts via SQL migration.
- [ ] Test fixtures + smoke tests.
- [ ] Documentation page (`app/(authenticated)/shortcuts/catalog/`).

---

## 5. Agent Apps System 🛠️

**Today.** Redux scaffold + provisional `AgentApp` type at [`features/agents/redux/agent-apps/`](features/agents/redux/agent-apps/). No backing DB table. Thunks currently stub and throw.

**Parallel / replaces:**
- [`app/(authenticated)/prompt-apps/`](app/(authenticated)/prompt-apps/) — prompt-backed public apps (`/p/[slug]`).
- [`app/(authenticated)/apps/custom/[slug]/`](app/(authenticated)/apps/custom/[slug]/) — custom applet containers.

**The goal.** Bring the best of both prior systems into one:
- From `prompt_apps`: dynamic JSX rendering, public sharing with `/p/[slug]` surface, rate limiting, execution telemetry, embeddable anywhere.
- From `apps/custom`: structured applet hierarchy (app → applets), layout templates, app builder.

### 5.1 DB + server

- **Table:** `agx_app` (or `cx_app`, decide with backend).
  - Columns match current `AgentApp` type (including `origin`, `sourceCode`, `primaryAgentId`, `primaryAgentVersionId`, `embeddedShortcutIds`, scoping columns).
  - Plus: `slug` (for public URL), `status` (`draft`/`published`), `publicSettings` (rate limits, fingerprint rules), `telemetryConfig`.
- **Sibling tables:** `agx_app_executions`, `agx_app_errors`, `agx_app_rate_limits` (port the `prompt_app_*` schema).
- **RLS:** owner CRUD, public SELECT on published, admin full access.
- **API routes:**
  - `POST /api/apps/[slug]/execute` — public execution endpoint.
  - `GET /api/apps/[slug]` — public metadata.
  - CRUD through the MCP/REST agent-feedback channel pattern.

### 5.2 Creator UX — three paths

Matching `AgentApp.origin`:

1. **Template.** Library of scaffolded apps (form-to-output, chatbot-with-sidebar, flashcard-gen style, etc.). Clone → customize → publish.
2. **AI-generated.** Creator describes the app. The in-app **App Builder Agent** (itself an agent) generates the `sourceCode` and `scopeMappings`, picks a primary agent, suggests embedded shortcuts. Creator reviews and publishes.
3. **Custom.** Creator writes `sourceCode` directly (JSX/TSX, Babel-transformed, scoped imports — reuse the security model from `prompt_apps`: import allowlist, variable validation).

### 5.3 Routes

- `app/(authenticated)/agent-apps/` — creator's app list.
- `app/(authenticated)/agent-apps/[id]/edit/page.tsx` — edit.
- `app/(authenticated)/agent-apps/new/page.tsx` — create (pick a path).
- `app/(authenticated)/agent-apps/templates/page.tsx` — template gallery.
- `app/(public)/a/[slug]/page.tsx` — public surface (parallel to `/p/[slug]`).

### 5.4 Artifact rendering

Agent Apps lean heavily on bidirectionally-interactive artifacts (see the mental model doc §6). The App framework needs:
- An `<AgentArtifactRenderer>` component that consumes model output and renders a structured artifact.
- A registration system for artifact types (flashcard, quiz, task list, form, chart, etc.) — each with (a) model output schema, (b) React renderer, (c) user-interaction → model-feedback handler.
- Bidirectional sync: user interaction updates local state, next agent turn receives the updated artifact state.

### 5.5 Work items

- [ ] Finalize `agx_app` / `cx_app` schema with backend; migrate `AgentApp` type from provisional.
- [ ] Create table + RLS + telemetry siblings.
- [ ] Wire thunks (replace stubs in `features/agents/redux/agent-apps/thunks.ts`).
- [ ] Creator routes + pages.
- [ ] Public rendering route `/a/[slug]`.
- [ ] Template gallery + seed initial templates (5–10).
- [ ] App Builder Agent (generates apps from prose).
- [ ] `<AgentArtifactRenderer>` + artifact type registry.
- [ ] Rate limiting + anonymous fingerprinting (port from `prompt_apps`).
- [ ] Execution telemetry dashboard.
- [ ] Shortcut embedding flow inside apps.
- [ ] Migration path for existing `prompt_apps` → `agent_apps` (opt-in, per-app).

---

## 6. Legacy retirement 🚧

**Full operational plan lives in [audit 04](audits/04-legacy-obliteration-plan.md).** Seven waves, scheduled around Chat (workstream 1):

| Wave | What | When | Risk |
|---|---|---|---|
| **1** | Zero-risk alias deletions (re-exports with already-zero consumers) | NOW | None — pre-verified |
| **2** | Orphaned files (`lib/redux/liteRootReducer.ts`) | NOW | None |
| **3** | `ExecutionInstance` → `ConversationRecord` coordinated rename | After Waves 1+2 | Low — single rename |
| **4** | Delete `features/agents/redux/legacy-shims/` | **Blocked on Chat (1)** | Unblocks after 53 chat-folder imports migrate |
| **5** | Folder renames (`instance-ui-state/` → `display/`, etc. ~7 renames) | After Wave 4 | ~100 imports cascade |
| **6** | Flatten `execution-system/` wrapper folder | After Wave 5 | ~100+ imports cascade; optional/cosmetic |
| **7** | Thunk rename (`executeChatInstance` → `executeManualInstance`) | After Wave 4 | Coordinated rename |

### Additional consumer-surface retirements (gated on each system landing)

| Path | Retires when | Notes |
|---|---|---|
| `features/cx-chat/` | Chat (1) Week 5 | Full replacement per [audit 02](audits/02-chat-rewrite-gap-map.md). |
| `features/cx-conversation/` (most of it) | Chat (1) Week 5 | Keep the 4 Runner-critical files (§1.4). |
| `features/conversation/` | Chat (1) Week 5 | Keep utils (`useDomCapturePrint`, `markdown-print`, `resource-parsing`); delete barrels. |
| `features/chat/` (most of it) | Chat (1) Week 5 | Keep print utils + tool-updates overlay + tool-renderers; delete legacy stream. |
| `app/(authenticated)/deprecated/chat/` | Chat (1) ships | Remove stub. |
| Legacy no-op shims in `messageActionRegistry.ts` lines 41–64 | Chat (1) ships | Full path to new thunks. |
| `lib/redux/thunks/openPromptExecutionThunk.ts` | UnifiedContextMenu migration (2) ships | Confirmed deprecated per TODO doc; delete after grep shows no consumers. |
| `features/prompts/**` (gradually) | Shortcuts + Apps (3–5) ship | Per-subsystem retirement — some utilities may stay. |
| `features/prompt-apps/` | Agent Apps (5) ships + migration proven | Keep public URL redirects from `/p/[slug]` → `/a/[slug]` for a deprecation window. |
| `features/prompt-builtins/` | Shortcuts catalog (4) ships | Full replacement. |
| `app/(authenticated)/(admin-auth)/administration/prompt-builtins/` | Shortcuts admin (3) ships | Full replacement. |
| Redux `agents/redux/old/` slices | Phase 3 migration (in progress per `PHASE-3-MIGRATION.md`) | Tracked separately. |

Each retirement gets its own PR, not bundled with the new-system build. Deletion gates on a grep showing zero consumers (verification commands documented per-wave in audit 04).

---

## 7. Type duplication cleanup (cross-cutting) 🚧

**Full list in [audit 03](audits/03-type-duplication-scan.md).** Parallelizable with any workstream.

| Severity | What | When |
|---|---|---|
| **HIGH** | `ConversationMessage` shape split between `features/agents/types/agent-message-types.ts:316` (API wire) and `features/cx-chat/types/conversation.ts:39` (UI state) — chat slice should wrap/extend the API shape, not redefine. | Do during Chat (1) Week 2–3 |
| **HIGH** | `MessageRole` in `cx-chat/types/conversation.ts:26` is 3-valued; canonical `Role` in `agent-message-types.ts:99` has 6 values (incl. `"tool"`, `"developer"`, `"output"`). DB rows are losing information. | Do during Chat (1) Week 2–3 |
| **MED** | `ApiMode` duplicated between `cx-chat` and `legacy-shims`. (Distinct from `ApiEndpointMode` on `ConversationInvocation.routing` — that's a different 2-valued enum.) | Promote to `@matrx/agents/types` during Chat rewrite |
| **LOW** | `CxArtifactRow` in `features/artifacts/types.ts:67` — verify DB auto-gen produces `Database["public"]["Tables"]["cx_artifact"]["Row"]` and replace. | Any time |
| —  | `features/agents/redux/legacy-shims/*` entire folder — acceptable today as it unblocks chat compilation; flag any NEW imports as tech debt. Deletion = Wave 4. | Alongside Chat (1) Week 5 |

---

## Cross-cutting concerns (don't forget)

- **Tooling & observability.** Agent usage analytics (which shortcuts fire most, failure rates, cost per invocation). Dashboard parallel to existing `admin/official-components` pages.
- **Access control.** Shortcut and App visibility per-org / per-project / per-task must respect existing AI Matrx sharing rules. No bespoke auth.
- **Drift detection.** When an agent's variable schema changes, every Shortcut and App pinned to an older version needs a surfaced warning and a one-click "upgrade to latest" flow.
- **Testing infrastructure.** `origin: "test"` + multi-scenario fixtures. Consider a per-shortcut test runner in the admin UI (fire the shortcut against a set of inputs, diff against golden outputs).
- **Mobile behavior.** Chat must work on mobile (drawer layout); Shortcuts menu should switch to bottom sheet per CLAUDE.md mobile rules; Apps should degrade gracefully or opt-in per-app.
- **`isEphemeral` audit.** Several legacy invocations don't persist — confirm each surface's persistence choice deliberately.
- **Docs.** Every new subsystem needs a README *after* it's tested (per CLAUDE.md — no README before tested code).

---

## What this doc does not cover

- **Workflows.** Referenced in the mental model as a Shortcut target alternative to a single-agent call. Fully out of scope here.
- **Agent sharing / visibility controls.** Handled by existing AI Matrx sharing infra.
- **Sub-agent orchestration details.** Mentioned at the invocation level (`parentConversationId`, `showSubAgents`); internals (spawning, tool-call routing) are covered elsewhere.
- **MCP server integration.** Separate system, separate doc.
- **Cost / rate limiting at the platform level.** Covered by existing infrastructure; apps just plug in.

---

## One-pass summary

The harness is done. What's left is the consumer-facing half of the system — **Chat, Shortcuts, Apps** — plus the **Widget Handle** plumbing that unifies how shortcuts mutate the UI. Phase 0 (Widget Handle) unblocks Phase 2 (context-menu migration); Phases 1 (Chat), 3 (Shortcut admin), and 4 (catalog) can proceed in parallel once Phase 0 is on the runway. Phase 5 (Apps) depends on 2–4 for shortcut embedding but its DB and creator UI can land in parallel.

When all six land, the legacy prompts/builtins/prompt-apps/custom-apps surfaces retire in sequence, and the codebase runs on a single agent-centric foundation.
