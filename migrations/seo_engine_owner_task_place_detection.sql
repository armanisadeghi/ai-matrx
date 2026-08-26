-- ============================================================================
-- ONE OWNER PER ENGINE — gazetteer place detection (2026-08-26)
--
-- Place detection joined the run console as engine `seo.place_detection`, but
-- the standalone scheduler task "SEO — gazetteer place detection" (…437) is
-- ENABLED and drives the same pass nightly. Two owners means the same shared
-- corpus is scanned twice; this pass is pure SQL so it costs no model spend,
-- but it is still duplicated write load on `seo.keyword_place` and a second
-- unexplained mover of the same rows.
--
-- Registering it here makes `seo.engine_schedules_claim` stand down for this
-- engine while that task is enabled — the same mechanism topic placement uses.
-- Retiring the standalone task later is a DELETE of this row, not a deploy.
-- ============================================================================

INSERT INTO seo.engine_owner_task (engine_slug, task_id, note)
VALUES (
  'seo.place_detection',
  'a7c1e2d3-0000-4e5f-9a00-000000000437',
  '"SEO — gazetteer place detection": the standalone nightly drives the same gazetteer pass. While it is enabled the console dispatcher stands down for this engine.'
)
ON CONFLICT (engine_slug) DO UPDATE
  SET task_id = excluded.task_id, note = excluded.note;
