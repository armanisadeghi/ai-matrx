# Legacy System Decommission — tracker

> Live, concise tracker for retiring the old systems whose DB tables were deleted in the 2026 reorg.
> One line per item. Status: ⬜ todo · 🔄 in progress · ✅ done · ⏸️ needs-user · ⚠️ careful.
> Companion: [project_db_reorg_health_audit] memory, [DB_TRANSITION_PENDING.md](./DB_TRANSITION_PENDING.md).

## Directives (from user — do not lose)
- **Old prompt system** → mostly GONE. But: (a) refs inside NEW modules usually mean "still on old prompt system → switch to agent system"; (b) some prompt **components are the best we have** — DON'T drop; transition into the agent system (run a list by user first); (c) AI integrations using an old **prompt ID / prompt shortcut** = EASY: the same UUID exists as an agent / agent-shortcut, just point usage at the agent system.
- **Old workflow system** → deprecated but **KEEP INTACT**; goal: get it to at least **render** (we love the UI; will rebuild the new system from it). Do NOT delete.
- **Old entities system (MASSIVE)** → **COMPLETE REMOVAL**, coordinated: slices, utilities, components, and the giant TS types (they slow the IDE). Ensure it does not sneak back in anywhere.
- Use small Sonnet subagents; adversarially double/triple-check; loop until verified nothing remains.

## Systems overview
| System | Disposition | DB tables | Status |
|---|---|---|---|
| Entities system | DELETE entirely (coordinated) | n/a (FE construct) | 🔄 mapping |
| Prompt system | Mapped: migrate Resource cluster first → then delete `features/prompts/`+`features/prompt-builtins/`+transitional routes | prompts/prompt_apps/prompt_versions/prompt_builtins/prompt_shortcuts (deleted) | 🔄 mapped |
| Brokers | SPLIT: keep `lib/redux/brokerSlice/` (live, 80+ files); delete `features/brokers/services/` (dead DB layer) | broker_values/data_broker (deleted) | 🔄 mapped |
| Workflow | KEEP, get rendering | workflow (graveyard) | 🔄 mapping |
| Recipe / automation / registered_function | DELETE (dead) | recipe*/automation_*/registered_function (deleted) | 🔄 mapped |
| **Workflow — TWO systems** | DELETE `features/workflows/` (old react-flow); **KEEP `features/workflows-xyflow/`** (the loved UI) + get rendering | registered_node/workflow (graveyard) | 🔄 mapped |
| Dead DB legacy CRUD fns | DROP after FE cleanup | — | ⬜ |

## Removal wave plan (execute in order; tsc + adversarial check each wave)
0. ✅/🔄 **Resource-cluster migration** — move `features/prompts/{types/resources.ts,utils/resource-formatting.ts,components/resource-display/ResourceChips.tsx}` (+ DesktopFilterPanel, SystemPromptOptimizer) into `features/agents/`; repoint ~8 prod importers (B13–B20). UNBLOCKS prompt deletion.
1. **Wave A — isolated dead folders** (HIGH confidence, no core/admin importers): `features/recipes/`, `features/workflows/` (OLD react-flow), `features/registered-function/`, `lib/redux/workflows/`, `app/api/recipes/`, `app/(transitional)/ai/recipes/`, `hooks/run-recipe/`.
2. **Wave B — prompt system**: `features/prompts/`, `features/prompt-builtins/`, transitional prompt routes (`(transitional)/ai/prompts`, `prompt-apps`), `app/api/prompts*`, prompt redux slices/thunks/selectors (D21–D32).
3. **Wave C — broker services**: `features/brokers/services/` (keep `lib/redux/brokerSlice/`).
4. **Wave D — ENTITY SYSTEM (big)**: `lib/redux/entity*/`, `utils/schema/` giant types, EntityProviders, store registration, `(legacy)` entity routes. Most careful.
5. **Workflow preservation**: make `features/workflows-xyflow/` render; fix its `registered_node`/`registered_function` reads.
6. **Active-break fixes** (runtime errors NOW): `lib/redux/middleware/apiThunks.ts` (`registered_function`), applet RPCs `add_groups_to_applet`/`refresh_field_in_group`, recipe convert-to-prompt.
7. **DB**: drop orphaned dead functions after FE cleanup.

## Preserve-then-transition (compile for user review — don't lose)
- C1–C5 versioning UI: `features/versioning/components/{VersionHistoryPanel,VersionDiffView,VersionBadge,DriftWarningBanner}.tsx` + `hooks/useVersionHistory.ts` — generic, reusable for agent versioning.
- C6–C8 (REQUIRED move, not optional): `Resource` type + `formatResourcesToXml` + `ResourceChips` — used by 8 prod agent/chat files.
- C9 `DesktopFilterPanel`, C10 `SystemPromptOptimizer`, C11 `useContextMenuShortcuts`, C12 `execution-modes.ts` types — used by agents.

## Easy UUID-swap items (prompt ID / shortcut → agent / agent-shortcut)
_(populate from discovery — these are quick wins)_
- ⬜ TBD

## Preserve-then-transition (best prompt/UI components → agent system) — NEEDS USER LIST
- ⏸️ TBD (compile list, confirm with user before moving/deleting)

## Entities system removal inventory
_(populate: slices, hooks, utils, components, types, routes; mark imported-by-new vs pure-legacy)_
- ⬜ TBD

## Brokers detail (mapped)
- ✅ KEEP `lib/redux/brokerSlice/` — alive, no DB calls, powers applet/workflow field inputs (80+ importers). Do NOT delete.
- ⬜ DELETE `features/brokers/services/core-broker-crud.ts` + `resolution-service.ts` — 6 dead RPCs to `broker_values`/`data_broker`. Coupled to prompt-execution removal.
- ⚠️ Live leak: `lib/redux/prompt-execution/thunks/startPromptActionThunk.ts:22` calls `resolveBrokersForContext` → silently throws → prompt actions resolve broker vars to `{}`. (Goes away with prompt-execution removal; new path = `resolve_full_context` RPC.)
- Stale doc: `features/brokers/INFO.md` documents deleted SQL schema.

## Entity system (mapped) — ~690 files / ~380K lines
- IDE killer: `utils/schema/initialSchemas.ts` (116K), `initialTableSchemas.ts` (109K), `lookupSchema.ts` (29K), `initialSchemas.json` (39K) = 293K lines. Imported only by the entity engine (also deleting) — but the engine feeds the 7 blockers below, so NOT deletable in isolation.
- Engine: `lib/redux/entity*/` (~95 files), providers (`app/EntityProviders.tsx`, `providers/EntitySystemProvider.tsx`, packs), UI (`components/matrx/{Entity,ArmaniForm,EntityTable}/` ~300 files), `app/entities/` (175 files), `app/(legacy)/` routes, type files (`types/{entityTypes,AutomationSchemaTypes,entities,...}.ts`).
- **7 BLOCKERS — RE-ASSESSED (much lighter than feared):** ①`features/chat/` = **NOT live** → DELETE after relocating its print utils (`utils/block-print-utils`, `dom-capture-*`, `components/print/PrintOptionsDialog`) + `InputControlsSettings` interface (~13 live markdown-block importers). ②`features/workflows*` entity hooks (KEPT xyflow) → stub the entity hooks to empty (it renders empty already). ③hooks/ = MatrxRecordId (light) + domain types. ④`constants/chat.ts` = legacy/transitional only (NOT core). ⑤`uiTypes.ts` zero external importers; `uiSagas.ts` = fully commented dead → delete. ⑥`preferences` = MatrxRecordId only. ⑦`rich-text-editor` = MatrxRecordId + QuickReferenceRecord.
- **Net real core-coupling = `MatrxRecordId` (=string, trivial extract) + `QuickReferenceRecord` + a few hooks/ domain types + features/chat print-utils.** All build-verifiable relocations → then the engine + 293K schema files delete.
- ⬜ Resource-miss fix: `features/prompts/utils/resource-data-fetcher` → `features/agents/resources/`; repoint `lib/redux/prompt-execution/utils/message-builder.ts`.
- LIGHT coupling = `MatrxRecordId` (a string alias) — relocate to a shared `types/` to cut most blockers cheaply.

## ⚠️ ENTANGLEMENT — deletions are NOT isolated (verified)
- `features/recipes/` ← applet builder + `PageSpecificHeader` (layout).
- `features/workflows/` (old) ← KEPT `features/workflows-xyflow/` + `features/scraper/` + `components/ui/broker-selector`.
- `features/chat/` (legacy) ← live markdown-render blocks + `features/conversation/`.
- **Implication:** no bulk folder delete is safe; each needs per-importer rework first. Big-bang = prod break. Execute as careful waves with tsc + adversarial check between each. The 380K-line entity removal is a coordinated effort, NOT an autonomous one-shot.

## Workflow KEEP target — `/legacy/workflows-new/[id]` (xyflow v12) — ✅ RENDERS (tsc clean)
- ✅ Unblocked layout gate (dropped the 3 deleted-table emptiness checks); ✅ services read `graveyard.workflow`/`workflow_node`; ✅ guarded `useCategoryNodeData`; ✅ stubbed `recipe-service.ts` compiled_recipe.
- ⏸️ **Data visibility (user call):** 52 rows exist in `graveyard.workflow` (RLS on, owner=`user_id`) but `graveyard` likely isn't PostgREST-exposed → list shows empty (no crash). To show data: scoped `SECURITY DEFINER` read RPC (preferred) OR expose graveyard (security trade-off — exposes all dead tables). NOT auto-done.

## Adversarial verdict (verified) — NO safe bulk delete; unblock reworks required
- `features/workflows/` (old) — BLOCKED: `lib/redux/workflows/db-function-node/dbFunctionNodeSlice.ts` is in the MAIN store (all core routes) + `components/ui/broker-selector*`. Rework: rewrite slice off `features/workflows` imports; port the 4 `workflows-xyflow` cross-imports into xyflow.
- `features/prompts/` — HARD BLOCKED: Resource cluster + `DesktopFilterPanel` + `SystemPromptOptimizer` (core agents), `ResourceChips`+`Resource` (core chat), `LegacyPromptOverlaysController` (`app/DeferredSingletons.tsx` root), public-chat, prompt redux slices in main store.
- `features/prompt-builtins/` — BLOCKED: live (admin) routes + admin API.
- `features/recipes/` — BLOCKED: (admin) `multi-applet-selector` → applet builder → recipes types.
- `features/chat/` — NOT a delete target (live; markdown print blocks depend on it).
- Self-contained ROUTE folders deletable (with their feature islands): `(transitional)/ai/recipes`, `(transitional)/ai/prompts`, `(transitional)/prompt-apps`. Feature islands `features/registered-function/` + `hooks/run-recipe/` deletable WITH their transitional/dev consumers (must delete together or transitional build breaks).

## Unblock reworks (do these to enable deletion; build-verifiable, low runtime risk)
1. ✅ **Resource cluster → agent system** (DONE, build-verified): now `features/agents/resources/` (types/utils/ResourceChips/ResourceDisplay); 22 live importers repointed; `features/prompts/` left intact (delete its copies with the feature). First prompt-deletion blocker cleared.
2. ✅ Moved `DesktopFilterPanel` + `SystemPromptOptimizer` → `features/agents/` (build-verified, committed).
2b. ✅ Print utils → `lib/block-print/` (16 importers), `InputControlsSettings` → `lib/types/`, Resource-miss fixed, dead `uiSagas.ts` deleted (committed). features/chat now has only 5 UI-component importers left (tool-viz news-api, PageSpecificHeader dynamic, prompts/workflows being-deleted, hooks/.../unused).
3. 🔄 Extract `MatrxRecordId` (`= string`) → `types/records.ts` (cuts entity blockers 3/6/7).
4. ⬜ Rewrite `dbFunctionNodeSlice` off `features/workflows`; stub kept-xyflow entity hooks to empty.
5. ⬜ Relocate `QuickReferenceRecord` (rich-text) + remaining hooks/ domain types.
6. ⬜ Free features/chat last 5 importers (tool-viz news-api MessageOptionsMenu/AssistantMessage; PageSpecificHeader dynamic ChatHeaderCompact).
THEN deletions: dead islands → prompt feature → features/chat → entity engine + 293K schema files (IDE relief).

## Open questions for user
- ⬜ TBD

## Change log
- 2026-06-27: tracker created; discovery agents dispatched.
