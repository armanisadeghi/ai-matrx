# Agent Slots — client half (resolution + the user/org override surface)

**Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md` — read it before touching agent slots in ANY repo.** Admin pin management lives in `features/admin/agent-slots/` (`/administration/agents/slots`). This folder is the USER-facing half.

## What lives here

| File | Role |
|---|---|
| `service.ts` | `resolveAgentSlot(slotKey)` — client-side resolution for slots whose consumer runs in this repo (system default → caller's own user binding; org layer is deliberately server-only). Floating-only; loud on unknown/disabled/version-pinned slots. 5-min cache + `invalidateClientSlotCache`. |
| `useAgentSlot.ts` | React hook over `resolveAgentSlot` — `error` set means the consumer disables its affordance; never a hardcoded fallback id. |
| `overrides.ts` | The override surface's data layer: fetch slots + visible bindings + referenced agent names; create/update/soft-delete `agent.slot_binding` (user or org principal) via RLS; `parseSlotContract` + `checkSlotContract` (the research-proven superset rule against the slot's stored `contract`). Writes invalidate the resolution cache. |
| `components/SlotOverridesPage.tsx` | `/agents/slots` — browse every live (non-placeholder) slot grouped by domain, resolved agent with provenance pill (Your override / Org override / System default, user > org > system), expand → editor. |
| `components/SlotOverrideEditor.tsx` | Per-principal editor: swap agent (SearchableAgentSelect over owned + shared agents, contract-checked, blocked on missing inputs), settings-only overrides (model via SmartModelSelect + thinking level), Copy default & customize (fork via `agx_duplicate_*`, opens builder), remove via ConfirmDialog. Remount-keyed by principal + binding — no state-sync effect. |

Route: `app/(core)/agents/slots/page.tsx` (+ `SlotsHeader` in the shell header center).

## Invariants

- **User bindings key on the USER** (`principal_type='user'`, `subject_user_id`); `organization_id` on those rows is trigger-stamped and incidental. Org bindings pass the target org explicitly and are editable only by that org's admins/owners (RLS enforces; the UI offers org tabs only for admin/owner orgs).
- **Swaps are floating-only** (`agent_id` + `use_latest`) — the client run path has no version channel; version pinning is the admin console's business.
- **Settings editor patches only `model` + `thinking_level`** and preserves unknown `config_overrides` keys it doesn't own.
- Agent options come from the canonical Redux listing (`fetchAgentsListFull` + `selectOwnedAgents`/`selectSharedWithMeAgents`) — never a raw table query (ESLint `matrx/no-raw-agent-list-query`).

## 🚨 Known gap — bind-time contract enforcement is CLIENT-side only

The aidream bind endpoint (server-side contract + `output_kind` schema enforcement at write time) is **not live** — aidream exposes only `POST /agent-slots/{slot_key}/test`. Until it ships (aidream `docs/handoffs/content-ir-agent-slots.md` item 4), `checkSlotContract` is the only gate: a client bypassing this UI can write a non-conforming binding, which the runtime then drops loudly at resolution (broken-override failover). When the endpoint lands, route creates/updates through it and keep the client check as instant pre-flight.

## Change Log

- 2026-08-08 — Created the user/org override surface (`/agents/slots`): browse + provenance + create/edit/delete bindings (agent swap and settings-only), client-side contract gate, org-admin tabs. Live-verified CRUD on a real user binding.
