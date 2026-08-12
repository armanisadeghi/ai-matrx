# FEATURE.md — `ai-work`

**Status:** `active` — the production overview, unified AI Matrx/provider conversation inbox, direct work associations, truthful connections surface, and a paginated provider transcript with real tool activity are live; compose, saved requests, provider execution (certification-gated), and unified automation remain planned. Historical Claude sync is live in the Matrx Local desktop app and honestly doored from here.
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
- `components/ProviderConversationTranscript.tsx` — normalized, read-only provider transcript: backward message pagination, interleaved `chat.tool_call` activity through the canonical tool-call components, the canonical conversation menu, task attachment, and the organization panel.
- `features/agents/components/conversation-history/ConversationHistorySidebar.tsx` — reused list/search/source filter and real range pagination.
- `features/scopes/components/associations/AssociationList.tsx` — reused organization rows, doors, picker, attach, and detach UI.

**Services and state**

- `service/providerConversation.ts` — server RLS read of one canonical conversation and its newest page of user-visible messages.
- `service/providerConversationClient.ts` — browser RLS reads for the transcript: earlier-message pages (position keyset) and the post-mutation archive/KG state reconcile.
- `lib/providerConversationMessage.ts` — shared message columns, page size, and normalization used by both reads.
- `lib/providerTimeline.ts` — pure merge of the two paginated streams (messages by position, `chat.tool_call` by `started_at`) with **THE HONESTY FLOOR**: when either stream has unloaded older rows, items from the other stream older than that boundary are withheld, never rendered against a gap. Guarded by `__tests__/provider-timeline.test.ts`.
- `lib/codingSessionPresentation.ts` — `providerAccountIdentity(metadata)`: tolerant reader that prefers the display-safe `provider_account_label`, falls back to the opaque fingerprint keys (`provider_account_key` → `provider_account_fingerprint` → `account_fingerprint`, root or nested `source_metadata`), and otherwise states "No account identity reported". Never renders emails, tokens, or arbitrary metadata. `workspaceName(metadata)` reads the bridge-stamped `workspace_name` (last path segment of the provider working directory, aidream v0.2.40+) the same tolerant way — chip on the inbox inspector binding, the transcript header, the technical session rows (also search-matchable), and a per-provider "Workspaces (N)" grouping on `/work/connections`; sessions predating the contract simply show nothing.
- Selected provider facts use the narrow owner-scoped `fetchCodingSessionBindings(conversationId)` projection; the diagnostics/connections list is `useCodingSessions`, now keyset-paginated (`loadOlder`/`hasMore`) over `fetchCodingSessions`.
- No API route, database table, or Redux slice.

---

## Admin map

`app/(core)/work/admin/page.tsx` declares every AI Work route and owned component through `FeatureAdminPage`. Add every new route or owned component there in the same change.

---

## Data model

AI Work owns no data. `/work/conversations` consumes the existing `conversationHistory` scoped Redux store over canonical `chat.conversation`, then reads only the selected row's owner-scoped `chat.coding_session` binding facts. It never reads `chat.coding_session_entry`. Project and Task links write canonical `conversation → project|task` edges; War Room links reuse the War Room mapper for canonical `conversation → war_room` edges. The transcript detail reads `chat.conversation`, user-visible `chat.message`, and `chat.tool_call` rows directly through Supabase RLS — never `chat.coding_session_entry`.

---

## Key flows

### Browse all conversation work

`/work/conversations` → `AiWorkConversationsInbox` → canonical `ConversationHistorySidebar(scopeId="ai-work-unified-inbox", surfaceId="history-window")`. Empty `agentIds` intentionally means every accessible canonical conversation; range pagination remains owned by the existing history thunk. Selecting a row reads only that conversation's provider bindings, states provider/account/fidelity/origin/runtime/delivery/capability facts, and never reads raw provider ledger entries. Provider mirrors open the normalized `/work/conversations/[id]` transcript; ordinary AI Matrx conversations open `/chat/[id]`.

### Read an agentless provider transcript

`/work/conversations/[conversationId]` → `readProviderConversation()` → direct RLS conversation/message read → generated `MessagePart` validation → `ProviderConversationTranscript`. Text parts render through `RichDocument`; thinking stays private. The client then loads the conversation's `chat.tool_call` rows through the canonical `fetchConversationToolCallsPage` and interleaves them by timestamp (`buildProviderTimeline`); each run renders as canonical `ToolCallVisualization` cards behind a `ToolCallBatch` fold — never a bespoke tool renderer. **Load earlier** pages both streams backward with true totals ("X of Y messages and A of B tool actions"). The header carries `buildConversationMenu` (pin/share/archive/duplicate/KG; rename and delete hidden) plus the organization panel. The detail stays read-only because provider mirrors intentionally have `initial_agent_id = null`; `/chat/[conversationId]` remains the runnable AI Matrx surface for agent-backed conversations only.

### Organize a conversation

Selected conversation → `ConversationOrganizationPanel` → canonical `AssociationList` limited to `project|task|war_room`. Project and Task use `useAssociations`; War Room uses its canonical assignment mapper so container organization resolution and War Room semantics remain in their owning feature. Existing associations resolve titles and render real entity doors; detach is never hidden.

### Inspect connections and sync readiness

`/work/connections` keeps five states separate. Delivered owner-scoped bindings prove client detection and session delivery; per-provider cards group sessions by `providerAccountIdentity` (multiple accounts render as a grouped list with counts and last delivery); the binding does not expose the OAuth grant; the typed backend `GET /coding-sessions/claude/capabilities` drives the **Start a Claude Code session** card — unavailable ⇒ the truthful reason and NO button; available ⇒ a disabled certification-pending button until the managed-launch lane certifies (no fake Resume/launch anywhere). **Historical Claude Code sync is real and lives in Matrx Local** (v1.4.22+, sidebar → Claude History); the card doors to the desktop release download because the `aimatrx://` scheme only handles OAuth callbacks — no pretend deep link, no browser filesystem read. ChatGPT and Claude.ai web-chat history stay honestly unavailable. The page links to `/agent-connections/plugins` for technical diagnostics.

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
- **Sync is real or absent.** Browser filesystem access is forbidden. Historical Claude sync is advertised only as the Matrx Local desktop capability it is, with a download door — never as a web action.
- **Tool activity renders through the canonical system only.** `cxToolCallToLifecycleEntry` → `ToolCallVisualization`/`ToolCallBatch`. A bespoke tool renderer on this surface is the exact defect the shape doctrine bans.
- **THE HONESTY FLOOR on merged pagination.** Messages and tool calls paginate on different keys; never render one stream's items below the other's unloaded boundary (`lib/providerTimeline.ts`).

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

- Components: `RouteHeader`, `RouteModeNav`, `ModuleSignInGate`, `ErrorBoundaryView`, `AccessGate`, `Skeleton`, `ConversationHistorySidebar`, `AssociationList`, `UniversalAssociationPicker`, `EntityRef`, `RichDocument`, `ToolCallVisualization`, `ToolCallBatch`, `ItemMenu` + `buildConversationMenu`.
- Services/hooks: conversation-history slice/thunk, targeted coding-session binding projection, `useCodingSessions` diagnostics read (extended with keyset `loadOlder`), `fetchConversationToolCallsPage` (extended with `sinceStartedAt` + exact count), `cxToolCallToLifecycleEntry`, `favoritesService`, coding-session verdict, `useAssociations`, War Room association mapper, generated typed Python client, generated message-content validation.
- Shell: `primaryNavItems`, route metadata, favicon registry.

**Primitives introduced**

- `AiWorkHeader` — the route family needs one shared header; no existing header names these routes.
- `AiWorkOverview` — the plan explicitly requires one product front door; existing dashboard and Agent Connections surfaces answer different questions.
- `ProviderConversationTranscript` + its narrow server read — runnable chat requires an agent and cannot truthfully render mirrored agentless conversations; this surface reuses the canonical content engine and access gate without creating another store.
- `AiWorkConversationsInbox` and `AiWorkConnections` are product compositions over existing primitives; they add no data model or backend endpoint.

No data primitive, endpoint, helper, slice, table, or provider capability was added.

---

## Current work / migration state

The third production slice makes the provider transcript complete (backward pagination, real tool activity, canonical conversation actions and organization) and makes connections account-aware with a capability-gated launch entry point. Grant identity and one-click reconnect remain backend/client work; compose, saved requests, and certified provider execution are still absent.

---

## Change log

- `2026-08-12` — Claude: surfaced the bridge's new `workspace_name` provenance (tolerant `workspaceName()` reader): workspace chips on the inbox inspector, transcript header (owner-scoped binding read), and technical session rows (+ search match), plus per-provider "Workspaces (N)" groupings on `/work/connections`. Verified the backfilled real conversation titles render across the inbox/transcript (they read canonical `chat.conversation.title`, so no frontend change was needed).
- `2026-08-12` — Claude: transcript backward pagination + interleaved `chat.tool_call` activity via canonical tool components (honesty-floor merge in `lib/providerTimeline.ts`); canonical conversation menu + organization panel on the transcript; tolerant `providerAccountIdentity` reader (prefers `provider_account_label`) with account chips/grouping on the inbox inspector and connections cards; capability-gated "Start a Claude Code session" card; honest Matrx Local Claude-history door; keyset pagination for `fetchCodingSessions`/`useCodingSessions` (PluginsSection "Load older sessions").
- `2026-08-12` — Codex: replaced the provider-only 100-row product inbox with the canonical all-conversation history and real range pagination; added selected provider/account/fidelity/state facts, direct Project/Task/War Room organization through existing association primitives, `/work/connections`, and a typed managed-Claude capability check. Historical sync is explicitly unavailable until the real Matrx Local preview/import/status seam lands; technical `/agent-connections/plugins` remains intact.
- `2026-08-11` — Codex: added `/work/conversations/[conversationId]` so agentless Claude Code mirrors open a real read-only transcript instead of redirecting through runnable chat; reused generated message validation, `RichDocument`, `AccessGate`, and task attachment.
- `2026-08-11` — Codex: shipped `/work`, `/work/conversations`, the primary-navigation door, truthful live-capability directory, reused provider inbox, and conversation-to-task attachment.
