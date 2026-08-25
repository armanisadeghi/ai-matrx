
-- ONE OWNER PER ENGINE (2026-08-25). The dispatcher asks, every tick, whether a
-- competing standalone scheduled task already drives an engine. Reading
-- scheduler.sch_task directly from the service role is fine, but the dispatcher goes
-- through the ORM's call_function funnel, so it needs a function to call.
CREATE OR REPLACE FUNCTION scheduler.sch_tasks_enabled_by_id(p_task_ids uuid[])
RETURNS TABLE(id uuid, enabled boolean, title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT t.id, t.enabled, t.title
  FROM scheduler.sch_task t
  WHERE t.id = ANY(p_task_ids) AND t.deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION scheduler.sch_tasks_enabled_by_id(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scheduler.sch_tasks_enabled_by_id(uuid[]) TO service_role;


-- ONE OWNER PER ENGINE (2026-08-25) — the read behind the dispatcher's interlock.
-- Takes jsonb because the ORM's call_function funnel serialises a Python list that
-- way; the uuid[] overload is kept for direct SQL callers.
CREATE OR REPLACE FUNCTION scheduler.sch_tasks_enabled_by_id(p_task_ids jsonb)
RETURNS TABLE(id uuid, enabled boolean, title text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT t.id, t.enabled, t.title
  FROM scheduler.sch_task t
  WHERE t.deleted_at IS NULL
    AND t.id IN (SELECT (jsonb_array_elements_text(p_task_ids))::uuid);
$function$;

REVOKE ALL ON FUNCTION scheduler.sch_tasks_enabled_by_id(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION scheduler.sch_tasks_enabled_by_id(jsonb) TO service_role;
