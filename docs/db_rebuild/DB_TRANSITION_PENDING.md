# DB Transition — PENDING TASKS (temporary, everyone working the rebuild read this)

> **TEMPORARY tracker.** The big 2026 DB changeover (schemas reorg + canonical RLS) is
> mid-flight across `matrx-frontend` + `aidream` on a shared `main` with many concurrent
> agents. This is the live "what's not done / what's about to break" list. Delete it when
> the teardown is complete. Canonical mechanism docs: [`db-canonical-rls.md`](./db-canonical-rls.md),
> [`canonical-sweep-runbook.md`](./canonical-sweep-runbook.md), sweep board = `iam.canonical_sweep`.

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

## 🔴 RLS / canonical — open items

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

## Found problems (teardown audit, 2026-06-26 — 4 parallel agents)

### 🔴 SECURITY (do first) — 30 API-exposed tables with RLS DISABLED (anon+authenticated)
`ai.endpoint/model/provider`; `public.scrape_domain_settings/_failure_log/_path_override/_retry_queue` (anon-**writable**!), `message_template`, `ui_surface`, `ui_client`, `category`/`subcategory`, `display_option`, `extractor`/`transformer`/`processor`/`system_function`, `schema_templates`, `site_metadata`, `bucket_structures`, `full_spectrum_positions`, `wc_impairment_definition`, `ai_model_endpoint`, `ai_model_pricing`, `applet_containers`/`container_fields`, `prompt_app_categories`, `schema_migrations`/`_schema_migrations`. → enable RLS (`iam.apply_rls` or a read policy per the P1 reference-catalog decision).

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
