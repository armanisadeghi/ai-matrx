-- ============================================================================
-- CTX ASSOCIATION OVERHAUL — PHASE 2 (DESTRUCTIVE) — DO NOT RUN YET
-- ============================================================================
-- GATE: run ONLY after ALL of the following are TRUE (see the ledger):
--   [ ] Codebase audit complete; no app code reads/writes the columns below.
--   [ ] All ~7 writer RPCs repointed to ctx_associations (or confirmed routed
--       through the compat-view INSTEAD OF triggers and to be retired).
--   [ ] App writes new associations via the new path; old litter columns frozen.
--   [ ] Supabase-internals audit (10-agent sweep) found no trigger/RPC/view/policy
--       that still references the dropped columns or deprecated tables.
--   [ ] Phase 1 has been live and verified for the agreed soak period.
--
-- Each statement is independent. Run them in small batches and re-verify
-- between batches. Nothing here is reversible without a restore.
-- ============================================================================

-- ---- 2A. Drop CONFIRMED-litter project_id columns --------------------------
ALTER TABLE agx_agent              DROP COLUMN IF EXISTS project_id;
ALTER TABLE agx_agent_templates    DROP COLUMN IF EXISTS project_id;
ALTER TABLE agx_shortcut           DROP COLUMN IF EXISTS project_id;
ALTER TABLE app_instances          DROP COLUMN IF EXISTS project_id;
ALTER TABLE broker_values          DROP COLUMN IF EXISTS project_id;
ALTER TABLE canvas_items           DROP COLUMN IF EXISTS project_id;
ALTER TABLE content_template       DROP COLUMN IF EXISTS project_id;
ALTER TABLE ctx_context_variables  DROP COLUMN IF EXISTS project_id;
ALTER TABLE cx_agent_plan          DROP COLUMN IF EXISTS project_id;
ALTER TABLE cx_conversation        DROP COLUMN IF EXISTS project_id;
ALTER TABLE flashcard_data         DROP COLUMN IF EXISTS project_id;
ALTER TABLE flashcard_sets         DROP COLUMN IF EXISTS project_id;
ALTER TABLE notes                  DROP COLUMN IF EXISTS project_id;
ALTER TABLE page_extraction_jobs   DROP COLUMN IF EXISTS project_id;
ALTER TABLE prompt_actions         DROP COLUMN IF EXISTS project_id;
ALTER TABLE prompt_apps            DROP COLUMN IF EXISTS project_id;
ALTER TABLE prompts                DROP COLUMN IF EXISTS project_id;
ALTER TABLE quiz_sessions          DROP COLUMN IF EXISTS project_id;
ALTER TABLE rs_topic               DROP COLUMN IF EXISTS project_id;
ALTER TABLE sandbox_instances      DROP COLUMN IF EXISTS project_id;
ALTER TABLE transcripts            DROP COLUMN IF EXISTS project_id;
ALTER TABLE udt_datasets           DROP COLUMN IF EXISTS project_id;
ALTER TABLE user_files             DROP COLUMN IF EXISTS project_id;
ALTER TABLE workflow               DROP COLUMN IF EXISTS project_id;

-- ---- 2B. Drop CONFIRMED-litter task_id columns -----------------------------
ALTER TABLE agx_agent              DROP COLUMN IF EXISTS task_id;
ALTER TABLE agx_agent_templates    DROP COLUMN IF EXISTS task_id;
ALTER TABLE agx_shortcut           DROP COLUMN IF EXISTS task_id;
ALTER TABLE app_instances          DROP COLUMN IF EXISTS task_id;
ALTER TABLE broker_values          DROP COLUMN IF EXISTS task_id;
ALTER TABLE ctx_context_variables  DROP COLUMN IF EXISTS task_id;
ALTER TABLE cx_conversation        DROP COLUMN IF EXISTS task_id;
ALTER TABLE notes                  DROP COLUMN IF EXISTS task_id;
ALTER TABLE prompts                DROP COLUMN IF EXISTS task_id;
ALTER TABLE sandbox_instances      DROP COLUMN IF EXISTS task_id;
ALTER TABLE transcripts            DROP COLUMN IF EXISTS task_id;
ALTER TABLE udt_datasets           DROP COLUMN IF EXISTS task_id;
ALTER TABLE user_files             DROP COLUMN IF EXISTS task_id;
ALTER TABLE workflow               DROP COLUMN IF EXISTS task_id;

-- ---- 2C. Retire compat layer + deprecated tables (LAST, after RPC cutover) -
-- DROP TRIGGER  IF EXISTS ctx_compat_scope_assignments_trg ON ctx_scope_assignments;
-- DROP TRIGGER  IF EXISTS ctx_compat_task_associations_trg ON ctx_task_associations;
-- DROP VIEW     IF EXISTS ctx_scope_assignments;
-- DROP VIEW     IF EXISTS ctx_task_associations;
-- DROP FUNCTION IF EXISTS ctx_compat_scope_assignments_iud();
-- DROP FUNCTION IF EXISTS ctx_compat_task_associations_iud();
-- DROP TABLE    IF EXISTS ctx_scope_assignments_deprecated;
-- DROP TABLE    IF EXISTS ctx_task_associations_deprecated;

-- ---- EXPLICITLY NOT DROPPED (kept as spine / judgment / different subsystem)
--   KEEP (containment spine): ctx_tasks.project_id, ctx_tasks.parent_task_id,
--     ctx_project_members.project_id, ctx_project_invitations.project_id,
--     ctx_task_comments/attachments/assignments.task_id
--   KEEP (Active Context, not litter): ctx_user_active_context.project_id/task_id
--   JUDGMENT (resolve in audit before deciding): code_repositories.project_id,
--     code_files.project_id, code_file_folders.project_id, wc_claim.project_id,
--     skl_skill_projects.project_id, ai_runs.project_id, ai_tasks.project_id
--   IGNORE (separate scheduler subsystem -> sch_task): sch_run.task_id, sch_trigger.task_id
-- ============================================================================
