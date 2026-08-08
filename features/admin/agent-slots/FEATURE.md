# Agent Slots admin console

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md` — read it before touching this feature in ANY repo.

Route: `/administration/agents/slots` (`app/(admin)/administration/agents/slots/page.tsx`). Code: `service.ts` (direct supabase reads/writes on `agent.slot_definition` / `agent.slot_binding`; super-admin writes ride RLS via `has_access` editor on system-org rows — no bespoke RPC) + `AgentSlotsConsole.tsx`.

## The two laws (Arman's ruling, 2026-08-08 — violations are defects, fix on sight)

1. **THE SYSTEM-AGENT LAW.** A slot DEFAULT may only reference a **system agent** (`agent_type='builtin'`, system-org owned, no user). A personal/shared/org agent pinned as a slot default breaks every user the slot serves — it fails the moment ownership, visibility, or archival shifts, and it fails on some page far from where it was pinned. The console picker therefore offers ONLY system agents; any row whose default drifts to a non-builtin shows a destructive **"NOT a system agent — fix this pin"** badge; aidream's `sync_declared_slots` screams the same on every boot. Promote an agent to system via `agx_duplicate_agent(p_as_system => true)`, then pin the promoted copy. (User/org OVERRIDE bindings are the opposite case — those are *supposed* to be the principal's own agents.)
2. **THE CANONICAL-SELECTION LAW.** Anywhere agents are listed for selection, use the canonical agent listing system — the Redux agent-definition slice (`fetchAgentsListFull` + the purpose-fit selector: `selectBuiltinAgents` here, `selectActiveAgents` for user-facing pickers) or the scoped server RPCs (`agx_list_scoped` with true scopes). **A raw `.from("definition")` query dumped alphabetically is the recurring disease this repo keeps re-catching**: it blends mine/shared/org/public/system into one meaningless list, ignores scopes, and treats an administrator like a user. Never write one. The console consumed exactly this bug at birth (fixed 2026-08-08, same day).

## Change Log

- 2026-08-07 — Created: slot list, pin-vs-latest drift badges, repin editor, enable toggle, override display.
- 2026-08-08 — Picker rewired from a raw `agent.definition` query to `selectBuiltinAgents` (system agents only); non-system-pin badge added; both laws documented here + in the SoR; aidream sync gained the boot-time scream.
- 2026-08-08 — Repo-wide eradication sweep completed: research admin wiring/templates rewired to `selectBuiltinAgents`, org agents page to `agx_list_scoped`, global shortcuts gated to system agents; ESLint `matrx/no-raw-agent-list-query` (error) now bans raw `agent.definition` list queries outside the canonical services.
