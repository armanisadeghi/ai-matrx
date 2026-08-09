# Agent Slots — client half (resolution + the user/org override surface)

**Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md` — read it before touching agent slots in ANY repo.** Admin pin management lives in `features/admin/agent-slots/` (`/administration/agents/slots`). This folder is the USER-facing half.

## What lives here

| File | Role |
|---|---|
| `service.ts` | `resolveAgentSlot(slotKey)` — client-side resolution for slots whose consumer runs in this repo (system default → caller's own user binding; org layer is deliberately server-only). Floating-only; loud on unknown/disabled/version-pinned slots. 5-min cache + `invalidateClientSlotCache` (+ `onSlotCacheInvalidated` subscriber events — how mounted consumers refresh after a binding write). |
| `service.server.ts` | `resolveAgentSlotServer(slotKey)` — the SSR twin for Server Components that must know a slot's agent before first paint (`/chat/new`, the cx-chat demo pages). Same precedence + loud posture, request-scoped (no cache). Shares the `config_overrides` narrowing with the client via `llm-params.ts` so the two can never drift. |
| `useAgentSlot.ts` | React hook over `resolveAgentSlot` — `error` set means the consumer disables its affordance; never a hardcoded fallback id. Re-resolves automatically on cache invalidation. |
| `service.ts` → `fetchSlotPins(slotKeys)` | Batch read of slots' SYSTEM DEFAULT pins (master + pinned version + use_latest) for display/fork surfaces — NOT a run path, so version pins are fine here and no binding layer applies. Consumer: research's `useResearchAgentRoles` (the agent-roles page reads DB-truth pins instead of the hardcoded UUID maps that drifted on all 7 roles). |
| `overrides.ts` | The override surface's data layer. READS ride RLS (fetch slots + visible bindings + referenced agent names; `fetchSlotPickerData` for one slot). **WRITES ride the ONE bind path: aidream `PUT/DELETE /agent-slots/{slot_key}/binding`** (`putSlotBinding` / `removeSlotBinding` via `callApi`; org principals pass `organization_id` explicitly, user principals let callApi inject the ambient org — incidental there). `parseSlotContract` + `checkSlotContract` (the research-proven superset rule) are the instant client pre-flight; the server's bind-time check is the authority and its 422 detail is shown VERBATIM. Writes invalidate the resolution cache. |
| `components/SlotOverridesPage.tsx` | `/agents/slots` — browse every live (non-placeholder) slot grouped by domain, resolved agent with provenance pill (Your override / Org override / System default, user > org > system), expand → `SlotOverridePanel`. |
| `components/SlotOverridePanel.tsx` | Principal chips (Me + orgs I admin) around the editor — the ONE binding-editor composition, embedded by both `/agents/slots` and the admin console's slot detail. |
| `components/SlotOverrideEditor.tsx` | Per-principal editor: swap agent (SearchableAgentSelect over owned + shared agents, contract-checked, blocked on missing inputs), settings-only overrides (model via SmartModelSelect + thinking level), Copy default & customize (fork via `agx_duplicate_*`, opens builder), remove via ConfirmDialog. Remount-keyed by principal + binding — no state-sync effect. |
| `useSlotRunner.ts` | **The consumer primitive** — `useAgentSlot` + `useRunAgent` in one: `runSlot(args)` runs the slot's agent, `unavailable`/`slotError` drive the disabled state. Migrating a hardcoded call site is two lines (`run({agentId: X_AGENT_ID, …})` → `runSlot({…})`). Resolves at CALL time so a binding saved seconds ago applies to the next run; the slot's `config_overrides` (the user's binding) win per key over the feature's defaults. |
| `components/SlotAgentPicker.tsx` | The reusable consumer-facing "which agent runs this step" control — compact popover: system default + the user's own/shared agents, save-on-pick, reset-to-default, link to `/agents/slots`. First consumer: podcast topic ideas (`TopicIdeaHelper`, slot `podcast_client.topic_ideas`). Drop it beside any slot-resolved affordance. |

Route: `app/(core)/agents/slots/page.tsx` (+ `SlotsHeader` in the shell header center).

## Invariants

- **User bindings key on the USER** (`principal_type='user'`, `subject_user_id`); `organization_id` on those rows is trigger-stamped and incidental. Org bindings pass the target org explicitly and are editable only by that org's admins/owners (RLS enforces; the UI offers org tabs only for admin/owner orgs).
- **Swaps are floating-only** (`agent_id` + `use_latest`) — the client run path has no version channel; version pinning is the admin console's business.
- **Settings editor patches only `model` + `thinking_level`** and preserves unknown `config_overrides` keys it doesn't own.
- Agent options come from the canonical Redux listing (`fetchAgentsListFull` + `selectOwnedAgents`/`selectSharedWithMeAgents`) — never a raw table query (ESLint `matrx/no-raw-agent-list-query`).
- **One write path.** Bindings are written ONLY through the aidream bind endpoint (`PUT/DELETE /agent-slots/{slot_key}/binding`) — a supabase `.insert()/.update()` on `agent.slot_binding` from this repo is a defect (it skips bind-time contract enforcement: required variables/context slots superset + the candidate's `output_schema` must carry the slot's required output keys). The server is the authority; `checkSlotContract` is only the instant client pre-flight; the 422 detail is the contract verdict — surface it verbatim. Refresh the generated API types whenever the endpoint changes.

## Migrating a hardcoded call site (the sweep)

`agent.slot_definition` rows carrying `metadata.migration_status='placeholder'` are call sites that still run a hardcoded id; `metadata.code_ref` names the exact constant. That query IS the worklist:

```sql
select slot_key, metadata->>'code_ref' from agent.slot_definition
where deleted_at is null and metadata->>'migration_status' = 'placeholder'
  and metadata->>'side' = 'client';
```

Recipe: React run site → `useSlotRunner`; React non-run site (a `defaultAgentId` prop, an on-click launch) → `useAgentSlot` + gate the affordance on resolution; thunk/handler → `await resolveAgentSlot`. Drop `<SlotAgentPicker>` wherever the user should be able to choose. Then move the slot from aidream's `scripts/seed_slot_placeholders.py` into a real `declare_slot(...)` in `aidream/services/agent_slots/client_slots.py` and release — `sync_declared_slots` pops the placeholder marker, so the DB stops claiming the hardcoded path still runs.

**Migrated:** research Outputs Studio (3), content-plan setup (7), kind architect, kind creator (twin collapsed to one floating slot), agent-app coding agent, flashcards spoken-front TTS, War Room (3), chat defaults (`chat.default_new_chat` + `chat.cx_default`), `projects.create_assistant`. **Remaining: NONE — the client placeholder worklist is empty** (the query above returns zero rows; `prompts.categorizer` was deleted as a dead pin). A new hardcoded agent id is a new placeholder to seed + migrate, not a precedent.

**When the call site PERSISTS the agent id** (War Room is the worked reference): the slot decides only what a NEW record is CREATED with. A stored id — an association edge's `metadata.agentId`, a localStorage roster keyed by agent — always wins on rebind, so repinning can neither rewrite nor orphan existing rows, and a migration of legacy state stamps the agent it was born under, never today's resolution. Gate the MINT affordance on resolution (disabled + the message) and let already-persisted records bind without the slot. **Surface manifests** (`war-room*.manifest.ts`) keep a hardcoded `agentRoles[].defaultAgentId`: a manifest is static module-scope data seeded into `ui_surface_agent_role` and cannot resolve a slot — the ruling is that it stays a documented SEED MIRROR of the slot's system default, not a second authority (nothing reads it at run time).

**Known gap:** `launchAgentExecution` consumers (content-plan) apply the slot's AGENT but not its `config_overrides` — that path carries model overrides through the instance-model-overrides slice, not a call arg. A settings-only binding is therefore inert there today.

## Change Log

- 2026-08-09 — Client placeholder sweep FINISHED (zero placeholders remain). `chat.default_new_chat` (the most-used swap in the product) migrated across every runtime consumer: `/chat/new` resolves at SSR via the new `service.server.ts` (`resolveAgentSlotServer`, sharing `llm-params.ts` narrowing with the client), `beginFreshChat` resolves at call time, QuickChatSheet / RAG Agent Chat gate on `useAgentSlot`, `openChatWindow` + the tools-grid Chat tile resolve at open time (tile `seedData` may now be async; activation awaits it), and the agentRunWindow registry default went to `null` (static data can't resolve a slot — failure degrades to the window's agent picker, never a hardcoded id). `chat.cx_default` (demo SSR, loud seed-mirror fallback), `projects.create_assistant` (ProjectCreatePanel gates the AI tab on resolution), and `content_ir.kind_creator` (twin collapsed: repinned floating on the master; NewShapeClient/KindAgentButton/KindComponentFixBadge/assists/Surprise-me-UI all resolve the slot) landed in the same pass. `prompts.categorizer` deleted (dead pin — `categorize_prompt` is retired). Remaining seed-mirror constants (`DEFAULT_NEW_CHAT_AGENT_ID`, cx-chat `DEFAULT_AGENT_ID`s, `PROJECT_CREATE_AGENT_ID`) are documented as such; new reads of them are defects.

- 2026-08-08 — War Room's three tier personas migrated (`war_room.thread` / `war_room.room` / `war_room.master`), the first call sites that PERSIST the resolved id. Added the persisted-id rule above (stored id wins on rebind; slot governs creation only), the manifest seed-mirror ruling, and `useDurableAgentConversation` now idles on a null `defaultAgentId` rather than minting under a guess.
- 2026-08-08 — `useSlotRunner` added (the two-line consumer primitive) and the first migration wave landed: research Outputs Studio (per-card `SlotAgentPicker`, blog card consolidated onto `OutputCardShell`), content-plan setup's 7 agents, kind architect, agent-app coding agent, flashcards TTS — 13 hardcoded agent ids deleted and declared in aidream `client_slots.py`.
- 2026-08-08 — Binding writes rewired from direct RLS to the aidream bind endpoint (bind-time contract enforcement live; the "client-side only" gap is closed). Added `SlotOverridePanel` (shared with the admin console, which is now editable) and `SlotAgentPicker` (first consumer: podcast topic ideas). `useAgentSlot` auto-refreshes on binding writes.
- 2026-08-08 — Created the user/org override surface (`/agents/slots`): browse + provenance + create/edit/delete bindings (agent swap and settings-only), client-side contract gate, org-admin tabs. Live-verified CRUD on a real user binding.
- 2026-08-08 — Synced the live binding API contract and normalized optional JSON object members before preserving an existing binding's `config_overrides`, keeping the strict API payload free of `undefined` values.
