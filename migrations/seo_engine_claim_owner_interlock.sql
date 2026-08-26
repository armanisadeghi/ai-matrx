-- ============================================================================
-- ONE OWNER PER ENGINE — enforced in the DATABASE (2026-08-25)
--
-- An engine can also be driven by a standalone scheduled task that predates the
-- run console. Two enabled owners = the same corpus classified twice a day and
-- billed twice, and NOTHING looks wrong in either run: both passes are
-- individually correct. Silent and plausible is the worst shape of money bug.
--
-- The interlock was first written in the dispatcher's Python. That leaves the
-- protection sitting in an undeployed build while both tasks are enabled — the
-- system's defence against double-spend would be an accident of configuration
-- (every console row happens to be off) rather than a mechanism. So it moves
-- HERE, into the claim itself: whatever code calls it, deployed or not, cannot
-- claim work for an engine another enabled task already owns.
--
-- `seo.engine_owner_task` maps engine → the competing scheduler task. A row is
-- data, so retiring the standalone task later is a DELETE, not a deploy.
--
-- Also fixes: the claim stamped `updated_at`, which is the console's "last
-- edited" AND the cascade's intra-tier tie-break — a dispatch silently
-- reordered duplicate rows and claimed someone had edited them. Only
-- `last_dispatched_at` moves now.
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo.engine_owner_task (
  engine_slug   text PRIMARY KEY,
  task_id       uuid NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE seo.engine_owner_task IS
  'Engine -> competing standalone scheduler task. While that task is ENABLED the '
  'console dispatcher stands down for the engine, so the corpus can never be paid '
  'for twice. Delete the row when the standalone task is retired.';

INSERT INTO seo.engine_owner_task (engine_slug, task_id, note)
VALUES (
  'seo.topic_placement',
  'a7c1e2d3-0000-4e5f-9a00-000000000433',
  'SEO — topic placement backfill: approved separately, drives the same engine.'
)
ON CONFLICT (engine_slug) DO UPDATE SET task_id = excluded.task_id, note = excluded.note;

-- The claim now refuses stood-down engines outright: a row it will not run is
-- never stamped, so the console can never show a dispatch that did not happen.
CREATE OR REPLACE FUNCTION seo.engine_schedules_claim(p_now timestamptz DEFAULT now())
RETURNS TABLE(engine_slug text, site_id uuid, organization_id uuid,
              max_keywords_per_run integer, schedule_id uuid, scope_tier text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'seo', 'web', 'public', 'pg_temp'
AS $function$
  with candidate as (
    select d.*
      from seo.engine_schedules_due(p_now) d
     where not exists (
       select 1
         from seo.engine_owner_task o
         join scheduler.sch_task t
           on t.id = o.task_id AND t.deleted_at IS NULL AND t.enabled
        where o.engine_slug = d.engine_slug
     )
  ),
  locked as (
    select e.id
      from seo.engine_schedule e
     where e.id in (select distinct c.schedule_id from candidate c)
       for update skip locked
  ),
  claimed as (
    update seo.engine_schedule e
       set last_dispatched_at = p_now
     where e.id in (select l.id from locked l)
    returning e.id
  )
  select c.engine_slug, c.site_id, c.organization_id,
         c.max_keywords_per_run, c.schedule_id, c.scope_tier
    from candidate c
    join claimed k on k.id = c.schedule_id;
$function$;

REVOKE ALL ON FUNCTION seo.engine_schedules_claim(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.engine_schedules_claim(timestamptz) TO service_role;
