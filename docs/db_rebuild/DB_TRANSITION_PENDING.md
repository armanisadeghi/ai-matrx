# DB Transition — FINISH IT (temporary; everyone working the rebuild read this)

> **🚨 THE APP HAS BEEN DOWN ~48h. The ONLY exit is finishing the transition — forward only.**
> Move every consumer off the old names → drop the shims → drop the legacy columns. No
> rollback, no half-states. **RLS / security is NOT a priority right now** — do not spend
> time on it (the one exception worth a single `apply_rls` call is noted at the very bottom).
> `public.scrape_*` is being **deleted** (new `scraper` schema) — ignore it entirely.
>
> The work = **repoint → verify zero refs → drop.** Remaining shims to kill: **74** reorg
> compat views (cx 23, agx 8, aga 6, tool 14, skl 6, ai 4, ctx/wr 13). Canonical docs:
> [`db-canonical-rls.md`](./db-canonical-rls.md), sweep board `iam.canonical_sweep`.

## 🔴 Teardown plan (IN PROGRESS — order matters, things will break if out of order)

1. **Drop compat shim views** (old `public.*` names) — ONLY after each domain's app **and** DB functions are confirmed off them:
   - workspace/context: the 13 `public.ctx_*` / `public.wr_*` views.
   - chat / agent / app / tool / ai / skill: the `security_invoker` shims (`cx_*`, `agx_*`, `aga_*`, `tool_*`, `ai_*`, `skl_*`).
   - **Gate:** zero FE `.from('<oldname>')`, zero embeds naming the old table, zero config/registry fields holding the old name, zero `Database["public"]["Tables"]["<old>"]` type refs, zero DB function/policy/view refs.
2. **Complete the tasks cutover** (has a DB-internal dependency — order matters):
   a. Repoint remaining DB refs `workspace.tasks.user_id` / `is_public` → `created_by` / `visibility` (a few `skill` SELECT-policy `task_id` branches + any functions).
   b. Drop the `tasks_canonical_bridge` trigger.
   c. Drop `workspace.tasks.user_id` and `is_public`.
3. **Same legacy-column drop for every other table canonicalized with a transitional bridge** (see §RLS below).

## ⏸️ RLS / canonical — DEFERRED (do NOT work these until the app is back up; only `ai.*` apply_rls is a one-liner if you have a spare moment). Of the list below, only the **Workflow legacy-column drop** is part of the teardown (it's in §D); the rest wait.

- **`_stamp_actor` can't stamp `created_by` for the BACKEND.** aidream never sets the Postgres `app.user_id` GUC, so service-role inserts get `created_by = NULL` → owner-less rows under canonical RLS. Fixed for the PostgREST path (auth.uid() fallback). **TODO:** make aidream set `app.user_id` per request (the systemic fix) so every backend-written canonical table stamps its actor. Until then, backend-owned tables need a `created_by := COALESCE(created_by, user_id)` bridge trigger.
- **Workflow legacy-column drop** (`workflow.{definition,run,trigger}.user_id`, `workflow.definition.is_public`). The matrx-graph raw stores + auth gates were repointed to `created_by`/`visibility` this session; a `workflow._bridge_legacy_owner` trigger keeps the canonical cols synced meanwhile. **TODO after aidream deploys:** drop the bridge, drop the legacy columns, repoint `iam.can_access_run` + `public.agx_usage_scan_core` (both still read `user_id`), and update workflow `OPERATING_PRIORITIES.md` #7 (`user_id` → `created_by`).
- **`ai.model` / `ai.provider` / `ai.endpoint` have RLS DISABLED** — anon-readable right now. **Run `iam.apply_rls` on them (SECURITY).**
- **Sharing finish-up** — physical re-key of `permissions.resource_type` to the entity token (now optional — `has_permission` is token-agnostic); `make_resource_public` → `visibility` is done; retire bespoke `note_shares` table + `shared_with` jsonb (`notes`/`flashcard_*`) into `public.permissions`.
- **anon/public read**, **`thread → war_room` containment edge**, **INSERT org-check vs member-less orgs** — see `db-canonical-rls.md` "Known gaps".

## 🟠 FE schema-transition blind spots (every reorg domain hit these — check ALL four)

The bulk repoint subagents reliably do literal `.from()` swaps but **miss**:
1. **PostgREST embeds** — `alias:old_table(...)` inside `.select()`. Same-schema FK → rename the resource; cross-schema or no-FK → split into a separate `.schema(...).from(...)` query. (`chat.conversation` has NO agent FK — that embed had to be split.)
2. **Config / registry indirection** — old table name stored in a field (`utils/permissions/registry.ts`, `resource-catalogue.ts`) consumed by `.from(entry.table)`. Grep can't see it.
3. **`Database["public"]["Tables"]["<old>"]` type references** — break after db-types regen (table moved schemas). Repoint to `Database["<schema>"]["Tables"]["<new>"]`.
4. **Whole domains skipped** — chat + ai were reported "migrated" but weren't. Verify with a per-domain typecheck + `.schema('<x>')` usage count.

> Also: **add the new schema to `pnpm db-types`** (`--schema <x>`) or every `.schema('<x>')` call fails to type — `ai` was missing.

## ✅ PROGRESS (2026-06-26, this session)
- **FE repointed off the shims** — `cx_/agx_/aga_/ai_model` config-indirection + missed `.from()` + embeds → new schemas. FE old-name `.from()` count = **0**.
- **~80 DB functions repointed** — 24 `cx_`→`chat.*`, 33 `agx_`→`agent.*`, 6 `aga_`→`app.*`, 11 `tool_def`→`tool.*`, ctx_→`workspace.*`/`context.*`, ai_→`ai.*`, `build_category_hierarchy`→`skill.*`. Verified zero old TABLE refs (RPC function NAMES kept — FE `.rpc()` still works).
- **3 skill SELECT policies** `task_id` branch → `workspace.tasks.created_by` (unblocks the tasks-column drop).
- Dead `ctx_context_variables` loop removed from `resolve_full_context`.

## ✅ AGENT schema dual-audience rebuild — FE/DB matched (2026-06-26)
The `agent.*` rebuild added a body/card split (`agent.definition` body capped **non-public** via CHECK; `agent.card` security-definer view of safe columns; `card_visibility` for the card audience; tokens `agent`/`agent_template`/`agent_surface_binding`/`agent_shortcut` + `agent_definition_version`/`_drift_alert`/`_usage`). Caught + fixed after the agx_ shims dropped:
- **13 functions** referenced the dropped `agx_*` shims — 4 genuinely broken (`get_agent_usage_stats`, `get_agent_conversations`, `agx_usage_history_counts`, `get_user_dashboard_metrics`) repointed to `agent.*` (these broke `agx_get_list`/`shared`/dashboard at runtime → agents were down).
- **Permission token unified on `agent`**: 9 functions' `'agx_agent'`/`'agx_shortcut'`/`'agx_agent_templates'` literals → `agent`/`agent_shortcut`/`agent_template`, and **30 grants re-keyed** (`agx_*`→`agent`). FE registry + ShareButton already pass `resourceType="agent"`. aidream + FE = 0 agx_ table refs.
- `agx_get_shared_with_me`/`_for_chat` confirmed to project only safe columns (no body leak).

**✅ Agent publish + the generic sharing RPCs — FIXED (2026-06-26).** Found a *broader* break: the generic sharing RPCs (`is_resource_owner`, `make_resource_public/private`, `share_resource_with_user/org`, `revoke_*`, `update_permission_level`, `get_resource_permissions`) resolved the registry's `table_name` as an **unqualified `public` table** — so sharing/make-public was broken for **every moved domain** (agent, conversation, app, file, skill, task, workflow), not just agent. Fix:
- Added `schema_name` to `shareable_resource_registry` (UNIQUE→`(schema_name,table_name)`); backfilled physical location from `entity_types` — 9 rows repointed (agent→`agent.definition`, conversation→`chat.conversation`, app→`app.definition`, file→`files.files`, skill→`skill.definition`, task→`workspace.tasks`, workflow→`workflow.definition`, agent_card→`agent.card`, …). `resolve_shareable_resource` returns `schema_name`; all 9 RPCs now schema-qualify (`%I.%I`).
- **Body/card publish:** `make_resource_public`/`private` drive `card_visibility` when the table has it (the body's `visibility` is CHECK-capped non-public), else `visibility`. **Verified live:** publishing an agent sets `card_visibility='public'`, body `visibility` stays `internal`, no CHECK error.
- Remaining (minor): outsider/anon agent pages, if any, should read `agent.card` (FE doesn't use it yet — shared display goes through the safe RPCs). DB function changes were applied via MCP and need repo migration files for the ledger.

## ✅ ALL REORG COMPAT SHIMS DROPPED (2026-06-26) — transition shim-teardown COMPLETE
Dropped across every domain: cx (21), agx (7), aga (6), tool (14), skl (6), **ai (3)**, **ctx_/wr_ (13)**. Before each drop: FE old-name `.from()`=0, aidream ORM on new schemas + raw refs fixed (`dictionary.py`, `sources.py`, `_seed_ambient_context.py`), all DB functions repointed (cx/agx/aga/tool/skl/ctx/ai + the 13 broken agx_ fns + the 9 token-unify fns + the schema-aware sharing RPCs), 3 skill policies on `created_by`, agent permission token unified on `agent` (+30 grants), sharing registry schema-aware. `ai_*` last consumer was the legacy entity system (being taken offline). **Kept (real aggregation views, validated OK live):** `agx_context_menu_view`, `ai_runs_summary`, `cx_conversation_summary`, `cx_user_request_summary`. `.rpc()` function names unchanged (still work).

## ⛔ (historical) SHIM DROP — gates (kept for reference)
1. **aidream backend** must be off the old names — matrx-orm models + raw SQL for `cx_/agx_/aga_/tool_/ai_/skl_` regenerated to the new schemas and **deployed**. Dropping a public shim breaks aidream (PostgREST/ORM) if it still reads it. **This is the gate — confirm with the backend agents per domain before dropping.**
2. **Legacy entity system** (`utils/schema/fullRelationships.ts`, `initialTableSchemas.ts`) reads via `supabase.from(name)` with **no `.schema()` support**, so it still needs the `ai_*` (and any other entity-registered old-name) compat views. Either add schema support to the entity layer or keep those specific views. (Most other consumers are clear.)

Per-domain drop recipe: re-run the FE grep + a DB `pg_proc/pg_policy/pg_views` scan for that family → if **0** + aidream confirmed off it → `DROP VIEW public.<oldname> CASCADE`-check, then drop. The `.rpc()` function names can be renamed in a later pass (not blocking).

---

## THE WORK (teardown audit, 2026-06-26 — what to repoint to finish)

### A. View-drop blockers — FE (break when `public.<old>` shims drop)
- **`utils/permissions/registry.ts`** — highest-leverage single file: `cx_conversation` (L148), `agx_agent` (L88), `aga_apps` (L98), `skl_definitions` (L470) in `tableName` config → add `schemaName`+`physicalTable` (skill already done as the model).
- **Config indirection** (same pattern): `features/organizations/resource-catalogue.ts` (agx_agent/agx_shortcut/aga_apps), `features/matrx-envelope/referenceResolvers.ts` (agx_agent:367, aga_apps:374), `features/item-presentation/registry.tsx` (agx_agent:175, aga_apps:199), `features/ai-models/{types.ts:192,service.ts:138,144}` (agx_agent/templates).
- **Missed `.from()`**: `features/agents/ui-first-tools/service/agent-memory.service.ts` — 5× `.from("cx_agent_memory")` (LIVE, not yet repointed).
- **FK embeds**: `features/cx-dashboard/service.ts` — `ai_model:last_model_id(...)` ×7 (split or rename per FK once `ai_model` view drops).
- **Stream-protocol discriminators (CROSS-REPO)**: `process-stream.ts`, `StreamDebugPanel.tsx`, `active-requests.selectors.ts` compare `event.table === "cx_message"/"cx_conversation"/…`. These match the **stream event payload**, not the DB — they only break if aidream renames the `table` field in stream events. Coordinate with backend.
- **Legacy entity fixtures**: `utils/schema/fullRelationships.ts` + `initialTableSchemas.ts` (ai_model/provider/endpoint) — the `(legacy)` entity system.
- **RPCs** (12 `cx_*` + 27 `agx_*` + tool/ai): function NAMES can stay; the FE `.rpc()` calls are fine **iff** the DB functions keep their names — but the function BODIES must be repointed (see B).

### B. View-drop blockers — DB (~70 functions read old table names in their bodies)
Must repoint before dropping the shims. Big families: ~24 `cx_*` fns (`get_cx_conversation_bundle`, `cx_fork_conversation`, `cx_message_soft_delete`, `resolve_full_context`, `get_user_dashboard_metrics`, `iam.can_access_conversation`…), ~35 `agx_/aga_` fns (`agx_get_list*`, `agx_usage_scan_core`, `get_aga_public_data`, snapshot triggers…), ~15 `tool_def` fns, 5 `ctx_*` fns, 5 `ai_model` fns, `build_category_hierarchy`→`skl_render_definitions`. **Non-shim views:** `graveyard.recipe_complete`→`ai_model`; `platform.v_deprecated_table_access` enumerates the to-be-dropped names (drop/update it first).

### C. workspace.tasks cutover (the §teardown-2 dependency)
- **3 `skill` SELECT policies** join `workspace.tasks.user_id`/`assignee_id` via the `task_id` branch — `skill.category/skl_cat_select`, `skill.definition/skl_defs_select`, `skill.render_definition/skl_rdefs_select`. Repoint to `created_by` **before** dropping `workspace.tasks.user_id`. (5 graveyard `ctx_task_*` policies also reference it — lower urgency, already archived.)
- **FE**: `features/tasks/services/taskService.ts:64,108` (`user_id` insert+filter); `make_resource_public/private` RPC writes `is_public` (now also drives `visibility`).
- `workspace.tasks` is the worst: `user_id`+`created_by`, `is_public`+`visibility`, plus `tasks_canonical_bridge` trigger.

### D. Legacy-column drops — bridged/dual-column tables (created_by+user_id etc.)
**57 dual-column tables.** Triple-hit (all legacy pairs): `public.ctx_tasks`, `public.notes`, `workspace.tasks`. Bridge triggers: `workspace.tasks` (`tasks_canonical_bridge`), `public.processed_documents` (`trg_pdf_set_canonical_bridge`), `workflow.*` (`_bridge_legacy_owner`). FE legacy-column users (drop after repoint): **notes** (heaviest — `notesService.ts`, `notes/redux/*`), transcripts, studio_sessions, code_files, agent.definition (`lib/agents/actions.ts`), chat.artifact (`app/api/artifacts/route.ts`), canvas_items, prompt_actions, pc_episodes, app-builder ×4. Each: `user_id`→`created_by`, `is_public`→`visibility`, `is_deleted`→`deleted_at`, then drop the column + bridge.

> Per-domain order: repoint **DB functions/policies (B,C)** → repoint **FE (A,D)** → confirm zero refs → **drop view/column/bridge**. The RLS-disabled set (top) is independent and urgent.
