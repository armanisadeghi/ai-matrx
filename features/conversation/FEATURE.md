# FEATURE.md — `conversation` + `chat` (legacy + new)

**Status:** `migrating` — **unified architecture scaffolded, zero routes migrated, legacy still in prod**
**Tier:** `1`
**Last updated:** `2026-04-22`

> This doc covers the new unified `features/conversation/` AND the legacy `features/chat/`, `features/cx-chat/`, `features/cx-conversation/`, `features/public-chat/`. **Critical:** the unified `ConversationShell` is built, but no route uses it yet. Agents modifying chat UX must understand which surface they're actually touching. **The live `/chat` route already exists** — it runs at `app/(a)/chat/` on the `features/agents/` execution-system, and its authoritative doc is [`features/agents/components/chat/FEATURE.md`](../agents/components/chat/FEATURE.md), **not** this file. Do not assume "chat route" means `ConversationShell`.

---

## Purpose

One conversational surface for every agent interaction — the endpoint of the Build → Test → Consume chain. The new `ConversationShell` is designed to consolidate six fragmented routes into a single component tree that every consumer plugs into (Chat, Runner, Agent Apps, Shortcut result display, public chat).

---

## Migration state (read this first)

| Surface | Location | Status |
|---|---|---|
| **Live chat route** (the real `/chat`) | `app/(a)/chat/` + `features/agents/components/chat/` | **Active in prod** — built on the `features/agents/` execution-system, NOT `ConversationShell`. Authoritative doc: [`features/agents/components/chat/FEATURE.md`](../agents/components/chat/FEATURE.md) |
| `ConversationShell` (target unified tree) | `features/conversation/` | **Built but no route consumes it yet** |
| Legacy chat backing | `features/cx-chat/` | Live in prod |
| Legacy conversation backing | `features/cx-conversation/` | Live in prod |
| Intermediate chat feature | `features/chat/` | Partial |
| Public chat | `features/public-chat/` | Live; has its own README |
| Deprecated route stub | `app/(authenticated)/deprecated/chat/` | Placeholder |
| Planned unified route (migrate live `/chat` onto the Shell) | `app/(a)/chat/` → `ConversationShell` | Not started — the live route above runs on `features/agents/` today |
| Legacy public route | `app/(public)/free/` | Live |
| Legacy prompt-apps route | `app/(authenticated)/prompt-apps/` | Live, deprecated |
| Legacy applets route | `app/(authenticated)/applets/` | Live, deprecated |
| Current Runner route | `app/(authenticated)/ai/[agent-id]/run/` | Live |

**Six legacy routes** will consolidate into the unified Shell. Tracking: [`features/agents/migration/phases/phase-07-chat-route.md`](../agents/migration/phases/phase-07-chat-route.md), [`features/cx-chat/MIGRATION-TRACKER.md`](../cx-chat/MIGRATION-TRACKER.md).

**Required reading for target architecture:** [`features/conversation/CONVERSATION_SYSTEM.md`](./CONVERSATION_SYSTEM.md) and [`DEPENDENCIES.md`](./DEPENDENCIES.md).

---

## Shared features across all surfaces

Every chat/conversation surface — legacy and new — must support:

| Feature | Notes |
|---|---|
| Dual-protocol streaming | **NDJSON canonical** (target); Socket.IO legacy (being phased out) |
| Per-message error isolation | `MessageErrorBoundary` wraps every message render |
| 14 auth-gated message actions | Copy, edit, regenerate, fork, branch, reaction, share, save-to-notes, etc. (enumerate from source) |
| Variable input modes | Guided (wizard/cards) and classic (form) |
| Canvas panel integration | Artifacts render in side panel |
| TTS / Cartesia | Speak messages aloud |
| Reactions | Thumbs up/down on messages |
| DOM-capture PDF export | Export a conversation as PDF |
| Tool call inline renderers | Registry-driven (cross-ref [`../tool-call-visualization/FEATURE.md`](../tool-call-visualization/FEATURE.md)) |

---

## Entry points

**Unified (new) — `features/conversation/`**
- `components/` — `ConversationShell`, message list, input, panel orchestrator
- `hooks/` — conversation loading, message actions
- `state/` — transient UI state (not execution — that's in `features/agents/redux/`)
- `types/`, `utils/`, `CONVERSATION_SYSTEM.md`, `DEPENDENCIES.md`

**Legacy — `features/cx-chat/`, `features/cx-conversation/`, `features/chat/`**
- Don't extend. Read for context when debugging prod.
- `features/cx-chat/MIGRATION-TRACKER.md` tracks consolidation.

**Invocation path** — all surfaces go through `launchConversation` (see [`../agents/docs/AGENT_INVOCATION_LIFECYCLE.md`](../agents/docs/AGENT_INVOCATION_LIFECYCLE.md)).

---

## Data model

- `cx_conversation` — conversation root: `id`, scope columns (`organization_id`, `project_id`, `task_id`), `parent_conversation_id` (for nesting), `forked_from_id` / `forked_at_position` (for forks), created/updated timestamps
- Message table — turns in order with role, content (blocks), tool-call lifecycle, reactions
- Execution Redux state lives under `features/agents/redux/execution-system/` (see the agents FEATURE.md); conversation UI state lives under `features/conversation/state/`

---

## Key flows

### Flow 1 — Standard chat turn

1. User types → `ConversationShell` input dispatches `launchConversation` (ID-only agent payload)
2. First turn hits `POST /ai/agents/{id}`; subsequent turns hit `/ai/conversations/{id}`
3. NDJSON stream parsed into `activeRequests` slice; message list reads derived state
4. Message actions (14) become available on completion

### Flow 2 — Fork a conversation

1. User picks "Fork here" at message position `N`
2. Server **duplicates** conversation and messages up to position `N` into a brand-new conversation
3. New conversation has `forked_from_id` + `forked_at_position` references — **not** shared-data branches
4. Each message in the fork is a standalone row

### Flow 3 — Sub-conversation (nesting)

1. A message / tool call spawns a child conversation (e.g. sub-agent invocation)
2. Child row has `parent_conversation_id` set
3. This is nesting, **not** forking — do not conflate

### Flow 4 — Public / ephemeral chat

1. Public route (`/public-chat`, legacy `/free`, or a public agent-app surface) dispatches with `origin.isEphemeral: true`
2. Turn 1 → `POST /ai/agents/{id}` with `store: false`, no `conversationId`
3. Turn 2+ → `POST /ai/chat` with full accumulated message history (NOT `/conversations/{id}` — no DB row exists)

### Flow 5 — Canvas panel integration

1. Stream emits artifacts (`content_block` events)
2. Canvas side panel renders them live via the artifacts registry
3. User interactions with artifacts feed back into next turn (bidirectional, see [`../artifacts/FEATURE.md`](../artifacts/FEATURE.md))

---

## Invariants & gotchas

- **Unified Shell exists but no route uses it yet.** Do not assume you can modify it and see changes anywhere — wire it up on a phase-07 task, don't repurpose a legacy route mid-sprint. The **live** chat route is a *different* codebase (`app/(a)/chat/` + `features/agents/components/chat/`); to change real chat UX, edit there and read [its FEATURE.md](../agents/components/chat/FEATURE.md).
- **Forks are fully independent DB copies**, not shared-data branches. Breaking this invariant silently corrupts history.
- **`parentConversationId` is for nesting, NOT forking.** Two different relationships.
- **Socket.IO is legacy.** New code uses NDJSON; any addition to Socket.IO is a regression.
- **Ephemeral turn 2+ MUST hit `/ai/chat`**, never `/conversations/{id}` — the row doesn't exist.
- **Error isolation per message.** A single message render failure must not take down the transcript.
- **Tool call renderers come from the registry**, not inline per-chat custom renders. See [`../tool-call-visualization/FEATURE.md`](../tool-call-visualization/FEATURE.md).
- **Scope stamping happens at first-turn time** on `cx_conversation`; subsequent turns inherit. Do not re-stamp.
- **Legacy features to leave alone:** `features/cx-chat/`, `features/cx-conversation/`. Read-only reference unless you're migrating them.

---

## Related features

- **Depends on:** `features/agents/` (runtime), `features/artifacts/` (inline artifact rendering), `features/tool-call-visualization/` (tool UIs), `features/sharing/` (conversation shares), `features/agent-context/` (variable/scope resolution)
- **Cross-links:** [`../agents/FEATURE.md`](../agents/FEATURE.md), [`../agents/docs/AGENT_INVOCATION_LIFECYCLE.md`](../agents/docs/AGENT_INVOCATION_LIFECYCLE.md), [`../agents/docs/STREAMING_SYSTEM.md`](../agents/docs/STREAMING_SYSTEM.md), [`CONVERSATION_SYSTEM.md`](./CONVERSATION_SYSTEM.md)

---

## Change log

- `2026-06-26` — claude: **conversation sharing/ownership moved onto canonical `cx_conversation` columns.** `is_public`→`visibility` (`platform.visibility` enum, RLS-enforced via `iam.has_access`) and `user_id`→`created_by` (trigger-stamped owner). Sharing read/write for conversations now writes the `visibility` column directly (owner-UPDATE RLS) instead of the deprecated-`is_public` `make_resource_*` RPCs; ownership reads use `created_by`. Canonical `ConversationVisibility` type + helpers in `features/cx-chat/types/cx-tables.ts`. Full detail in `features/agents/components/chat/FEATURE.md` Change Log (the live `/chat` doc).
- `2026-05-23` — claude: corrected the migration table + intro + invariants — the LIVE `/chat` route is active in prod at `app/(a)/chat/` on the `features/agents/` execution-system (NOT the unbuilt `ConversationShell`, which this doc previously implied was the only chat tree). Linked its new authoritative doc `features/agents/components/chat/FEATURE.md`.
- `2026-04-22` — claude: initial combined FEATURE.md covering unified conversation + legacy chat surfaces.

---

> **Keep-docs-live:** the migration state table is the highest-risk section — every route that moves onto the unified Shell must update that table here. Breaking this invariant means future agents assume the Shell is live in places it isn't.
