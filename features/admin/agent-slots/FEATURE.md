# Agent Slots admin console

Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md` — read it before touching this feature in ANY repo.

Route: `/administration/agents/slots` (`app/(admin)/administration/agents/slots/page.tsx`). Code: `service.ts` (direct supabase reads/writes on `agent.slot_definition` / `agent.slot_binding`; super-admin writes ride RLS via `has_access` editor on system-org rows — no bespoke RPC) + `AgentSlotsConsole.tsx`.

## The two laws (Arman's ruling, 2026-08-08 — violations are defects, fix on sight)

1. **THE SYSTEM-AGENT LAW.** A slot DEFAULT may only reference a **system agent** (`agent_type='builtin'`, system-org owned, no user). A personal/shared/org agent pinned as a slot default breaks every user the slot serves — it fails the moment ownership, visibility, or archival shifts, and it fails on some page far from where it was pinned. The console picker therefore offers ONLY system agents; any row whose default drifts to a non-builtin shows a destructive **"NOT a system agent — fix this pin"** badge; aidream's `sync_declared_slots` screams the same on every boot. Promote an agent to system via `agx_duplicate_agent(p_as_system => true)`, then pin the promoted copy. (User/org OVERRIDE bindings are the opposite case — those are *supposed* to be the principal's own agents.)
2. **THE CANONICAL-SELECTION LAW.** Anywhere agents are listed for selection, use the canonical agent listing system — the Redux agent-definition slice (`fetchAgentsListFull` + the purpose-fit selector: `selectBuiltinAgents` here, `selectActiveAgents` for user-facing pickers) or the scoped server RPCs (`agx_list_scoped` with true scopes). **A raw `.from("definition")` query dumped alphabetically is the recurring disease this repo keeps re-catching**: it blends mine/shared/org/public/system into one meaningless list, ignores scopes, and treats an administrator like a user. Never write one. The console consumed exactly this bug at birth (fixed 2026-08-08, same day).

## Test bench (2026-08-08)

"Latest is not always better." Every slot holds **exemplars** (`agent.slot_exemplar`): real inputs+outputs auto-captured from production runs (up to 3 per slot, size-capped, in `run_slot`) or hand-authored/manual. The bench (`SlotTestBench.tsx`) runs a CANDIDATE — different system agent, pinned version, or just `config_overrides` — against an exemplar's stored inputs via aidream `POST /agent-slots/{slot_key}/test` (super-admin gated; one call per exemplar so runs parallelize), then renders reference vs candidate side by side with a **content-IR structural verdict** (`output_kind` schema + required keys — the same checker the workflow engine uses) plus model/duration. Image outputs render via `InlineMediaRef` (file_id recovered with `fileIdFromUserFilesUrl` — never a raw expiring URL). A test run is `system_run` and writes nothing.

## Console shape (2026-08-08 rebuild)

The list is the canonical `MatrxDataTable` (`components/official/matrx-data-table`) — every column sorts + filters, global search, Copy/Copy-for-AI (row + this view), pagination, UUID cell on `id`. Derived `SlotRow` adds a filterable **Health** column (`ok` / `version drift` / `agent archived` / `not a system agent` — worst-first). Row click → side-panel workbench (`SlotDetail`): pin editor + test bench + overrides; the WindowPanel Edit tab reuses the same body. `SlotEditor`/`SlotTestBench` seed local state from props, so `SlotDetail` keys them by slot id — dropping the key regresses to stale cross-slot state (bug found 2026-08-08).

## Change Log

- 2026-08-08 — Console rebuilt on MatrxDataTable (was a hand-rolled `<table>` with no sort/filter/copy); expanded-row editor moved to the side-panel/window workbench; per-slot remount keys added.
- 2026-08-07 — Created: slot list, pin-vs-latest drift badges, repin editor, enable toggle, override display.
- 2026-08-08 — Picker rewired from a raw `agent.definition` query to `selectBuiltinAgents` (system agents only); non-system-pin badge added; both laws documented here + in the SoR; aidream sync gained the boot-time scream.
- 2026-08-08 — Test bench shipped: slot_exemplar table + auto-capture + candidate test endpoint + side-by-side console UI; run_slot now structurally validates output_kind (loud, non-fatal).
- 2026-08-08 — Repo-wide eradication sweep completed: research admin wiring/templates rewired to `selectBuiltinAgents`, org agents page to `agx_list_scoped`, global shortcuts gated to system agents; ESLint `matrx/no-raw-agent-list-query` (error) now bans raw `agent.definition` list queries outside the canonical services.
