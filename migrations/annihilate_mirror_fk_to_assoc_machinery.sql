-- Annihilate the forbidden platform._mirror_fk_to_assoc machinery platform-wide
-- (chip task_fdb63467, supersedes task_87ba75f4 which already cut the four
-- agent.template/agent.shortcut triggers).
--
-- CLAUDE.md § Forbidden relationship shortcuts: no trigger, function, migration,
-- or application path may call, create, preserve, copy, or repair this function.
-- It mirrored physical project_id/task_id FKs into platform.associations edges —
-- two competing relationship authorities. The ddl_guard event trigger blocks any
-- re-creation of a function by this name.
--
-- Verified live before drop (2026-08-12, chip task_fdb63467):
--   * 11 remaining triggers (list below re-derived from pg_trigger, not the brief).
--   * Every feeding FK column is 100% NULL (0 non-null values across all 10 live
--     table/column pairs; education.quiz_sessions.project_id is already dropped,
--     so its trigger was a dead no-op).
--   * platform.associations holds ZERO edges whose source_type is any of the 8
--     mirrored tokens (app_instance, canvas_item, agent_plan, page_extraction_job,
--     quiz_session, flashcard, sandbox_instance, udt_dataset) — the machinery
--     never produced a surviving edge, so no surface loses data and no canonical
--     writer replacement is needed.
--   * Existing project/task edges in platform.associations (note, agent,
--     conversation, message, research_topic, web_page sources) were written
--     canonically and are KEPT — this migration deletes no data.
--
-- The project_id/task_id FK COLUMNS are a separate grandfathered queue
-- (ddl_guard) and are deliberately NOT touched here.
--
-- Idempotent.

drop trigger if exists _mirror_proj on public.app_instances;
drop trigger if exists _mirror_task on public.app_instances;
drop trigger if exists _mirror_proj on canvas.canvas_items;
drop trigger if exists _mirror_proj on chat.agent_plan;
drop trigger if exists _mirror_proj on docproc.page_extraction_jobs;
drop trigger if exists _mirror_proj on education.quiz_sessions;
drop trigger if exists _mirror_proj on graveyard.education_flashcard_data;
drop trigger if exists _mirror_proj on public.sandbox_instances;
drop trigger if exists _mirror_task on public.sandbox_instances;
drop trigger if exists _mirror_proj on workbench.udt_datasets;
drop trigger if exists _mirror_task on workbench.udt_datasets;

-- Belt-and-suspenders: any trigger anywhere still bound to the function dies
-- with it. No trigger may survive pointing at forbidden machinery.
drop function if exists platform._mirror_fk_to_assoc() cascade;
