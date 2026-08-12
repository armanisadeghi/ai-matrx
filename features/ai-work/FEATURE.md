# FEATURE.md — `ai-work`

**Status:** `active` — the production overview, provider-conversation inbox, and read-only normalized transcript are live; compose, saved requests, provider execution, imports, and unified automation remain planned.
**Tier:** `1`
**Last updated:** `2026-08-11`

---

## Purpose

AI Work is the user-facing front door for finding, continuing, and organizing AI work without knowing which lower-level subsystem owns it. It composes live platform capabilities; it does not create a second conversation store, association system, scheduler, or provider bridge.

Cross-repo product plan: [`common-docs/projects/ai-work-hub/PLAN.md`](/Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md) — read it before adding compose, saved requests, imports, provider execution, or automation routes.

---

## Entry points

**Routes**

- `/work` — truthful directory of the capabilities a user can use now.
- `/work/conversations` — owner-scoped provider coding sessions projected onto canonical AI Matrx conversations.
- `/work/conversations/[conversationId]` — RLS-safe, read-only normalized transcript for agentless provider mirrors.
- `/work/admin` — admin map for this route family.

**Components**

- `components/AiWorkHeader.tsx` — one responsive route switcher for Overview and Conversations.
- `components/AiWorkOverview.tsx` — doors to live chat, provider conversations, projects, tasks, War Rooms, skills, connections, and schedules.
- `components/ProviderConversationTranscript.tsx` — normalized, read-only provider transcript with rich content rendering and task attachment.
- `features/agent-connections/components/sections/PluginsSection.tsx` — reused conversation inbox and diagnostics surface.

**Services and state**

- `service/providerConversation.ts` — direct RLS read of one canonical conversation and its latest 200 user-visible messages. Provider rows still use `features/agent-connections/coding-sessions/service.ts`; conversation and task actions stay in their owning features.
- No API route, database table, or Redux slice.

---

## Admin map

`app/(core)/work/admin/page.tsx` declares every AI Work route and owned component through `FeatureAdminPage`. Add every new route or owned component there in the same change.

---

## Data model

AI Work owns no data. `/work/conversations` consumes the existing owner-scoped `chat.coding_session` read model and its joined canonical `chat.conversation` state. The transcript detail reads `chat.conversation` and user-visible `chat.message` rows directly through Supabase RLS. Task attachment writes the existing `conversation → task` association through `AssociateTaskButton`.

---

## Key flows

### Browse captured provider work

`/work/conversations` → `PluginsSection` → `useCodingSessions()` → direct Supabase read in `coding-sessions/service.ts`. Each row opens `/work/conversations/[conversationId]` through `EntityRef`, exposes the canonical conversation action registry, states its fidelity verdict, and never reads raw provider ledger entries.

### Read an agentless provider transcript

`/work/conversations/[conversationId]` → `readProviderConversation()` → direct RLS conversation/message read → generated `MessagePart` validation → `ProviderConversationTranscript`. Text parts render through `RichDocument`; thinking stays private and non-text activity is counted without invented prose. The detail is explicitly read-only because provider mirrors intentionally have `initial_agent_id = null`. `/chat/[conversationId]` remains the runnable AI Matrx surface for agent-backed conversations only.

### Attach a provider conversation to a task

`PluginsSection showTaskAssociation` → `AssociateTaskButton entityType="conversation"` → existing task association RPC flow. The technical `/agent-connections/plugins` route leaves this opt-in off; `/work/conversations` enables it because organization is part of the daily-work surface.

### Reach an existing capability

`/work` → a normal Next.js link → the feature's canonical route. The Hub never proxies data or duplicates a destination's UI.

---

## Invariants & gotchas

- **Only advertise live routes.** `/work/new`, `/work/requests`, imports, provider launch, and provider automations stay absent until their real execution paths ship.
- **Codex is not ChatGPT.** No UI labels coding sessions as ChatGPT history.
- **Mirrored is not native.** Fidelity and continuation language come from the existing coding-session verdict; no generic Resume action is allowed.
- **Never route an agentless mirror into runnable chat.** Provider inbox doors use `/work/conversations/[conversationId]`; no fake `initial_agent_id` may be assigned.
- **Exact provider provenance only.** The transcript accepts `source_app` `claude-code|codex|cursor|vscode`. Agent-backed non-provider conversations redirect to runnable chat; other non-provider records return to the provider inbox.
- **A new AI Matrx chat is not a continuation.** The transcript links to `/chat/new` with that exact distinction and does not claim to seed or resume anything.
- **One read path.** Provider conversations continue to use `useCodingSessions`; the Hub never adds a second query or cache.
- **One canonical conversation.** Open, share, fork, pin, archive, knowledge-graph state, and task association act on `conversation_id`, not the provider binding.
- **Old routes remain valid.** `/agent-connections/plugins`, chat, skills, projects, tasks, War Rooms, and schedules remain canonical feature doors.

---

## Related features

- `features/agent-connections/FEATURE.md` — coding-session read model, diagnostics, MCP, skills.
- `features/agents/components/chat/FEATURE.md` — canonical AI Matrx chat.
- `features/tasks/FEATURE.md` — task association and task creation.
- `features/war-room/FEATURE.md` — conversation-capable command rooms.
- `/Users/armanisadeghi/code/common-docs/systems/coding-session-bridge/FEATURE.md` — provider/session contract.

---

## Doctrine compliance

**Primitives reused**

- Components: `RouteHeader`, `RouteModeNav`, `ModuleSignInGate`, `ErrorBoundaryView`, `AccessGate`, `Skeleton`, `PluginsSection`, `EntityRef`, `ItemMenu`, `AssociateTaskButton`, `RichDocument`.
- Services/hooks: `useCodingSessions`, coding-session service/verdict, generated message-content validation, `buildConversationMenu`, existing task association flow.
- Shell: `primaryNavItems`, route metadata, favicon registry.

**Primitives introduced**

- `AiWorkHeader` — the route family needs one shared header; no existing header names these routes.
- `AiWorkOverview` — the plan explicitly requires one product front door; existing dashboard and Agent Connections surfaces answer different questions.
- `ProviderConversationTranscript` + its narrow server read — runnable chat requires an agent and cannot truthfully render mirrored agentless conversations; this surface reuses the canonical content engine and access gate without creating another store.

No data primitive, endpoint, helper, slice, table, or provider capability was added.

---

## Current work / migration state

The first production slice is the overview, provider inbox, normalized read-only transcript, and task attachment. OAuth identity for the tested Claude adapter has been repaired and a session is visible; grant authorization and session delivery must still remain separately stated. Next: project/War Room association actions and the unified cross-provider read model before compose or provider execution.

---

## Change log

- `2026-08-11` — Codex: added `/work/conversations/[conversationId]` so agentless Claude Code mirrors open a real read-only transcript instead of redirecting through runnable chat; reused generated message validation, `RichDocument`, `AccessGate`, and task attachment.
- `2026-08-11` — Codex: shipped `/work`, `/work/conversations`, the primary-navigation door, truthful live-capability directory, reused provider inbox, and conversation-to-task attachment.
