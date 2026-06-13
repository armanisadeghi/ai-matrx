# FEATURE.md — `chat route` (the live `/chat` surface)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-05-23`

> **This is the authoritative doc for the LIVE chat route.** The chat route lives at `app/(a)/chat/**` and is built on the `features/agents/` execution-system — **not** on the unbuilt `ConversationShell` in `features/conversation/`. If you were sent here by `features/conversation/FEATURE.md` or `phase-07-chat-route.md`, this file supersedes their description of how the route behaves.

---

## Purpose

The user-facing chat surface: pick an agent, start a conversation, stream a reply, browse history. Chat is an agent **runner** where the "agent" is chosen from the user's own / system / community agents. It is the consume end of Build → Test → Consume.

---

## The model — read this before touching anything (load-bearing)

This is the single most-violated invariant in this surface. Two concepts, kept strictly separate:

- **Agent** = the thing that *starts* a conversation. It is a template/launcher. Its only job is the first turn.
- **Conversation** = an independent entity with its own `id`. Once it exists, it stands alone. `cx_conversation.initial_agent_id` records *which agent started it* — that is **read-only provenance**, not a live link back to the agent.

From this, four non-negotiable rules — **never revive a conversation the user didn't explicitly open**:

1. **`/chat/a/[agentId]` ALWAYS starts a brand-new conversation. It NEVER revives.** Selecting an agent (picker, pinned list, `+`, chip) is "start fresh with this agent," full stop.
2. **Switching agents NEVER reopens a past conversation.** Returning to an agent you used earlier in the session must not resurrect that agent's old transcript. (Analogy the user gave: opening your phone shouldn't auto-dial the last person you spoke to.)
3. **`+` (new chat) uses the ACTIVE agent**, falling back to the default (`/chat/new`) only when there is no active agent. **Never** route by "last-used agent."
4. **Bare `/chat` always lands on `/chat/new`. Never resume-last.**

Users reach prior conversations exactly one way: by clicking them in the **history sidebar** (`/chat/[conversationId]`).

---

## Entry points

**Routes** (`app/(a)/chat/`)
- `page.tsx` — bare `/chat`; `redirect("/chat/new")`. Always fresh.
- `new/page.tsx` — `/chat/new`; SSR-resolves the default agent name, mounts `ChatNewClient` (greeting + quick-action chips over the default agent's input).
- `a/[agentId]/page.tsx` — `/chat/a/[agentId]`; SSR-resolves the agent name, mounts `ChatRoomClient` with **no** `conversationId` → launcher mints a fresh conversation.
- `[conversationId]/page.tsx` — `/chat/[conversationId]`; SSR-resolves the owning agent from `cx_conversation.initial_agent_id`, mounts `ChatRoomClient` **with** the `conversationId` prop (loads the existing transcript).

**Components** (`features/agents/components/chat/`)
- `ChatRoomClient.tsx` — orchestrates one conversation surface; renders ONLY the `AgentConversationColumn` (like `AgentRunnerPage`). Two mount paths (fresh vs. existing). Owns the fresh-start guard and post-submit URL promotion.
- `ChatRunHeader.tsx` — controls injected into the **app shell header** (`#shell-header-center`) via `<PageHeader>`: a COMPACT agent picker (`AgentListDropdown compact`, never full-width). Owns agent-select navigation. Mirrors `AgentRunHeader`. On desktop the root is `lg:w-full` so the controls sit at the **START** of the header (left edge, right after the sidebar) — forming a fixed `[collapse · agent]` cluster with the sidebar's collapse toggle that never drifts to center. Mobile keeps the shrink-to-fit centered layout (the slot is `justify-center`) so the picker stays between the hamburger and the avatar.
- `ChatIncognitoHeaderButton.tsx` — toggles incognito on fresh chat routes (`/chat/new`, `/chat/a/[agentId]`). Portals a `GhostTapButton` into `#shell-header-right`. When active, black out sidebar + avatar and block sandbox binding.
- `ChatIncognitoProvider.tsx` — chat-layout provider; syncs Redux `chatIncognito` slice + `data-chat-incognito` on `.shell-root`.
- `chat-incognito.slice.ts` — Redux source of truth for incognito toggle (read by sandbox resolver, run controls, execute thunks via instance `isEphemeral`).
- `ChatSidebarMenu.tsx` — chat-route actions + conversation history rendered INSIDE the **app shell sidebar** as a Large-Route menu (registered in `features/shell/constants/route-menu-registry.ts`). Mirrors `AgentRunSidebarMenu`. **Chrome rows (always rendered, IDENTICAL DOM in both states) — `New chat` / `Search chats` / `Search agents` / `Voice agent` — use the EXACT same `.shell-nav-item shell-tactile-subtle` markup as `features/shell/components/sidebar/NavItem.tsx`** (canonical 18px Lucide, `.shell-nav-icon` + `.shell-nav-label`). The shell's existing CSS handles label collapse, icon centering, and the collapsed `[title]:hover::after` tooltip — the icons stay at the same x position in both states and the first row stays at the same y. **Do not invent a parallel styling system here.** Search Chats wraps a chrome row in a Popover whose content is `<ChatHistorySidebar initialSearchOpen>` with its own `chat-route-search` scope (so its in-popover searchTerm doesn't leak into the always-on sidebar list). Search Agents reuses the canonical `AgentListDropdown` via `triggerSlot` + `contentSide="right"`. Voice Agent is a real `<Link>` to `/chat/voice` with `.shell-active-pill` applied on match. **Extras** (Pinned + grouped history) render only when the sidebar is expanded — no room in the narrow rail. (`Webhook` matches the app's "Agents" nav glyph; `Bot` is banned by `matrx/no-banned-lucide-icons`.)
- `ChatNewClient.tsx` — `/chat/new` landing (default agent + greeting).
- `NewChatGreeting.tsx` — greeting + chips; chip click stashes a draft and pushes to `/chat/a/[chipAgentId]`.

**App-shell integration (this is HOW chat gets its sidebar + header — do NOT rebuild a custom one).** The chat route is a "Large Route", exactly like `/agents/[id]/run`:
- Each `page.tsx` renders `<PageHeader><ChatRunHeader …/></PageHeader>` + the content — the header portals into the shell header center slot.
- `route-menu-registry` maps `/^\/chat(?:\/|$)/` → `ChatSidebarMenu`. The shell's `RouteMenuSlot` auto-switches the sidebar to it (defaults to the chat-history "local" menu) and provides the **switch button to the main app menu** — on the desktop sidebar AND in the mobile shell drawer. The shell owns all the chrome (collapse/expand, mobile drawer, switch).

**Hooks**
- `useAgentLauncher(agentId, { surfaceKey, ready, retainOnUnmount })` (`features/agents/hooks/useAgentLauncher.ts`) — managed mode creates + tracks the conversation; returns the focused conversation id for the surface.

**Redux**
- `conversationFocus` slice (`features/agents/redux/execution-system/conversation-focus/`) — `bySurface[surfaceKey].{input,display}`. The surface key is `chat-route:<agentId>`.
- `conversations` / execution-system slices — the live instance.
- `conversationList` / `conversation-history` — sidebar data (history uses `fetchConversationHistory`, a different thunk from the global `conversationList`).

---

## Key flows

### Flow 1 — Start fresh with an agent (`/chat/a/[agentId]`)
1. `ChatRoomClient` mounts with `agentId`, no `conversationId`. `surfaceKey = chat-route:<agentId>`.
2. **Fresh-start guard** (runs on every agent/route change, before the launcher): `dispatch(clearFocus(surfaceKey))` — drops any stale per-agent focus so a previously-used agent can't revive its old conversation. NOT ref-guarded: `ChatRoomClient` is reused (not remounted) across chat navigations, so it must re-run on every agent switch / `+` click.
3. `useAgentLauncher` (now `ready`) creates a fresh instance, sets focus to it.
4. User submits → first `record_reserved` arrives → `messageCount >= 2` → `router.replace('/chat/[conversationId]')`. The launcher's `retainOnUnmount` keeps the live instance alive across this promotion.

### Flow 2 — Open an existing conversation (`/chat/[conversationId]`)
1. SSR resolves `initial_agent_id`; `ChatRoomClient` mounts with both props. Launcher is gated **off** (`ready: false`); fresh-start guard is skipped.
2. If the instance is already live in memory (URL promotion), skip the load to avoid clobbering the stream; otherwise `loadConversation` hydrates from the DB.
3. Picker shows the initiating agent (read-only provenance).

### Flow 3 — `+` new chat
- `ChatRunHeader.handleNewChat`: `activeAgentId ? push('/chat/a/[activeAgentId]') : push('/chat/new')`. Both destinations start fresh (Flow 1). `activeAgentId` is the route's agent, passed in by the page.

### Flow 4 — Failed turn & retry
A failed turn is **kept in history** (never deleted) and recovered with a non-destructive retry. Backend contract: `aidream/.../CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`.

1. A turn fails → it renders as a standalone error bubble (`AssistantError`), NOT folded into any answer's turn group. Detection (`isFailedRecord`, in `messages.selectors.ts`) is unified across **live** failures (`activeRequests[reqId].status==='error'`) and **persisted** ones (`cx_message.status==='failed'` / `metadata.failed`), so a failure looks identical in-session and after reload.
2. The error text resolves `streamError.user_message ?? streamError.message ?? metadata.error ?? content ?? "The response failed."`. Live failures also expose error_type / status_code / technical message behind a **Details** disclosure; reloaded ones show just the friendly line (the message row carries only `metadata.error`).
3. **Retry** (one click, no confirm — it's non-destructive) appears ONLY on the conversation's last, failed turn (`canRetry`, computed in `AgentConversationDisplay`). It dispatches `retryConversationTurn` (`message-crud/retry-turn.thunk.ts`):
   - last user message **persisted** → `executeInstance({ retry: true })` → `POST /ai/conversations/{id}` `{retry:true}` with **no** `user_input`. The failed turn (hidden from the model) stays; the model re-attempts from the user message. Failed attempt + successful retry **share a `position`**, so the transcript orders by `(position, created_at)` (see `messages.slice.ts` `byPositionThenCreatedAt`).
   - last user message **optimistic** (immediate "Failed to fetch", never persisted) → re-send: drop the optimistic bubble, re-seed input, `executeInstance()` (routes turn-1/turn-2+ correctly).
4. **Edit a previous message + resubmit** is a separate, existing path (`UserActionBar` "Edit & resubmit" → fork or `overwriteAndResend`); it re-runs with `user_input`, so it is unaffected by the retry contract.

> **Backend dependency (as of 2026-05-24):** production aidream does NOT yet accept `retry:true` (it 422s `user_input` required) and persists failed turns without `metadata.error` / with `is_visible_to_model=true`. The FE is built to the guide and degrades gracefully; end-to-end retry needs the aidream deploy. See the `project_retry_backend_gap` memory.

### Flow 5 — Client-tool suspend → submit → resume

When the agent calls a client-delegated tool (ask-user, widget action, capability tool), aidream's `_suspend_for_delegation` **hard-suspends the loop and ENDS the stream**. The client must POST the result and then open a fresh stream against `/ai/conversations/{id}/resume` — the original stream is gone. Both the frontend and the matrx-extend extension ship this wiring; the canonical protocol doc is [`features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md`](../../docs/CLIENT_TOOL_SUSPEND_RESUME.md).

1. Server emits `tool_event { event: "tool_delegated", call_id, tool_name, … }`, then `phase: "complete"` + `info: "suspended_awaiting_client"`, then ends the stream.
2. `dispatchUiFirstTool` flips the instance to `paused` and awaits the user (e.g., an `<AskCard>` click). End-of-stream guards in [`process-stream.ts`](../../redux/execution-system/thunks/process-stream.ts) keep `paused` from being overwritten by the natural stream-end `complete` transition.
3. User submits → `submitToolResult` (the **single funnel** at [`features/agents/api/submit-tool-results.ts`](../../api/submit-tool-results.ts)) batches into a `POST /tool_results`.
4. Response is `ToolResultsResponse`. When `continuation_needed && user_request_id`, the funnel dispatches `resumeInstance({conversationId, userRequestId})`.
5. [`resumeInstance`](../../redux/execution-system/thunks/resume-instance.thunk.ts) rebuilds the capability envelope via `buildToolInjection`, then drives the SAME [`runAiStream`](../../redux/execution-system/thunks/run-ai-stream.ts) helper as a normal turn — against `/ai/conversations/{id}/resume`. The resumed loop emits events through the same `processStream` reducer; re-entrancy works for free.

**Invariant — never wait on the original stream after a `tool_delegated`.** It has ended. An ESLint chokepoint (`no-restricted-syntax` on `/tool_results`) prevents any callsite outside `submit-tool-results.ts` from POSTing tool results, so the resume handoff cannot be bypassed.

---

## Invariants & gotchas

- **The surface key is `chat-route:<agentId>` (agent-derived).** Focus per surface persists across route changes and is **not** auto-cleared on unmount (the launcher uses `retainOnUnmount`). Therefore the agent route **must** clear stale focus on mount — that is the fresh-start guard in `ChatRoomClient`. Remove it and Bug "switching back to an agent revives its old chat" returns immediately.
- **`createManualInstance` always mints a new conversation id** — it never dedupes by agent. Revival, when it happened, came from stale *focus*, not instance reuse.
- **`conversationFocus` is runtime-only (not persisted).** Revival bugs are same-session; a hard reload hides them. Test within one session.
- **Never reintroduce "last-used agent" or "resume last conversation" routing.** Those are the killed anti-patterns: per-agent focus stickiness, "stateful `+`", resume-last-on-entry. They *feel* helpful and are exactly what the product forbids.
- **`initial_agent_id` is provenance, not a live link.** Show it; never use it to reopen or re-bind a conversation to an agent.
- **First-turn promotion timing:** promote on `messageCount >= 2`, not on the optimistic local message — promoting earlier races the server's `cx_conversation` insert and 404s back to `/chat/new`.
- **The "`+`/agent-switch snaps back to the old chat" bug lived in the post-submit promotion effect** — NOT in focus or `loadConversation`. `/chat/[id]` and `/chat/a/[agentId]` share the same `surfaceKey`, so on a `+` click the promotion effect could fire with a STALE-CLOSURE `liveConversationId` (the previous conversation, already at `messageCount >= 2`) and `router.replace` back to it, one render before the launcher swapped focus to the fresh conversation. **Guard (do not remove):** the effect only promotes when `liveConversationId` is STILL the surface's focused input conversation, read live from the store (`store.getState().conversationFocus.bySurface[surfaceKey].input`).
- **Chat does NOT own a sidebar or header — the app shell does, exactly like `/agents/[id]/run`.** History is a Large-Route menu (`ChatSidebarMenu`) in `route-menu-registry`; controls (compact picker + `+`) are injected into `#shell-header-center` via `ChatRunHeader` + `<PageHeader>`. The shell's `RouteMenuSlot` auto-switches the sidebar to the chat-history ("local") view and renders the **switch button to the Main Menu** — on desktop and in the mobile drawer (so the picker/`+` sit between the app hamburger and the avatar, never overlapping). **Never** rebuild a bespoke chat sidebar/header: the old `ChatPageShell` did, which overlapped the global header on mobile and created a 768–1023px dead zone (both gone). To change chat sidebar/header behavior, edit `ChatSidebarMenu` / `ChatRunHeader`, or the shell (`features/shell/components/sidebar/`).
- **The agent picker is COMPACT (`AgentListDropdown compact`), never full-width.**

---

## Related features

- Depends on: `features/agents/` (execution-system, launcher), `features/agents/components/shared/` (`AgentConversationColumn`), `features/agents/components/agent-listings/` (`AgentListDropdown`).
- Cross-links: [`../../FEATURE.md`](../../FEATURE.md) (agents umbrella), [`../../docs/AGENT_INVOCATION_LIFECYCLE.md`](../../docs/AGENT_INVOCATION_LIFECYCLE.md) (where the agent≠conversation model originates), [`../../../conversation/FEATURE.md`](../../../conversation/FEATURE.md) (the *future* unified shell — not what this route uses), [`../../migration/phases/phase-07-chat-route.md`](../../migration/phases/phase-07-chat-route.md) (build log).

---

## Doctrine compliance

> Required by [PRINCIPLES.md](../../../../PRINCIPLES.md). The artifact is disposable; the platform is the product.

**Primitives reused**
- Redux slices / selectors: `conversationFocus` (`setFocus`, **`clearFocus`**, `selectFocusedConversation`), `conversations`/execution-system, `conversationList`, `conversation-history`, `surfaces`.
- Hooks: `useAgentLauncher`, `useCreatorOwnershipSync`, `useIsMobile`.
- Components: `AgentConversationColumn`, `AgentListDropdown`, `ChatHistorySidebar`, `PinnedAgentsSection`, `GhostTapButton`/`PanelLeftTapButton`, `Drawer`.
- Thunks: `launchAgentExecution` → `createManualInstance`, `loadConversation`, `fetchConversationHistory`.

**Primitives introduced**
- None. The revival fix reused the existing `clearFocus` action on the `conversationFocus` slice; the `+` fix reused the existing `activeAgentId` prop. Dead "last-used agent" code (`selectLastUsedAgentId` + a `fetchGlobalConversations` mount fetch) was **removed**, not replaced.

---

## Change log

- `2026-06-12` — claude: **RunControlsMenu Context tab wired** — replaced the placeholder with `ActiveContextPanel` (same `ContextAssignmentField` + live-apply as `ChatRunHeader`'s `ActiveContextButton`; `checkboxVariant="standard"`). Tab shows a primary dot when `selectHasActiveContext`; working context counts toward the gear/plus customization badge.
- `2026-06-10` — claude: **incognito blocks sandbox binding.** Chat incognito now lives in Redux (`chatIncognito` slice). `resolveAgentSandboxRef` skips all bindings on `chat-route` when incognito is active; `RunControlsMenu` hides the Sandbox tab; `SandboxPanel` shows a disabled explainer. `ChatRoomClient` stamps `isEphemeral` on the live instance (and passes it to `useAgentLauncher`) so execute thunks send `store:false`.
- `2026-06-10` — claude: **incognito UI toggle (sidebar + avatar blackout).**
- `2026-06-10` — claude: **removed header `+` (new chat lives in sidebar); added incognito ghost affordance on fresh chat routes.**
- `2026-06-10` — claude: **agent picker tabs (Mine / Shared / All / System).** `AgentListContent` (via `AgentListDropdown` in `ChatRunHeader` + chat sidebar) now shows ownership tabs with badge counts. `makeSelectFilteredAgents` routes the System tab through builtin agents (`fetchAgentsListFull` data already loaded by `initializeChatAgents`); user tabs unchanged. Fav/category/tag filter chips hidden on System tab.
- `2026-06-10` — claude: **fixed draft loss when switching agents via the header picker.** Typing into the `/chat/new` landing input (or any chat input) and then changing agents through the `ChatRunHeader` `AgentListDropdown` destroyed the in-progress text — the picker's `handleAgentSelect` just `router.push`'d to `/chat/a/[id]` with no draft hand-off, while the `/chat/new` quick-action chips already used the `stashChatDraftTransfer` → `consumeChatDraftTransfer` round-trip. `handleAgentSelect` now reuses the SAME primitive: snapshot the source surface's draft (`chat-route:<activeAgentId>` input/display focus → `selectUserInputText` via `store.getState()`, no per-keystroke subscription) and stash it for the destination agent before navigating; `ChatRoomClient`'s existing draft-transfer effect re-applies it on mount. No new primitive introduced — the cross-agent draft carry is the same single-hop sessionStorage transfer the chips use.
- `2026-06-10` — claude: **`LandingPlusMenu` retired — the `/chat/new` `+` and the toolbar gear are now ONE component.** `NewChatLandingInput` mounts [`RunControlsMenu`](../inputs/smart-input/RunControlsMenu.tsx) with `variant="plus"` (Attach default tab + Model/Tools/Sandbox/Settings — the promotion the LandingPlusMenu docstring always promised). Per-run settings overrides under the Model tab are now catalogue-driven (`RunConfigOverrides`), and tool rows are single-line with a chevron-expanded description. Full detail in the agents [FEATURE.md](../../FEATURE.md) 2026-06-10 entry.
- `2026-06-09` — claude: **fixed `/chat/new` landing lingering on top of the live conversation after the first send.** `AgentConversationColumn` swapped the landing (greeting + quick-action chips + hero input) → conversation via an `AnimatePresence` exit. With React Compiler enabled the exiting landing child frequently never completed its exit, so the greeting/hero sat over the streaming chat for ~2.3s until the `/chat/new → /chat/[id]` route promotion remounted the tree (looked broken — two inputs, message + greeting at once). Verified in-browser via fiber inspection: `showLanding` was already `false` (messageCount=2) yet the landing node stayed mounted at opacity 1. Replaced the `AnimatePresence` swap with a plain `showLanding ? landing : conversation` conditional (enter-only fades on each branch) so the landing unmounts the instant the first message lands. Now clears at ~300ms instead of ~2300ms. No input component was touched.
- `2026-05-25` — claude: **aligned chat sidebar chrome with the main app nav (no more parallel styling system).** ChatSidebarMenu was rendering two completely different DOM trees for collapsed vs expanded (a bespoke rail of icon buttons collapsed, ChatHistorySidebar expanded) — so chrome items appeared / disappeared in non-corresponding positions and didn't match the main app nav's look. Replaced with a single render: `New chat · Search chats · Search agents · Voice agent` are now always-rendered rows using the EXACT same `.shell-nav-item shell-tactile-subtle` markup as `features/shell/components/sidebar/NavItem.tsx` (canonical 18px Lucide, `.shell-nav-icon` + `.shell-nav-label`). The shell's existing CSS handles label collapse, icon centering, and the collapsed `[title]:hover::after` tooltip — so the icons stay at the IDENTICAL x position (`itemX=6`, `iconX=12`) in both states and the first item stays at the IDENTICAL y position; subsequent items have only the small y drift that `.shell-nav-item`'s padding switch produces in the main nav too. Pinned + grouped history are expanded-only (no room in the narrow rail). Added a reusable `hideSearchAffordance` prop to `ChatHistorySidebar` so the inner list doesn't ship a duplicate search bar, and gave the Search Chats popover its own Redux scope (`chat-route-search`) so its in-popover searchTerm doesn't silently filter the always-on sidebar list after close. Verified in-browser at 1440 in both states: itemX/iconX identical for all four chrome items, first item itemY identical, Search Chats popover focuses its input on open.
- `2026-05-25` — claude: **fixed "user submits a client-tool answer → nothing happens" (Flow 5).** After aidream made client-tool delegation a hard-suspend (stream ends), the client sat waiting on a closed stream and the agent never resumed. Wired the round-trip on both clients: `submit-tool-results.ts` reads `continuation_needed` and dispatches the new `resumeInstance` thunk; resume goes through a shared `runAiStream` helper extracted from `executeInstance` so both paths share the heartbeat/abort/commit pipeline. `dispatchUiFirstTool` now flips the instance to `paused` honestly (guarded against the end-of-stream `complete` overwrite). Made the failure class structurally impossible: deleted the dead `resume-conversation.ts` and the dead `submitToolResults` (plural) thunk in `execute-instance.thunk.ts`, and added an ESLint `no-restricted-syntax` chokepoint banning any `/tool_results` literal/template outside the funnel. Mirror commit landed in matrx-extend (SW broadcasts `STREAM_CONTINUE` on `continuation_needed`; sidepanel hook subscribes and runs `resumeRun`). Canonical protocol lives at [`features/agents/docs/CLIENT_TOOL_SUSPEND_RESUME.md`](../../docs/CLIENT_TOOL_SUSPEND_RESUME.md) — supersedes the stale `DURABLE_TOOL_CALLS_CLIENT_INTEGRATION.md` (referenced a nonexistent `processStreamEvent` reducer) and clarifies the boundary against `PYTHON_RESUME_SPEC.md` (a different, unbuilt resume) and the extension's cursor-replay scaffold (`STREAM_RESUME_PROTOCOL.md` — also unbuilt). Verified e2e against production aidream: user-tool answer → `POST /tool_results 200 {continuation_needed:true, user_request_id}` → `POST /resume 200` → continuation streams, re-entrancy works.
- `2026-05-25` — claude: **made the collapsed sidebar rail useful + pinned the header controls to the start.** When the shell sidebar is collapsed, `ChatSidebarMenu` no longer renders nothing — it shows an icon rail (`Plus` new chat, `Search` search-chats popover, `Webhook` search-agents popover) so the rail offers the same core actions as the header. Search-chats reuses `ChatHistorySidebar` in a portaled popover (added a reusable `initialSearchOpen` prop); search-agents reuses the canonical `AgentListDropdown` via `triggerSlot` (added a reusable, backward-compatible `contentSide` prop so it opens to the right of the rail instead of over it). `ChatRunHeader` is now `lg:w-full` so on desktop the `[collapse · agent · +]` controls sit at the START of the header (no longer drifting to center as the slot re-centers with sidebar width); mobile is unchanged. `Bot` → `Webhook` to satisfy the banned-icon lint rule and match the Agents nav. Verified in-browser at 1440 (expanded + collapsed; both search popovers open and filter; agent popover opens `side="right"`) and mobile 375 (unchanged). Note: live re-verification was repeatedly disrupted by an unrelated broken untracked file `features/lists-quick/QuickListsManager.tsx` (`LucideIcons` used without a namespace import) that put the dev server in a `/chat`↔`/lists` redirect loop and corrupted HMR.
- `2026-05-24` — claude: **consolidated the Smart Input action icons + added per-run tool selection.** Replaced the standalone sandbox (Box) icon with one `InputControlsMenu` (SlidersHorizontal) opening a tabbed popover: **Tools** (`RunToolPicker` — add registry tools to this run; stored on `builderAdvancedSettings.addedTools`, folded into the request by `buildToolInjection` as additive server specs), **Sandbox** (`SandboxPanel`, extracted from the now-deleted `SandboxAttachControl`), and **Settings** (`RunSettingsEditor` — disable tool injection, Surface Simulator, debug, save-to-DB). Resources (Database) and Variables (`{}`) stay as their own icons. Trigger shows a count badge / active dot when the run is customized. Lives in the shared input so every surface (chat, runner, builder, apps) gets it.
- `2026-05-24` — claude: **built failure-and-retry (Flow 4).** Failed turns are now kept in history and rendered as a standalone `AssistantError` bubble (friendly message + expandable Details for live errors) with a one-click, non-destructive **Retry**. Unified failed-turn detection (`isFailedRecord`/`extractRecordError`) across live + persisted (post-reload) failures; transcript ordering switched to `(position, created_at)` so a failed attempt sits just before its retry (they share a position). Replaced the old truncate-based `atomicRetry` + `RetryConfirmDialog` with `retryConversationTurn` → `executeInstance({retry:true})` (the guide's `POST /ai/conversations/{id}` `{retry:true}` contract; falls back to re-send for never-persisted client failures). Also fixed a latent SSR 500: a static import of `AgentAssistantMessage` in `AgentConversationDisplay` pulled jspdf/fflate into SSR — now `dynamic(ssr:false)` like the rest. Verified in-browser: persisted failed bubble + Retry render on reload; Retry POSTs `{retry:true}` to the right endpoint and keeps the failed turn; happy path (3 turns) unaffected. **Backend not yet on the contract — see Flow 4 note.**
- `2026-05-24` — claude: **rebuilt chat onto the app shell, mirroring `/agents/[id]/run`.** Deleted the bespoke `ChatPageShell` (custom sidebar + header that overlapped the global header on mobile and created a 768–1023px dead zone). History is now a Large-Route menu (`ChatSidebarMenu`) in `route-menu-registry`; controls are a compact picker + `+` in the shell header via `ChatRunHeader`/`<PageHeader>`. The shell sidebar defaults to the chat-history view with a switch to the main app menu (desktop + mobile drawer). `ChatRoomClient` now renders only the conversation column. Verified in-browser at 375 / 1280: history, switch, compact picker, conversation load, and `+`-no-revert all work.
- `2026-05-24` — claude: fixed the real "`+`/agent-switch snaps back to the old conversation" cause — the post-submit promotion effect firing on a stale-closure `liveConversationId` during the shared-`surfaceKey` route transition (added a live-focus freshness guard in `ChatRoomClient`). Reworked the mobile header to inject `[chat-menu][picker][+]` into the app shell's `#shell-header-center` via `PageHeaderPortal` (was a local `<header>` overlapping the app hamburger + avatar); added an "App menu" entry atop the chat drawer; aligned the desktop-sidebar breakpoint to `md:` (768) to kill the 768–1023 dead zone. Verified in-browser at 375 / 768 / 900 / 1280.
- `2026-05-23` — claude: documented the live chat route for the first time. Fixed two revival bugs — agent re-selection reviving the agent's last conversation (stale per-agent focus; added a fresh-start `clearFocus` guard in `ChatRoomClient`) and `+` using the last-used/default agent instead of the active agent (`ChatPageShell.handleNewChat`). Removed the dead `selectLastUsedAgentId` selector. Established the agent≠conversation rules above as the surface's load-bearing invariants.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this surface, update this file's status/flows/invariants and append to the Change log. This route had no FEATURE.md for its entire existence, which is why the agent≠conversation model kept getting re-violated. Do not let that recur.
