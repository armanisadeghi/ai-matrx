# Agent Slots — client half (resolution + the user/org override surface)

**Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md` — read it before touching agent slots in ANY repo.** Admin pin management lives in `features/admin/agent-slots/` (`/administration/agents/slots`). This folder is the USER-facing half.

## What lives here

| File | Role |
|---|---|
| `service.ts` | `resolveAgentSlot(slotKey)` — client-side resolution for slots whose consumer runs in this repo (system default → caller's own user binding; org layer is deliberately server-only). Floating-only; loud on unknown/disabled/version-pinned slots. 5-min cache + `invalidateClientSlotCache` (+ `onSlotCacheInvalidated` subscriber events — how mounted consumers refresh after a binding write). |
| `useAgentSlot.ts` | React hook over `resolveAgentSlot` — `error` set means the consumer disables its affordance; never a hardcoded fallback id. Re-resolves automatically on cache invalidation. |
| `service.ts` → `fetchSlotPins(slotKeys)` | Batch read of slots' SYSTEM DEFAULT pins (master + pinned version + use_latest) for display/fork surfaces — NOT a run path, so version pins are fine here and no binding layer applies. Consumer: research's `useResearchAgentRoles` (the agent-roles page reads DB-truth pins instead of the hardcoded UUID maps that drifted on all 7 roles). |
| `overrides.ts` | The override surface's data layer. READS ride RLS (fetch slots + visible bindings + referenced agent names; `fetchSlotPickerData` for one slot). **WRITES ride the ONE bind path: aidream `PUT/DELETE /agent-slots/{slot_key}/binding`** (`putSlotBinding` / `removeSlotBinding` via `callApi`; org principals pass `organization_id` explicitly, user principals let callApi inject the ambient org — incidental there). `parseSlotContract` + `checkSlotContract` (the research-proven superset rule) are the instant client pre-flight; the server's bind-time check is the authority and its 422 detail is shown VERBATIM. Writes invalidate the resolution cache. |
| `components/SlotOverridesPage.tsx` | `/agents/slots` — browse every live (non-placeholder) slot grouped by domain, resolved agent with provenance pill (Your override / Org override / System default, user > org > system), expand → `SlotOverridePanel`. |
| `components/SlotOverridePanel.tsx` | Principal chips (Me + orgs I admin) around the editor — the ONE binding-editor composition, embedded by both `/agents/slots` and the admin console's slot detail. |
| `components/SlotOverrideEditor.tsx` | Per-principal editor: swap agent (SearchableAgentSelect over owned + shared agents, contract-checked, blocked on missing inputs), settings-only overrides (model via SmartModelSelect + thinking level), Copy default & customize (fork via `agx_duplicate_*`, opens builder), remove via ConfirmDialog. Remount-keyed by principal + binding — no state-sync effect. |
| `components/SlotAgentPicker.tsx` | The reusable consumer-facing "which agent runs this step" control — compact popover: system default + the user's own/shared agents, save-on-pick, reset-to-default, link to `/agents/slots`. First consumer: podcast topic ideas (`TopicIdeaHelper`, slot `podcast_client.topic_ideas`). Drop it beside any slot-resolved affordance. |

Route: `app/(core)/agents/slots/page.tsx` (+ `SlotsHeader` in the shell header center).

## Invariants

- **User bindings key on the USER** (`principal_type='user'`, `subject_user_id`); `organization_id` on those rows is trigger-stamped and incidental. Org bindings pass the target org explicitly and are editable only by that org's admins/owners (RLS enforces; the UI offers org tabs only for admin/owner orgs).
- **Swaps are floating-only** (`agent_id` + `use_latest`) — the client run path has no version channel; version pinning is the admin console's business.
- **Settings editor patches only `model` + `thinking_level`** and preserves unknown `config_overrides` keys it doesn't own.
- Agent options come from the canonical Redux listing (`fetchAgentsListFull` + `selectOwnedAgents`/`selectSharedWithMeAgents`) — never a raw table query (ESLint `matrx/no-raw-agent-list-query`).
- **One write path.** Bindings are written ONLY through the aidream bind endpoint (`PUT/DELETE /agent-slots/{slot_key}/binding`) — a supabase `.insert()/.update()` on `agent.slot_binding` from this repo is a defect (it skips bind-time contract enforcement: required variables/context slots superset + the candidate's `output_schema` must carry the slot's required output keys). The server is the authority; `checkSlotContract` is only the instant client pre-flight; the 422 detail is the contract verdict — surface it verbatim. Refresh the generated API types whenever the endpoint changes.

## Change Log

- 2026-08-08 — Binding writes rewired from direct RLS to the aidream bind endpoint (bind-time contract enforcement live; the "client-side only" gap is closed). Added `SlotOverridePanel` (shared with the admin console, which is now editable) and `SlotAgentPicker` (first consumer: podcast topic ideas). `useAgentSlot` auto-refreshes on binding writes.
- 2026-08-08 — Created the user/org override surface (`/agents/slots`): browse + provenance + create/edit/delete bindings (agent swap and settings-only), client-side contract gate, org-admin tabs. Live-verified CRUD on a real user binding.
- 2026-08-08 — Synced the live binding API contract and normalized optional JSON object members before preserving an existing binding's `config_overrides`, keeping the strict API payload free of `undefined` values.
