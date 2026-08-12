# FEATURE.md — `ai-work`

**Status:** `active` — the production overview, unified AI Matrx/provider conversation inbox, direct work associations, truthful connections surface, and normalized provider transcript are live; compose, saved requests, provider execution, historical import, and unified automation remain planned.
**Tier:** `1`
**Last updated:** `2026-08-12`

---

## Purpose

AI Work is the user-facing front door for finding, continuing, and organizing AI work without knowing which lower-level subsystem owns it. It composes live platform capabilities; it does not create a second conversation store, association system, scheduler, or provider bridge.

Cross-repo product plan: [`common-docs/projects/ai-work-hub/PLAN.md`](/Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md) — read it before adding compose, saved requests, imports, provider execution, or automation routes.

---

## Entry points

**Routes**

- `/work` — truthful directory of the capabilities a user can use now.
- `/work/conversations` — one paginated canonical conversation history across AI Matrx and provider mirrors, with a selected-row facts/organization inspector.
- `/work/conversations/[conversationId]` — RLS-safe, read-only normalized transcript for agentless provider mirrors.
- `/work/connections` — provider account/detection/delivery facts plus the live managed-Claude capability check and an honest historical-sync boundary.
- `/work/admin` — admin map for this route family.

**Components**

- `components/AiWorkHeader.tsx` — one responsive route switcher for Overview, Conversations, and Connections.
- `components/AiWorkOverview.tsx` — doors to live chat, provider conversations, projects, tasks, War Rooms, skills, connections, and schedules.
- `components/AiWorkConversationsInbox.tsx` — composes the canonical scope-keyed conversation history and selected binding facts without another conversation store.
- `components/ConversationOrganizationPanel.tsx` — adapts canonical association edges and the War Room mapper into one Project/Task/War Room picker.
- `components/AiWorkConnections.tsx` — separates account identity, authorization grant, client detection, session delivery, managed-runtime availability, and local history sync.
- `components/ProviderConversationTranscript.tsx` — normalized, read-only provider transcript with rich content rendering and task attachment.
- `features/agents/components/conversation-history/ConversationHistorySidebar.tsx` — reused list/search/source filter and real range pagination.
- `features/scopes/components/associations/AssociationList.tsx` — reused organization rows, doors, picker, attach, and detach UI.

**Services and state**

- `service/providerConversation.ts` — direct RLS read of one canonical conversation and its latest 200 user-visible messages. Selected provider facts use the narrow owner-scoped `fetchCodingSessionBindings(conversationId)` projection; the technical diagnostics list remains `useCodingSessions`.
- No API route, database table, or Redux slice.

---

## Admin map

`app/(core)/work/admin/page.tsx` declares every AI Work route and owned component through `FeatureAdminPage`. Add every new route or owned component there in the same change.

---

## Data model

AI Work owns no data. `/work/conversations` consumes the existing `conversationHistory` scoped Redux store over canonical `chat.conversation`, then reads only the selected row's owner-scoped `chat.coding_session` binding facts. It never reads `chat.coding_session_entry`. Project and Task links write canonical `conversation → project|task` edges; War Room links reuse the War Room mapper for canonical `conversation → war_room` edges. The transcript detail reads `chat.conversation` and user-visible `chat.message` rows directly through Supabase RLS.

---

## Key flows

### Browse all conversation work

`/work/conversations` → `AiWorkConversationsInbox` → canonical `ConversationHistorySidebar(scopeId="ai-work-unified-inbox", surfaceId="history-window")`. Empty `agentIds` intentionally means every accessible canonical conversation; range pagination remains owned by the existing history thunk. Selecting a row reads only that conversation's provider bindings, states provider/account/fidelity/origin/runtime/delivery/capability facts, and never reads raw provider ledger entries. Provider mirrors open the normalized `/work/conversations/[id]` transcript; ordinary AI Matrx conversations open `/chat/[id]`.

### Read an agentless provider transcript

`/work/conversations/[conversationId]` → `readProviderConversation()` → direct RLS conversation/message read → generated `MessagePart` validation → `ProviderConversationTranscript`. Text parts render through `RichDocument`; thinking stays private and non-text activity is counted without invented prose. The detail is explicitly read-only because provider mirrors intentionally have `initial_agent_id = null`. `/chat/[conversationId]` remains the runnable AI Matrx surface for agent-backed conversations only.

### Organize a conversation

Selected conversation → `ConversationOrganizationPanel` → canonical `AssociationList` limited to `project|task|war_room`. Project and Task use `useAssociations`; War Room uses its canonical assignment mapper so container organization resolution and War Room semantics remain in their owning feature. Existing associations resolve titles and render real entity doors; detach is never hidden.

### Inspect connections and sync readiness

`/work/connections` keeps five states separate. Delivered owner-scoped bindings prove client detection and session delivery; a safe explicit metadata key may provide an opaque provider account fingerprint; the binding does not expose the OAuth grant; the typed backend `GET /coding-sessions/claude/capabilities` reports managed-runtime availability; historical pull sync remains unavailable until Matrx Local exposes its real preview/import/status contract. The page links to `/agent-connections/plugins` for technical diagnostics and offers no browser filesystem or pretend sync action.

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
- **One conversation store.** The inbox uses the canonical scoped conversation-history slice. The selected binding query is supplemental provider metadata, not a second list/cache, and the technical `useCodingSessions` path remains unchanged.
- **One canonical conversation.** Open, share, fork, pin, archive, knowledge-graph state, and task association act on `conversation_id`, not the provider binding.
- **Old routes remain valid.** `/agent-connections/plugins`, chat, skills, projects, tasks, War Rooms, and schedules remain canonical feature doors.
- **Five connection states stay separate.** Account identity, authorization grant, client detection, session delivery, and last historical sync never infer one another.
- **Sync is real or absent.** Browser filesystem access is forbidden. A sync action appears only after Matrx Local supplies preview, explicit selection, import receipt, outbox, and status semantics.

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

- Components: `RouteHeader`, `RouteModeNav`, `ModuleSignInGate`, `ErrorBoundaryView`, `AccessGate`, `Skeleton`, `ConversationHistorySidebar`, `AssociationList`, `UniversalAssociationPicker`, `EntityRef`, `RichDocument`.
- Services/hooks: conversation-history slice/thunk, targeted coding-session binding projection, `useCodingSessions` diagnostics read, coding-session verdict, `useAssociations`, War Room association mapper, generated typed Python client, generated message-content validation.
- Shell: `primaryNavItems`, route metadata, favicon registry.

**Primitives introduced**

- `AiWorkHeader` — the route family needs one shared header; no existing header names these routes.
- `AiWorkOverview` — the plan explicitly requires one product front door; existing dashboard and Agent Connections surfaces answer different questions.
- `ProviderConversationTranscript` + its narrow server read — runnable chat requires an agent and cannot truthfully render mirrored agentless conversations; this surface reuses the canonical content engine and access gate without creating another store.
- `AiWorkConversationsInbox` and `AiWorkConnections` are product compositions over existing primitives; they add no data model or backend endpoint.

No data primitive, endpoint, helper, slice, table, or provider capability was added.

---

## Current work / migration state

The second production slice unifies canonical AI Matrx and provider conversations, adds real Project/Task/War Room association actions, and provides an honest Connections/Sync entry point. Historical Claude pull sync remains gated on the Matrx Local preview/import/status contract; grant identity and one-click reconnect remain backend/client work. Compose and provider execution are still absent.

---

## Change log

- `2026-08-12` — Codex: replaced the provider-only 100-row product inbox with the canonical all-conversation history and real range pagination; added selected provider/account/fidelity/state facts, direct Project/Task/War Room organization through existing association primitives, `/work/connections`, and a typed managed-Claude capability check. Historical sync is explicitly unavailable until the real Matrx Local preview/import/status seam lands; technical `/agent-connections/plugins` remains intact.
- `2026-08-11` — Codex: added `/work/conversations/[conversationId]` so agentless Claude Code mirrors open a real read-only transcript instead of redirecting through runnable chat; reused generated message validation, `RichDocument`, `AccessGate`, and task attachment.
- `2026-08-11` — Codex: shipped `/work`, `/work/conversations`, the primary-navigation door, truthful live-capability directory, reused provider inbox, and conversation-to-task attachment.
