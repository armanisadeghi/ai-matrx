# AI Matrx — DB Status (living)

**Project:** `txzxabzwovsujtloxrus`. Reconciled against the live DB this session. This is the only backlog; `db-canonical-backlog.md` is archived.

## Done (verified in DB)
- `runtime` schema canonical (7 tables) — replaces the `cx_user_request` path.
- `iam.has_access` org-admin oversight step (cross-cutting).
- RLS Waves 1–2 — 19 `public` tables that were RLS-off now closed.
- `public.permissions.expires_at` added; `has_permission` honors it. *(done by agent — matches paradigm)*
- `graveyard`: `cld_user_groups`/`cld_user_group_members`, 6 `ctx_` junctions (`ctx_task_assignments`/`project_members`/`project_invitations`/`task_associations`/`task_attachments`/`task_comments`), plus a large legacy set (`conversation`, `message`, `workflow`, `recipe`, `broker`, `ai_*` …). *(done by agents)*
- `cx_conversation`: **canonicalized** — `visibility` now enforced via `has_access` RLS (owner fast-path + org-admin oversight + public/link + grants + project collaboration); `created_by` backfilled and canonical; soft-delete aware. *Applied paradigm:* blanket org-member read removed (conversations are owner + admin, not member-readable). *Deferred by design:* drop `is_public`/`user_id` after app cutover.

## ⚠️ Known drift / risk
- None open. Only deferred-by-design items remain (legacy `cx_conversation` columns kept live until the app writes `visibility`/`created_by`).

## Remains
**cx_ (root done; cascade next):**
1. ✅ `cx_conversation` canonicalized. *Deferred:* drop `is_public`+`user_id` once the app writes `visibility`/`created_by`; also fix `cx_message.cx_message_public_read` (still reads parent `is_public`) when messages are canonicalized.
2. Children via composition: `cx_message`, `cx_tool_call`, `cx_tool_trace`, `cx_request`, `cx_request_snapshot`, `cx_*` side-records (register, has_access RLS, no own owner).
3. Other roots: `cx_artifact`, `cx_working_documents`, `cx_user_todo`, `cx_agent_*`, `cx_observational_memory`.
4. Collapse duplicate-owner (`user_id`==`created_by`) on: `cx_agent_memory/plan/task`, `cx_artifact`, `cx_observational_memory`, `cx_tool_call`, `cx_user_todo`, `cx_working_documents`.

**wf_ (not started):** `wf_definition` (`is_public`→`visibility`, `user_id`→`created_by`, register, has_access); then `wf_run`/`wf_trigger`/`wf_template` + children (`wf_node_*`, `wf_checkpoint`, …).

**cld_ (app-side first, then DB graveyard):**
- App: `cld_file_permissions` (1 row) → `public.permissions` (resource_type `file`); `cld_events` → `platform.log_activity`. *(zero adoption so far)*
- Then DB: graveyard `cld_file_permissions` + `cld_events`.
- `cld_structure` + `cld_guest_migrations`: confirm dead → graveyard.
- `cld_share_links`: keep; set `visibility='link'` on linked resources.

**ctx_:** `ctx_scope_assignments` still live → migrate to `associations`, then graveyard.

**Cross-cutting:** apply the schema-per-subsystem move (pending confirm) folded into each pass above; `associations.target_type` CHECK → `entity_types` FK; weekly drift cron asserting policies match registries; confirm Wave-1 service-only log writers are service-role.

## Out of scope (do not touch — dying/overhaul)
`ai_runs`, `ai_model`, `ai_provider`, `ai_model_endpoint`, `ai_endpoint`, `ai_model_pricing`.