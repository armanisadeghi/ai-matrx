# Migration Analysis Brief — CTX Association Overhaul

> **For:** an IDE agent with full codebase access (TS/Next.js + Python).
> **Goal:** tell us the *true cost* of the overhaul. **Analyze and report only — do NOT write the migration or change code yet.**
> **Read first:** `ctx-association-architecture.md` (the decisions). This brief tells you what to inventory against those decisions.

## What we're doing (one paragraph)
Collapsing scattered `project_id` / `task_id` (and over-broad `organization_id`) FK columns into one polymorphic `ctx_associations` table, folding in `ctx_scope_assignments` + `ctx_task_associations`, and expanding `ctx_context_item_values` to hold **typed reference values** (file/agent/scope pointers). FK spine (containment) and `organization_id`-as-tenancy stay. We need to know how much code assumes the columns/tables we're changing.

## DB facts already established (don't re-derive; verify if cheap)
- **`project_id` FK columns (~34 tables).** KEEP (spine/containment): `ctx_tasks`, `ctx_project_members`, `ctx_project_invitations`. JUDGMENT-NEEDED (containment vs litter): `code_repositories`, `code_files`, `code_file_folders`, `wc_claim`, `skl_skill_projects` (looks like an existing skill↔project junction), `ai_runs`, `ai_tasks`. LITTER (convert→`ctx_associations`, then drop): `agx_agent`, `agx_agent_templates`, `agx_shortcut`, `app_instances`, `broker_values`, `canvas_items`, `content_template`, `ctx_context_variables`, `cx_agent_plan`, `cx_conversation`, `flashcard_data`, `flashcard_sets`, `notes`, `page_extraction_jobs`, `prompt_actions`, `prompt_apps`, `prompts`, `quiz_sessions`, `rs_topic`, `sandbox_instances`, `transcripts`, `udt_datasets`, `user_files`, `workflow`.
- **`task_id` FK columns (~21).** KEEP: `ctx_tasks` child tables (`ctx_task_comments/attachments/assignments`), and **`ctx_user_active_context`** (this is Active Context, not litter — see arch doc §6). IGNORE (different subsystem → `sch_task`): `sch_run`, `sch_trigger`. Remaining mirror the litter list above (notes, prompts, cx_conversation, transcripts, user_files, workflow, broker_values, app_instances, sandbox_instances, udt_datasets, ctx_context_variables, agx_*). FOLD IN: `ctx_task_associations`.
- **DB functions touching the 3 tables (~20).** Writers to repoint: `set_entity_scopes`, `associate_with_task`, `dissociate_from_task`, `set_context_value`, `set_scope_context_value`, `create_task_with_association`, `create_tasks_bulk`. Readers (should keep working via compat views): `get_entity_scopes`, `get_tasks_for_entity`, `get_task_associations`, `list_entities_by_scopes`, `resolve_full_context`, `get_user_full_context`, `get_scope_context`, `list_scopes`, `delete_scope`, `delete_scope_type`, `ctx_version_context_item_value`, `get_value_history`, `kg_simulated_scope_graph`.
- RLS does **not** depend on the litter FKs (resolves via user/org/project membership + `has_permission`). Dropping them is isolation-safe.

## What only YOU can determine — inventory the codebase and report counts + file paths

1. **App-layer references to the columns being dropped.** Every read/write/insert/select of `project_id`, `task_id` (and `organization_id` where it's not the tenancy owner) on the LITTER tables — across: Redux slices/selectors, the custom async ORM (Matrx ORM) models/schemas, FastAPI/SQLAlchemy models, TS types, GraphQL/typegen output, and any hardcoded SQL. Group by table; give counts + paths.
2. **Consolidated-table references.** Every app-layer call site of `ctx_scope_assignments` and `ctx_task_associations` (direct table access AND via the RPCs listed above). Which are reads (safe via compat view) vs writes (must repoint)?
3. **Active Context vs Association confusion (arch doc §6).** Find where `appContextSlice` / `ctx_user_active_context` is written vs where durable associations are written. Flag any place that conflates them (e.g. writing active-context selection into a durable assignment, or vice-versa). This is a known agent failure mode — list every offender.
4. **`ctx_context_item_values` writers/readers.** Everything that sets or reads context item values (we're adding `value_kind` + `ref_entity_type/ref_entity_id`). Will adding nullable columns break any `SELECT *` / strict typegen / ORM schema assumptions?
5. **The association UI surface.** Which components currently do scope assignment vs project/task assignment (the "two UIs" problem). Identify the candidate single `ContextAssignmentField` consolidation points and every place that would adopt it.
6. **Typegen / type-safety blast radius.** If columns drop and a table is added, what regenerates (Supabase typegen, ORM models, TS types) and what breaks at compile time? Estimate file count.

## Deliverable back to us
- A per-table verdict table (keep / convert / drop) confirming or correcting §7.4 of the arch doc, with reasoning for the judgment cases.
- A writer-vs-reader RPC list with repoint effort per writer.
- App-layer reference counts + paths per concern above.
- A go/no-go on the **compat-views** strategy (does anything do `INSERT`/`UPDATE` directly on `ctx_scope_assignments`/`ctx_task_associations` that a view can't serve? Postgres updatable-view limits apply).
- Your estimate: can this be done as (a) one clean phased migration we hand-run, or (b) does it need a large generated transaction? Recommend.

## Hard constraints
- No behavior change for end users; existing scope associations must keep working throughout.
- Build-new + backfill + compat-views FIRST; drop columns only in a later phase.
- `organization_id` stays as tenancy owner (backfill to personal-workspace org, then `NOT NULL`). Do not convert org to an association.
- Don't touch the `sch_*` scheduler subsystem.
