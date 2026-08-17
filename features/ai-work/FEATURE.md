# FEATURE.md — `ai-work`

**Status:** `active` — the production overview, the canonical conversation table (honest default, full server-side sort/filter, URL state, provenance-labeled detail, sync visibility), direct work associations, truthful connections surface, a paginated provider transcript with real tool activity, the `/work/new` composer with real AI Matrx execution, and Saved Requests are live; provider execution (certification-gated) and unified automation remain planned. Historical Claude sync is live in the Matrx Local desktop app and honestly doored from here.
**Tier:** `1`
**Last updated:** `2026-08-16`

---

## Purpose

AI Work is the user-facing front door for finding, continuing, and organizing AI work without knowing which lower-level subsystem owns it. It composes live platform capabilities; it does not create a second conversation store, association system, scheduler, or provider bridge.

Cross-repo product plan: [`common-docs/projects/ai-work-hub/PLAN.md`](/Users/armanisadeghi/code/common-docs/projects/ai-work-hub/PLAN.md) — read it before adding compose, saved requests, imports, provider execution, or automation routes.

---

## Entry points

**Routes**

- `/work` — truthful directory of the capabilities a user can use now.
- `/work/new` — the eight-step composer: destination, request, expert system, skills, context, home, timing, review. AI Matrx execution only.
- `/work/requests` — the caller's own Saved Requests; open reloads the composer at `/work/new?request=<id>`.
- `/work/conversations` — the canonical entity-list table over every accessible conversation (`lib/entity-list`): every column sorts AND filters server-side, true scope counts, URL-backed scope/search/filters/sort/page, an honest human-relevant default with a visible door to the internal machine runs, and a compact sync indicator.
- `/work/conversations/[conversationId]` — ONE provenance-labeled detail route for every conversation: provider mirrors get the RLS-safe read-only transcript, AI Matrx conversations get the provenance view plus a door to runnable chat.
- `/work/connections` — provider account/detection/delivery facts plus the live managed-Claude capability check and an honest historical-sync boundary.
- `/work/admin` — admin map for this route family.

**Components**

- `components/AiWorkHeader.tsx` — one responsive route switcher for Overview, Start work, Conversations, Saved requests, and Connections.
- `compose/components/AiWorkComposer.tsx` — the composer. Owns no execution, no picker, and no store: it composes `useAgentLauncher`/`launchAgentExecution`, `AgentListDropdown`, `RunSkillPicker`, `SmartAgentResourcePickerButton` + `useAttachResource`, `AttachedDocumentChips`, `SmartAgentResourceChips`, `ContextLensBar`, `UniversalAssociationPicker`, and the floating `LiveRunWindow`.
- `compose/components/DestinationStep.tsx` — every destination with its REAL availability reason.
- `compose/components/HomeStep.tsx` — pre-launch Task / War Room picks over the canonical picker.
- `compose/components/ComposerSection.tsx` — one numbered step.
- `compose/components/SavedRequestsList.tsx` — mine-scoped Saved Requests with open/delete doors.
- `components/AiWorkOverview.tsx` — doors to live chat, provider conversations, projects, tasks, War Rooms, skills, connections, and schedules.
- `conversations/components/ConversationsBrowse.tsx` — `/work/conversations`: `<EntityListPage config={conversationListConfig}/>` plus the two things this surface owes above the table (the audience door and the sync indicator).
- `conversations/components/ConversationAudienceFilter.tsx` — **Your work / Internal machine runs / Everything**, each with a TRUE count from the facets query. Writes the ordinary `conversation_type` filter, so it can never disagree with the column header or the Filters panel.
- `conversations/components/ConversationProvenancePanel.tsx` — every displayed field grouped by the system that produced it (coding provider / AI Matrx / sync layer), with `title_source` stated beside the title. Rendered by BOTH the provider transcript and the AI Matrx detail view.
- `conversations/components/MatrxConversationDetail.tsx` — the non-provider half of the detail route.
- `conversations/components/SyncStatePanel.tsx` — `SyncStatePanel` (`/work/connections`) and `SyncStateIndicator` (`/work/conversations`) over ONE reader, plus the honest Sync-now door.
- `components/ConversationOrganizationPanel.tsx` — adapts canonical association edges and the War Room mapper into one Project/Task/War Room picker.
- `components/AiWorkConnections.tsx` — separates account identity, authorization grant, client detection, session delivery, managed-runtime availability, and local history sync.
- `analysis/catalog.ts` + `analysis/ConversationAnalyzePanel.tsx` — the "Analyze this conversation" action group on the inbox inspector and the transcript. Five plain-language actions (What you asked for / What came out of it / What's still open / Decisions and why / Ask vs. delivered), each an agent MANDATE (`conversation.vision_extractor|outcome_summarizer|action_auditor|decision_ledger|drift_auditor`, seeded by `migrations/agent_slots_conversation_analysis_seed.sql`, swappable from the mandates console) resolved at click time inside `launchAgentExecution`. The conversation id is passed as the agent's `conversation_id` runtime variable; the agent's registered `conversations` tool reads the history server-side under the caller's RLS. The run streams in the floating `LiveRunWindow` (never a spinner, never a bespoke renderer), and every finished report is a canonical conversation the panel doors via `EntityRef` → `/chat/<id>`.
- `components/ProviderConversationTranscript.tsx` — normalized, read-only provider transcript: backward message pagination, interleaved `chat.tool_call` activity through the canonical tool-call components, the canonical conversation menu, task attachment, and the organization panel.
- `features/agents/components/conversation-history/ConversationHistorySidebar.tsx` — reused list/search/source filter and real range pagination.
- `features/scopes/components/associations/AssociationList.tsx` — reused organization rows, doors, picker, attach, and detach UI.

**Services and state**

- `service/providerConversation.ts` — server RLS read of one canonical conversation and its newest page of user-visible messages.
- `service/providerConversationClient.ts` — browser RLS reads for the transcript: earlier-message pages (position keyset) and the post-mutation archive/KG state reconcile.
- `lib/providerConversationMessage.ts` — shared message columns, page size, and normalization used by both reads.
- `lib/providerTimeline.ts` — pure merge of the two paginated streams (messages by position, `chat.tool_call` by `started_at`) with **THE HONESTY FLOOR**: when either stream has unloaded older rows, items from the other stream older than that boundary are withheld, never rendered against a gap. Guarded by `__tests__/provider-timeline.test.ts`.
- `lib/managedClaudeCapability.ts` — the ONE reader of `GET /coding-sessions/claude/capabilities`, shared by `/work/connections` and the composer's destination gate. Two surfaces asking the same question must never disagree.
- `compose/destinations.ts` — the destination catalog and `destinationAvailability()`, the single place a destination's runnability is decided.
- `compose/savedRequests.ts` — Saved Request read/create/update/delete over `agent.shortcut`.
- `conversations/service.ts` — the three RPC calls behind the table (`cvx_list_scoped` / `cvx_list_scope_counts` / `cvx_list_facets`, `migrations/cvx_list_scoped.sql`), direct browser → Supabase. Plus the one write, an inline title edit.
- `conversations/types.ts` — the row type (derived from the RPC, never hand-mirrored), the declared scopes, and THE HONESTY AXIS: `HUMAN_CONVERSATION_TYPES` / `MACHINE_CONVERSATION_TYPES`, `DEFAULT_CONVERSATION_FILTERS`, and the derived `readAudience` / `applyAudience`.
- `conversations/presentation.ts` — plain-language labels for `conversation_type` / `origin_class` / provider, and `titleProvenance()`, the ONE place that decides whether a title is ours or the provider's.
- `conversations/syncState.ts` — `readSyncState()`: every `chat.coding_session` row the caller owns (through `readAllRows`, because every number here is a count someone acts on), rolled up per provider account into sessions / last delivery / freshness / fidelity / origin / workspaces.
- `lib/codingSessionPresentation.ts` — `providerAccountIdentity(metadata)`: tolerant reader that prefers the display-safe `provider_account_label`, falls back to the opaque fingerprint keys (`provider_account_key` → `provider_account_fingerprint` → `account_fingerprint`, root or nested `source_metadata`), and otherwise states "No account identity reported". Never renders emails, tokens, or arbitrary metadata. `workspaceName(metadata)` reads the bridge-stamped `workspace_name` (last path segment of the provider working directory, aidream v0.2.40+) the same tolerant way — chip on the inbox inspector binding, the transcript header, the technical session rows (also search-matchable), and a per-provider "Workspaces (N)" grouping on `/work/connections`; sessions predating the contract simply show nothing.
- Selected provider facts use the narrow owner-scoped `fetchCodingSessionBindings(conversationId)` projection; the diagnostics/connections list is `useCodingSessions`, now keyset-paginated (`loadOlder`/`hasMore`) over `fetchCodingSessions`.
- No API route, Redux slice, or new table. The only DB changes AI Work has ever made are seeded rows: one Saved Requests category (`migrations/mtx_ai_work_saved_requests_category.sql`) and five conversation-analysis mandates (`migrations/agent_slots_conversation_analysis_seed.sql`).

---

## Admin map

`app/(core)/work/admin/page.tsx` declares every AI Work route and owned component through `FeatureAdminPage`. Add every new route or owned component there in the same change.

---

## Data model

AI Work owns no data. `/work/conversations` reads canonical `chat.conversation` through the hand-written `cvx_list_scoped` RPC family (`migrations/cvx_list_scoped.sql`), which laterally joins the newest live `chat.coding_session` for provider / workspace / provider account / `title_source` / fidelity / delivery, and computes `last_activity_at` from the newest visible `chat.message` (never `updated_at` — see the doctrine below). The detail view reads that conversation's owner-scoped bindings; the sync panel reads the caller's own bindings in aggregate. It never reads `chat.coding_session_entry`. Project and Task links write canonical `conversation → project|task` edges; War Room links reuse the War Room mapper for canonical `conversation → war_room` edges. The transcript detail reads `chat.conversation`, user-visible `chat.message`, and `chat.tool_call` rows directly through Supabase RLS — never `chat.coding_session_entry`.

---

## Key flows

### Browse all conversation work

`/work/conversations` → `ConversationsBrowse` → `<EntityListPage config={conversationListConfig}/>` on the canonical shell. The shell owns scope tabs with true server counts, search, the Filters & Sort panel, the column picker, the controlled `MatrxDataTable` and view/density persistence; the feature owns the service triple, the column registry, the row actions and the two controls above the table.

**The default list is honest, not silent.** `conversation_type='subagent'` accounts for ~4,613 rows (30% of the corpus): internal machine runs — batch derivations, sweeps, meta-builder calls. The surface declares `defaultFilters` narrowing to the human-relevant types, so the exclusion is a REAL, visible, clearable entry in the filter bag, and `ConversationAudienceFilter` states the excluded count and switches in one click.

**The query is in the URL.** `config.urlState` puts scope, search, filters, archived, deep, page and sort/direction in the query string; Back/Forward, refresh and a pasted link all reproduce the list. Row titles are real anchors, so cmd-click and middle-click work.

Row click opens the conversation's HOME — a provider mirror's `/work/conversations/[id]` transcript, or `/chat/[id]` for an AI Matrx conversation. The `…` menu is the canonical `buildConversationMenu`, the same one the chat sidebar and every other conversation surface uses.

### See where a conversation's data comes from

`/work/conversations/[conversationId]` → `readProviderConversation` → the transcript for a provider mirror, `MatrxConversationDetail` for an AI Matrx conversation. Both render `ConversationProvenancePanel`, which groups every displayed field by the system that produced it — **From the coding provider** (provider session id, workspace, git branch, provider account, and the provider's title when it supplied one), **From AI Matrx** (our derived title, type, origin, favorite, visibility, KG state, task, timestamps), **From the sync layer** (fidelity, binding state, arrival origin, last delivery, runtime, capabilities, writer lease). A field the source did not report says so in words; nothing is inferred.

### See whether sync is working

`readSyncState()` rolls the caller's `chat.coding_session` rows up per provider account. `/work/connections` renders the full breakdown (`SyncStatePanel`); `/work/conversations` renders the one-line verdict (`SyncStateIndicator`) that doors to it. Same reader, so the two can never disagree.

### Read an agentless provider transcript

`/work/conversations/[conversationId]` → `readProviderConversation()` → direct RLS conversation/message read → generated `MessagePart` validation → `ProviderConversationTranscript`. Text parts render through `RichDocument`; thinking stays private. The client then loads the conversation's `chat.tool_call` rows through the canonical `fetchConversationToolCallsPage` and interleaves them by timestamp (`buildProviderTimeline`); each run renders as canonical `ToolCallVisualization` cards behind a `ToolCallBatch` fold — never a bespoke tool renderer. **Load earlier** pages both streams backward with true totals ("X of Y messages and A of B tool actions"). The header carries `buildConversationMenu` (pin/share/archive/duplicate/KG; rename and delete hidden) plus the organization panel. The detail stays read-only because provider mirrors intentionally have `initial_agent_id = null`; `/chat/[conversationId]` remains the runnable AI Matrx surface for agent-backed conversations only.

### Analyze a conversation

Inbox inspector or transcript → `ConversationAnalyzePanel` → pick one of the five reviewers → `launchAgentExecution({ mandateKey, runtime: { variables: { conversation_id } } })` with `displayMode: "direct"` + `autoRun` → the run floats in `LiveRunWindow` (opened pending, bound via `onConversationCreated`). Works for both AI Matrx chats and provider mirrors — the analyzed conversation is a canonical `chat.conversation` row either way. The result is a normal AI Matrx conversation; the panel renders a persistent `EntityRef` door to it, and it appears in the unified inbox like any other conversation. Launch failures close the window and render the real error inline — never a silent no-op.

### Organize a conversation

Selected conversation → `ConversationOrganizationPanel` → canonical `AssociationList` limited to `project|task|war_room`. Project and Task use `useAssociations`; War Room uses its canonical assignment mapper so container organization resolution and War Room semantics remain in their owning feature. Existing associations resolve titles and render real entity doors; detach is never hidden.

### Inspect connections and sync readiness

`/work/connections` keeps five states separate. Delivered owner-scoped bindings prove client detection and session delivery; per-provider cards group sessions by `providerAccountIdentity` (multiple accounts render as a grouped list with counts and last delivery); the binding does not expose the OAuth grant; the typed backend `GET /coding-sessions/claude/capabilities` drives the **Start a Claude Code session** card — unavailable ⇒ the truthful reason and NO button; available ⇒ a disabled certification-pending button until the managed-launch lane certifies (no fake Resume/launch anywhere). **Historical Claude Code sync is real and lives in Matrx Local** (v1.4.22+, sidebar → Claude History); the card doors to the desktop release download because the `aimatrx://` scheme only handles OAuth callbacks — no pretend deep link, no browser filesystem read. ChatGPT and Claude.ai web-chat history stay honestly unavailable. The page links to `/agent-connections/plugins` for technical diagnostics.

### Reach an existing capability

`/work` → a normal Next.js link → the feature's canonical route. The Hub never proxies data or duplicates a destination's UI.

---

## Invariants & gotchas

- **Only advertise live routes.** Imports, provider launch, and provider automations stay absent until their real execution paths ship. `/work/new` and `/work/requests` shipped 2026-08-15 because their execution path is real.
- **A destination is offered with its REAL reason or not at all.** `destinationAvailability()` is the only place that decides; Claude Code's state comes from the live capability contract, never a guess. Even `available: true` stays UNSELECTABLE until the managed-launch UI is certified (TASK-006) — an enabled button with nothing behind it is the fake Resume this product forbids.
- **The composer executes through the ONE path.** `launchAgentExecution` via `useAgentLauncher`, leaving a canonical conversation with all its normal doors. It never posts to an agent endpoint itself and never renders a stream by hand — the run floats in `LiveRunWindow` (never a spinner, never a block at the top of the page).
- **A Saved Request IS an `agent.shortcut` row**, filed under the seeded `ai-work-saved-requests` category, `enabled_features: []` so it never leaks into shortcut rails. No new table, no new RPC, and the retired `prompts` / `prompt_templates` tables are never candidates. Versioning is the canonical `version` column via `guardedUpdate`; history rides the existing `_history` trigger. The rationale and the rejected alternatives are documented at the top of `compose/savedRequests.ts` — read it before adding any storage here.
- **`version` is machinery, not user copy.** Neither surface shows a version number; the composer says "Saved. Update replaces it." and the list shows a relative updated time.
- **Home picks are applied AFTER the run starts, never faked.** `assoc_add` authorizes against the conversation, which the server creates on turn 1. The composer retries ONLY the not-ready-yet failure and SCREAMS on anything else — a link that could not be written is reported to the user with a door to fix it, never dropped silently.
- **Only registered association pairs are offered as a Home.** Project, Task, and War Room are all live pairs — `conversation → project` was registered 2026-08-16 on Arman's ruling that a conversation may belong DIRECTLY to a project, not only through one of its tasks (resolved D202; `migrations/conversation_project_association_pair.sql`). Never add a picker token without first confirming its row in `platform.association_types` — an unregistered pair is a control that always fails with `23514 Unknown association type`.
- **Analysis agents are mandates, never hardcoded ids.** The five conversation-analysis actions resolve `conversation.*` mandates at click time; swapping an agent is a mandates-console change, no deploy. A raw agent UUID in `features/ai-work` is a defect. Execution goes through `launchAgentExecution` only, and rendering through `LiveRunWindow` only.
- **Codex is not ChatGPT.** No UI labels coding sessions as ChatGPT history.
- **Mirrored is not native.** Fidelity and continuation language come from the existing coding-session verdict; no generic Resume action is allowed.
- **Never route an agentless mirror into runnable chat.** Provider inbox doors use `/work/conversations/[conversationId]`; no fake `initial_agent_id` may be assigned.
- **Exact provider provenance only.** The transcript accepts `source_app` `claude-code|codex|cursor|vscode`. Agent-backed non-provider conversations redirect to runnable chat; other non-provider records return to the provider inbox.
- **A new AI Matrx chat is not a continuation.** The transcript links to `/chat/new` with that exact distinction and does not claim to seed or resume anything.
- **THE HONEST DEFAULT.** The list defaults to human-relevant conversation types and the internal machine runs keep a visible, counted door. Never make that exclusion a hidden SQL predicate, and never let `resetFilters` dump 4,613 subagent rows on the user as if that were "clearing" something. `HUMAN_CONVERSATION_TYPES` / `MACHINE_CONVERSATION_TYPES` in `conversations/types.ts` are the only definition of the split.
- 🚨 **`updated_at` IS NOT ACTIVITY, AND THE TABLE MUST NEVER SAY IT IS.** `chat.conversation.updated_at` is a ROW-MUTATION stamp: a single title-sync pass rewrote 12,103 rows to `2026-08-12 14:42:58` and a second stamped hundreds at `2026-08-16 18:13`, so a "Last activity" column reading `updated_at` told every user their whole corpus happened minutes ago, and sorting by it produced no order at all. The one honest stamp is `last_activity_at`, computed in `cvx_list_scoped` as **GREATEST(newest visible `chat.message.created_at`, the binding's `last_seen_at`, `conversation.created_at`)** — one index probe per surviving row against `cx_message_conversation_recent_idx`, applied AFTER the filters so a page never pays for the corpus. It is the column, the date filter, and the default sort. `updated_at` is still returned and still available as the hidden **"Last modified"** column, because silently redefining a column's meaning is how the next reader gets lied to. Any new "when did this last move" reading anywhere in AI Work uses `last_activity_at`.
- **THE TITLE IS THE TITLE. (Arman, 2026-08-16.)** There is NO provenance chip beside a title in the table. A corpus that is almost entirely Claude Code fired the "Claude Code title" badge on nearly every row, beside an App column reading Claude Code and a Provider column reading Claude Code — triple redundancy paid for out of the title's width. Provenance still ships where it belongs: the optional `title_source` column (filterable) and `ConversationProvenancePanel`.
- **A DERIVED TITLE IS NEVER RENDERED AS THE PROVIDER'S.** `titleProvenance()` is the one decider, and `title_source` absent or `first_prompt` both mean AI Matrx derived it — NULL is not "unknown". It labels the `title_source` column and the provenance panel; it never re-enters the title cell.
- **A pill only where it disambiguates.** `conversation_type` is a sortable, filterable COLUMN, not a per-row badge. A list where every row says the same thing carries no information. (Applied three times now: the Subagent pill, the workspace chip, the Claude Code title chip.)
- **Sync-now states its boundary or does nothing.** Verified 2026-08-16: matrx-local really owns `/coding-session/claude/history/*`, but the browser cannot reach it — the desktop engine is on a locally scanned port (22140+) no web page can discover, and the only web→desktop relay (aidream `/api/local-proxy/{id}/{path}`) hard-rewrites to `{tunnel_url}/sandbox/{path}`. So the button says exactly that and opens the desktop app. Wiring a real one means an aidream relay for the `/coding-session/*` router (and authenticating those routes, which today have no guard) — that is TASK-007, not a UI change.
- **One conversation store.** The table's RPC and the binding reads are projections, not a second list/cache; the technical `useCodingSessions` path remains unchanged, and the canonical `conversationHistory` slice still serves the chat sidebar.
- **One canonical conversation.** Open, share, fork, pin, archive, knowledge-graph state, and task association act on `conversation_id`, not the provider binding.
- **Old routes remain valid.** `/agent-connections/plugins`, chat, skills, projects, tasks, War Rooms, and schedules remain canonical feature doors.
- **Five connection states stay separate.** Account identity, authorization grant, client detection, session delivery, and last historical sync never infer one another.
- 🚨 **A SILENT BRIDGE MUST BE LOUD. Capture stops with no error anywhere.** Claude Code delivers every hook through the plugin's already-connected MCP session, an MCP hook can never initiate OAuth, and Claude treats a hook failure as **non-blocking** — so a dropped connection or lapsed authorization stops mirroring FOREVER, silently, and only the user running `/mcp` can restore it. On 2026-08-16 that produced a 23.5-hour outage nothing surfaced; the owner noticed because timestamps looked wrong. **An empty inbox must never be indistinguishable from a quiet day.** `captureGapVerdict()` (`features/agent-connections/coding-sessions/captureGap.ts`) is THE one decider, mounted on `/work/conversations`, `/work/connections`, and `/agent-connections/plugins` — never add a second staleness rule.
- **Never make a present-tense claim a stale timestamp cannot support.** `freshnessOf()`'s `live` label is the word "Delivering"; its window was 24 hours, so the dead bridge above rendered a green *Delivering* pill throughout the outage. It is now one hour. Any badge asserting that something is happening NOW gets a window that means now — and it must agree with the capture-gap verdict rather than contradict it.
- **Silence is graded against the owner's OWN history, never a fixed timeout.** Arman genuinely does not code some hours: his real quiet periods ran to 31.5h, and the outage gap (23.5h) sat INSIDE that envelope — so "longer than ever seen" would have stayed silent, and a flat 6h threshold would cry wolf every weekend. The verdict calibrates on gaps between consecutive deliveries already loaded by `useCodingSessions` (no extra query), renders NOTHING for healthy/quiet, and states its own uncertainty in the `suspect` copy ("could still be a genuine break — AI Matrx cannot tell the difference from here"). Being noisy here is as bad as being silent.
- **The mirror is its own only sensor — say so, never infer a cause.** From the browser we can observe that nothing arrived; we can NOT observe whether the user was coding. No capture-gap copy may assert that the connection dropped. The one signal that would disambiguate is out-of-band (Matrx Local already reads Claude's local transcripts) — see the handoff, and do not fake it here.
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

Compose and Saved Requests shipped 2026-08-15 (TASK-005). Open work, in the plan's own order:

- **Certified provider execution (TASK-006).** The composer's destination mandate exists and is gated; wiring a real managed-Claude start/stream/cancel is Lane 5's job, and no destination becomes selectable before that pass.
- **Automations.** `/work/automations` is absent. The composer's Timing step hands off to the EXISTING schedule builder at `/schedules/new` with the agent and request prefilled; it does not create a schedule itself, and a workflow handoff has no door yet.
- **Attribution.** Composer runs stamp `sourceFeature: "chat"` because `SOURCE_FEATURES` (generated from aidream) has no `ai-work` value. Registering one is an aidream change; until then the composer must NOT invent a string.
- **Saved Request scope.** Mine only. Sharing one, or scoping it to an org, needs the list-scope RPCs the canonical entity-list shell expects — not built.
- Grant identity and one-click reconnect (TASK-008) remain backend/client work.

---

## Change log

- `2026-08-16` — Claude: **three things that blocked using `/work/conversations` for real work.** (1) **"Last activity" was a lie.** It read `updated_at`, a row-mutation stamp: a title-sync pass had rewritten 12,103 rows to one second, so every row said "4 hours ago" and sorting by it produced an arbitrary order (measured before/after on the live DB — the old top-of-list was ten rows stamped `2026-08-16 18:13:1x` whose real activity ranged from `2026-05-16` to `2026-08-11`). `cvx_list_scoped` now returns `last_activity_at` = GREATEST(newest visible message, binding `last_seen_at`, `created_at`), backed by a new partial index `cx_message_conversation_recent_idx` (`migrations/cvx_message_recent_idx.sql`) and computed after the filters; it is in the sort whitelist, is the DEFAULT sort, and owns the column and its date filter (page ~103ms, unchanged in shape). `updated_at` survives as the hidden **"Last modified"** column. Because sort is a persisted preference, a surface that declares its own default sort now retires a stale-shape blob's sort (`lib/list-views/defaults.ts` + tests) — otherwise every existing user would have kept the broken order after the fix shipped. (2) **The star column wasted ~40px of every row.** Fixed at the primitive, not here: `MatrxColumnDef.compact` collapses an icon column's three header controls (sort button, sort arrow, filter funnel) into ONE popover trigger carrying the same Sort ascending / descending / Clear sort / filter body, and tightens cell padding to `px-1`. Sortable and filterable are unchanged; active sort/filter render as a marker on the trigger. Measured 66px → **26px** here and 106px → 52px on `/agents/all`, which was converted in the same pass. (3) **Removed the "Claude Code title" chip** from the title cell (Arman: *"The title is the title."*) — it fired on nearly every row beside two columns already saying Claude Code. Provenance stays on the optional `title_source` column and the provenance panel.
- `2026-08-16` — Claude: **P0 — capture stopped for 23.5 hours and nothing said so.** Built the detection and the loud recovery. New `captureGapVerdict()` / `quietProfile()` (`features/agent-connections/coding-sessions/captureGap.ts`) grade the gap since the last delivery against the owner's own delivery cadence and return one of healthy / quiet / suspect / stopped / never / unknown; `<CaptureGapAlert>` renders only the last four, and is mounted on `/work/conversations` (the `notice` mandate), `/work/connections` (above every platform card), and `/agent-connections/plugins` (above the old passive status card). Calibrated on the real production series — the outage gap sat inside the longest recorded quiet period, so the tests encode that exact shape. Also fixed the contributing lie: `freshnessOf()`'s `live` window was 24h behind the present-tense label "Delivering", so the dead bridge showed a green *Delivering* pill for the whole outage; it is now 1h. Verified end-to-end against the live DB with a seeded 23.5h-gap fixture on the test account (alarm fired with the correct calibrated copy; fixture removed afterwards). Plugin half: `/matrx:health` could not detect this failure at all — it called the bridge's `health` action without `provider_session_id`, which is the only way that action resolves a session, so its answer was identical whether capture worked or had been dead a day; it now reads the attach receipt the bridge already injects into the model's context on every successful `UserPromptSubmit`.
- `2026-08-16` — Claude: **rebuilt `/work/conversations` on the canonical shell** (Arman's ruling: fix the conversation-surface basics first). (1) The default list is now human-relevant — the ~4,613 `conversation_type='subagent'` internal machine runs are excluded by a REAL, visible, clearable filter with a counted one-click door (`ConversationAudienceFilter`), and the per-row "Subagent" pill is gone. (2) The split-pane inbox is replaced by `<EntityListPage>` on `lib/entity-list` with a new hand-written RPC family (`cvx_list_scoped` / `cvx_list_scope_counts` / `cvx_list_facets`, `migrations/cvx_list_scoped.sql`, applied + ledgered): 19 columns that all sort AND filter server-side, true scope counts, favorites, inline title edit, the canonical conversation menu. (3) Scope, search, filters, archived, deep, page and sort now live in the URL through the canonical `lib/url-state` primitive — deep-link, refresh and Back/Forward work, and titles are real anchors. (4) `/work/conversations/[id]` serves EVERY conversation (it used to redirect non-mirrors to `/chat`, making this surface unreachable for ~92% of the corpus) and both halves render `ConversationProvenancePanel`, which groups every field by its producing system and states `title_source` beside the title. (5) `readSyncState()` surfaces per-account sync facts as a panel on `/work/connections` and a one-line indicator on `/work/conversations`; **Sync now** states the exact, verified reason the web app cannot invoke the desktop importer and doors to Matrx Local. Generic work landed in `lib/entity-list` (`urlState`, `defaultFilters`, facet-value formatters, a controller-aware `notice` mandate) — see its FEATURE.md. Deleted `AiWorkConversationsInbox`.
- `2026-08-16` — Claude: resolved D202 on Arman's ruling — a conversation may belong DIRECTLY to a project. Registered `conversation → project` in `platform.association_types` (`container_side='target'`, `conveys_max='editor'`, matching all 15 other `* → project` pairs; `migrations/conversation_project_association_pair.sql`, applied + ledgered) and restored `project` to the composer Home step (`HOME_TOKENS`, `WorkHomeToken`, `HOME_TOKEN_SET`). The Project control on `/work/conversations` and on the provider transcript now writes a real edge instead of raising `23514`; verified live by running `assoc_add`/`assoc_remove` as the authenticated owner. This also unblocks the server's existing project-context restore, which already reads these edges (`features/agents/FEATURE.md` 2026-07-27).
- `2026-08-16` — Claude: shipped the "Analyze this conversation" action group (`analysis/catalog.ts` + `analysis/ConversationAnalyzePanel.tsx`) on the inbox inspector and the provider transcript. Five plain-language analysis actions over the new conversation-analysis agents, each behind a seeded floating mandate (`agent_slots_conversation_analysis_seed.sql`, applied + ledgered), launched via `launchAgentExecution` with `conversation_id` as a runtime variable, streamed in the floating `LiveRunWindow`, with a persistent door to each finished report conversation. No new table, endpoint, store, or renderer.
- `2026-08-15` — Claude: shipped `/work/new` (the eight-step composer, real AI Matrx execution through `launchAgentExecution`, floating `LiveRunWindow`, canonical skill/resource/context/association pickers reused verbatim, provider destinations gated on the live capability contract) and `/work/requests` (Saved Requests as `agent.shortcut` rows under one seeded category — no new table). Extracted the managed-Claude capability read into the shared `lib/managedClaudeCapability.ts` now consumed by both `/work/connections` and the composer. Filed D202: `conversation → project` is not a registered association type, which also breaks the shipped inspector's Project picker.
- `2026-08-12` — Claude: surfaced the bridge's new `workspace_name` provenance (tolerant `workspaceName()` reader): workspace chips on the inbox inspector, transcript header (owner-scoped binding read), and technical session rows (+ search match), plus per-provider "Workspaces (N)" groupings on `/work/connections`. Verified the backfilled real conversation titles render across the inbox/transcript (they read canonical `chat.conversation.title`, so no frontend change was needed).
- `2026-08-12` — Claude: transcript backward pagination + interleaved `chat.tool_call` activity via canonical tool components (honesty-floor merge in `lib/providerTimeline.ts`); canonical conversation menu + organization panel on the transcript; tolerant `providerAccountIdentity` reader (prefers `provider_account_label`) with account chips/grouping on the inbox inspector and connections cards; capability-gated "Start a Claude Code session" card; honest Matrx Local Claude-history door; keyset pagination for `fetchCodingSessions`/`useCodingSessions` (PluginsSection "Load older sessions").
- `2026-08-12` — Codex: replaced the provider-only 100-row product inbox with the canonical all-conversation history and real range pagination; added selected provider/account/fidelity/state facts, direct Project/Task/War Room organization through existing association primitives, `/work/connections`, and a typed managed-Claude capability check. Historical sync is explicitly unavailable until the real Matrx Local preview/import/status seam lands; technical `/agent-connections/plugins` remains intact.
- `2026-08-11` — Codex: added `/work/conversations/[conversationId]` so agentless Claude Code mirrors open a real read-only transcript instead of redirecting through runnable chat; reused generated message validation, `RichDocument`, `AccessGate`, and task attachment.
- `2026-08-11` — Codex: shipped `/work`, `/work/conversations`, the primary-navigation door, truthful live-capability directory, reused provider inbox, and conversation-to-task attachment.
