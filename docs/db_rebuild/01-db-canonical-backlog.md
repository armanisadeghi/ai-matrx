# AI Matrx — Canonical DB Backlog

**Project:** `txzxabzwovsujtloxrus` (automation-matrx)
**Purpose:** the shared, durable list of what still needs to be brought onto the canonical contract, so nothing gets lost between sessions.
**Last updated:** this session (runtime build + has_access oversight + RLS Waves 1–2 complete).

**Explicitly OUT of scope (per Arman — dying/overhaul, do not touch):**
`ai_runs` (going away soon), `ai_model`, `ai_provider`, `ai_model_endpoint`, `ai_endpoint`, `ai_model_pricing` (pricing/catalog overhaul incoming).

> **RLS is now generated, not hand-written.** One generator (`iam.apply_rls` v2) + one resolver (`iam.has_access`) — see [`db-canonical-rls.md`](./db-canonical-rls.md). The per-table re-apply sweep (and the "RLS cosmetic" rescope below — v2 emits `TO authenticated` + `(select auth.uid())` automatically) is tracked in [`db-canonical-rls-sweep-todo.md`](./db-canonical-rls-sweep-todo.md). Do not author table policies by hand.

---

## P0 — Active targets

### A. cx_ / wf_ canonicalization (the big one)
None of the cx_/wf_ tables have `visibility`; roots use `is_public`; ~10 tables still carry **both `user_id` and `created_by`** (the duplicate-owner pattern we removed from War Room); org coverage is patchy. Bring them onto the canonical access model (visibility enum + `has_access` + admin oversight, which is now live).

**Roots → governed entities** (add `visibility`, migrate `is_public`→`visibility`, collapse `user_id`→`created_by`, ensure `organization_id` + personal-org backfill, register in `entity_types`, `has_access` RLS, `_touch_row`/`_stamp_actor`):
- `cx_conversation` (6,149) — `is_public` present → `visibility`; has user_id+created_by dup.
- `cx_artifact` (164), `cx_working_documents` (424), `cx_user_todo`, `cx_user_request` (4,671 — see note), `cx_agent_memory`, `cx_agent_plan`, `cx_agent_task` (51), `cx_observational_memory` (12).
- `wf_definition` (29) — `is_public` → `visibility`; `user_id` → `created_by`.
- `wf_run` (78), `wf_trigger`, `wf_template`.

**Children / components** (no own owner/visibility; register as composition → parent; RLS defers via `has_access`):
- cx_: `cx_message` (18,052)→conversation, `cx_tool_call` (4,599), `cx_tool_trace` (1,704), `cx_request` (8,449), `cx_request_snapshot` (1,958), `cx_pending_injection`, `cx_observational_memory_event`, `cx_media`, `cx_code_edit`, `cx_code_message_file`, `cx_conversation_documents` (407), `cx_user_usage_summary`.
- wf_: `wf_definition_version`, `wf_checkpoint` (65), `wf_job`, `wf_node_events` (283), `wf_node_outcome` (125), `wf_recovery_audit`, `wf_trigger_fire`, `wf_idempotency`.

**Collapse `user_id`==`created_by` (verify equal, then drop `user_id`):** `cx_agent_memory`, `cx_agent_plan`, `cx_agent_task`, `cx_artifact`, `cx_conversation`, `cx_observational_memory`, `cx_tool_call`, `cx_user_request`, `cx_user_todo`, `cx_working_documents`.

**Note — `cx_user_request` (4,671):** the new `runtime.global_request` was designed to supersede it. Decide: migrate + drop, or keep as a feature table. Don't invest in its canonicalization until that's settled.

**RLS cosmetic (fold in during the above):** several cx_/wf_ policies are scoped to the `public` role with owner/parent checks (not a leak — anon fails `auth.uid()`) and use `auth.uid()` instead of `(select auth.uid())`. Rescope to `authenticated` + wrap `auth.uid()` for plan-cache performance.

### B. cld_ — retire the canonical duplicates (app-coordinated)
`cld_*` is a large, live file/document system (10.9K files, 12K versions, analysis/redaction) and is **not** a teardown target. Its **satellite tables duplicate our canon** and should be migrated, then dropped once the app stops reading them. No RLS policy or FK depends on these, so DB-side removal is clean; the blocker is app code.
- `cld_file_permissions` (1 row) → `public.permissions` (same shape: resource_type/resource_id/grantee/level/org).
- `cld_events` (0) → `platform.activity_log`.
- `cld_user_groups` / `cld_user_group_members` (0/0) → `iam.memberships` (or canonical group concept).
- `cld_share_links` (150) → evaluate: tokenized link access = `visibility='link'` + token; keep token/expiry/use-count mechanics, drop the parallel permission semantics. (Lower confidence — needs product input.)

---

## P1 — RLS still to correct (not leaks; lower urgency)

- **Reference catalogs, RLS-off** → need a read policy. One decision gates it: **anon-readable or authenticated-only?** Tables: `message_template` (906), `wc_impairment_definition` (215), `ui_surface`/`ui_client`, `category`/`subcategory`/`prompt_app_categories`, `site_metadata`, `schema_templates`, `full_spectrum_positions`, `bucket_*`, `display_option`, `extractor`/`transformer`/`processor`/`system_function`.
- **RLS-on, 0 policies (deny-all today = safe)** → confirm intended backend-only, then leave or add service comment: `scrape_*` family, `kg_sweep_*`, `auto_ingest_cost_event` (251), `app_log_*`, `scrape_quick_failure_log` (1,646).
  - **Check `user_achievements`** — looks user-facing but is locked (RLS-on/0-policy). Likely needs an owner read policy or it's silently broken.

---

## P2 — Cross-cutting / hardening

- Replace `platform.associations.target_type` hardcoded CHECK with a real FK to `entity_types` (after reconciling stray tokens: `cx_message`→`message`, register `rs_topic`).
- **ctx_ 7 junctions** already migrated to canonical homes (associations/memberships/invitations/comments) and pending FE switch, then drop: `ctx_scope_assignments`, `ctx_task_associations`, `ctx_project_members`, `ctx_project_invitations`, `ctx_task_comments`, `ctx_task_assignments`, `ctx_task_attachments`. (1 orphan `ctx_task_comment` on a NULL-org task blocks that drop — resolve org or discard.)
- Drift cron (weekly): assert live RLS policies match `entity_types`/`entity_relationships` registries.
- Verify the Wave-1 service-only log tables are written by the service role (reversible if any logging path is non-service): `api_request_log`, `system_error`, `system_write_failure`, `api_field_warnings`, `pdf_consolidation_log`, `dev_login_audit`.
- Minor relationship tables that could fold into `associations`/`user_entity_state` (low priority): `canvas_likes`, `canvas_comment_likes`, `user_follows`, `user_bookmarks`.

---

## Done (for reference — see team changelog for detail)
- `iam.has_access` org-admin oversight step (cross-cutting).
- `runtime` schema canonical build (7 tables) — replaces `cx_user_request` path.
- RLS Wave 1 — 14 RLS-off tables closed (user-config / ops-logs / capture).
- RLS Wave 2 — 5 sensitive org/owner tables closed.
- War Room finalized; org_id→organization_id DB-wide; ctx_ → canonical mapping/backfills.
