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
- `ChatRoomClient.tsx` — orchestrates one conversation surface. Two mount paths (fresh vs. existing). Owns the fresh-start guard and post-submit URL promotion.
- `ChatPageShell.tsx` — layout shell: history sidebar, agent picker (`AgentListDropdown`), pinned agents, `+` button, keyboard shortcuts. Owns `handleNewChat`.
- `ChatNewClient.tsx` — `/chat/new` landing (default agent + greeting).
- `NewChatGreeting.tsx` — greeting + chips; chip click stashes a draft and pushes to `/chat/a/[chipAgentId]`.

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
- `ChatPageShell.handleNewChat`: `activeAgentId ? push('/chat/a/[activeAgentId]') : push('/chat/new')`. Both destinations start fresh (Flow 1).

---

## Invariants & gotchas

- **The surface key is `chat-route:<agentId>` (agent-derived).** Focus per surface persists across route changes and is **not** auto-cleared on unmount (the launcher uses `retainOnUnmount`). Therefore the agent route **must** clear stale focus on mount — that is the fresh-start guard in `ChatRoomClient`. Remove it and Bug "switching back to an agent revives its old chat" returns immediately.
- **`createManualInstance` always mints a new conversation id** — it never dedupes by agent. Revival, when it happened, came from stale *focus*, not instance reuse.
- **`conversationFocus` is runtime-only (not persisted).** Revival bugs are same-session; a hard reload hides them. Test within one session.
- **Never reintroduce "last-used agent" or "resume last conversation" routing.** Those are the killed anti-patterns: per-agent focus stickiness, "stateful `+`", resume-last-on-entry. They *feel* helpful and are exactly what the product forbids.
- **`initial_agent_id` is provenance, not a live link.** Show it; never use it to reopen or re-bind a conversation to an agent.
- **First-turn promotion timing:** promote on `messageCount >= 2`, not on the optimistic local message — promoting earlier races the server's `cx_conversation` insert and 404s back to `/chat/new`.
- **The "`+`/agent-switch snaps back to the old chat" bug lived in the post-submit promotion effect** — NOT in focus or `loadConversation`. `/chat/[id]` and `/chat/a/[agentId]` share the same `surfaceKey`, so on a `+` click the promotion effect could fire with a STALE-CLOSURE `liveConversationId` (the previous conversation, already at `messageCount >= 2`) and `router.replace` back to it, one render before the launcher swapped focus to the fresh conversation. **Guard (do not remove):** the effect only promotes when `liveConversationId` is STILL the surface's focused input conversation, read live from the store (`store.getState().conversationFocus.bySurface[surfaceKey].input`).
- **The mobile header lives in the app shell's center slot, never a local `<header>`.** The chat injects `[chat-menu][picker][+]` into `#shell-header-center` via `PageHeaderPortal` (gated by `useIsMobile()`), so the controls sit BETWEEN the app's hamburger (left) and the avatar (right). A local full-width `<header>` here overlaps the global shell header and buries the `+` under the avatar — the exact bug this replaced. Mobile content is offset by `var(--shell-header-h)` because the global header overlays the top of `shell-main`. The chat drawer's top "App menu" row opens the app nav (`#shell-mobile-menu`) since the chat route hides the app dock.
- **Breakpoints must stay aligned.** The desktop sidebar shows at `md:` (≥768) to match `useIsMobile()`'s 768px threshold. A mismatch (e.g. sidebar at `lg:` while the mobile controls flip at 768) creates a dead zone where neither renders — no picker, no `+`, no history.

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
- Components: `AgentConversationColumn`, `AgentListDropdown`, `ChatHistorySidebar`, `PinnedAgentsSection`, `PlusTapButton`/`PanelLeftTapButton`, `Drawer`.
- Thunks: `launchAgentExecution` → `createManualInstance`, `loadConversation`, `fetchConversationHistory`.

**Primitives introduced**
- None. The revival fix reused the existing `clearFocus` action on the `conversationFocus` slice; the `+` fix reused the existing `activeAgentId` prop. Dead "last-used agent" code (`selectLastUsedAgentId` + a `fetchGlobalConversations` mount fetch) was **removed**, not replaced.

---

## Change log

- `2026-05-24` — claude: fixed the real "`+`/agent-switch snaps back to the old conversation" cause — the post-submit promotion effect firing on a stale-closure `liveConversationId` during the shared-`surfaceKey` route transition (added a live-focus freshness guard in `ChatRoomClient`). Reworked the mobile header to inject `[chat-menu][picker][+]` into the app shell's `#shell-header-center` via `PageHeaderPortal` (was a local `<header>` overlapping the app hamburger + avatar); added an "App menu" entry atop the chat drawer; aligned the desktop-sidebar breakpoint to `md:` (768) to kill the 768–1023 dead zone. Verified in-browser at 375 / 768 / 900 / 1280.
- `2026-05-23` — claude: documented the live chat route for the first time. Fixed two revival bugs — agent re-selection reviving the agent's last conversation (stale per-agent focus; added a fresh-start `clearFocus` guard in `ChatRoomClient`) and `+` using the last-used/default agent instead of the active agent (`ChatPageShell.handleNewChat`). Removed the dead `selectLastUsedAgentId` selector. Established the agent≠conversation rules above as the surface's load-bearing invariants.

---

> **Keep-docs-live rule (CLAUDE.md):** after any substantive change to this surface, update this file's status/flows/invariants and append to the Change log. This route had no FEATURE.md for its entire existence, which is why the agent≠conversation model kept getting re-violated. Do not let that recur.
