-- chair-step: the only non-additive statements are (a) REVOKE EXECUTE on the one function THIS FILE CREATES (default PUBLIC execute removed before the explicit grant, per db-rules 6d-4) and (b) DELETE statements INSIDE that new function's body (a re-plan replaces the plan's own days and blocks, as the client already did); nothing existing loses a privilege, no row is touched by applying this file
-- education_regenerate_study_plan_atomic — A RE-PLAN IS ALL OR NOTHING.
--
-- THE DEFECT (2026-09-25). `planService.regeneratePlan` ran four separate PostgREST calls:
-- hard-DELETE every block, hard-DELETE every day, THEN the guarded UPDATE of the plan row, then
-- insert the new days and blocks. When that update was refused — the person may read the plan
-- but not write it, or the plan was archived meanwhile — `writeOne` now says so, but the
-- children were already gone: the plan was left with no days and no blocks. Any failure in the
-- inserts did the same. Four round trips cannot be one decision.
--
-- THE FIX. One function, one transaction, running AS THE CALLER (SECURITY INVOKER — RLS on
-- study_plan / study_plan_day / study_plan_block decides everything; this function grants
-- nothing). Order:
--   1. UPDATE the plan (the proof the person may write it). Zero rows → 42501 with the plain
--      sentence, and nothing else has happened.
--   2. DELETE the plan's blocks, then days. If any child is still visible afterwards (RLS let the
--      person see it but not delete it), raise — never stack a second plan on top of the first.
--   3. INSERT the new days, then the blocks wired to their day by date. Children carry the
--      PLAN'S organization (read off the updated row), never the selected one.
-- Any error anywhere rolls the whole thing back: the old days and blocks are still there.

create or replace function education.regenerate_study_plan(
  p_plan_id uuid,
  p_plan jsonb,
  p_days jsonb default '[]'::jsonb,
  p_blocks jsonb default '[]'::jsonb
)
 returns uuid
 language plpgsql
 security invoker
 set search_path to ''
as $function$
DECLARE
  v_org uuid;
BEGIN
  -- 1. The plan row first: this IS the permission check.
  UPDATE education.study_plan SET
    title              = p_plan->>'title',
    start_date         = (p_plan->>'start_date')::date,
    end_date           = (p_plan->>'end_date')::date,
    daily_minutes      = (p_plan->>'daily_minutes')::integer,
    daily_item_cap     = (p_plan->>'daily_item_cap')::integer,
    rest_days          = coalesce(
                           ARRAY(SELECT jsonb_array_elements_text(coalesce(p_plan->'rest_days', '[]'::jsonb))::smallint),
                           '{}'::smallint[]),
    goal_id            = (p_plan->>'goal_id')::uuid,
    generated_by       = coalesce(p_plan->>'generated_by', 'heuristic'),
    generator_agent_id = (p_plan->>'generator_agent_id')::uuid,
    rationale          = p_plan->>'rationale',
    config             = coalesce(p_plan->'config', '{}'::jsonb),
    last_planned_at    = now()
  WHERE id = p_plan_id
    AND deleted_at IS NULL
  RETURNING organization_id INTO v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nothing was updated: this study plan no longer exists, or your access does not allow updating it.'
      USING ERRCODE = '42501',
            HINT = 'regenerate_study_plan: the plan update matched 0 rows (RLS refused or the plan is gone); no days or blocks were touched.';
  END IF;

  -- 2. Clear the old children (blocks FK days).
  DELETE FROM education.study_plan_block WHERE plan_id = p_plan_id;
  DELETE FROM education.study_plan_day WHERE plan_id = p_plan_id;

  IF EXISTS (SELECT 1 FROM education.study_plan_block WHERE plan_id = p_plan_id)
     OR EXISTS (SELECT 1 FROM education.study_plan_day WHERE plan_id = p_plan_id) THEN
    RAISE EXCEPTION 'Nothing was updated: some days or blocks on this study plan cannot be removed with your access, so it was left as it was.'
      USING ERRCODE = '42501',
            HINT = 'regenerate_study_plan: child rows remained visible after DELETE (RLS allows SELECT but not DELETE); rolled back.';
  END IF;

  -- 3. The new days, then the blocks wired to their day by the day's date.
  WITH ins_days AS (
    INSERT INTO education.study_plan_day
      (plan_id, organization_id, day_date, target_minutes, is_rest_day, status, rationale)
    SELECT p_plan_id, v_org, d.day_date, coalesce(d.target_minutes, 0), coalesce(d.is_rest_day, false),
           CASE WHEN coalesce(d.is_rest_day, false) THEN 'rest' ELSE 'pending' END,
           d.rationale
      FROM jsonb_to_recordset(coalesce(p_days, '[]'::jsonb))
           AS d(day_date date, target_minutes integer, is_rest_day boolean, rationale text)
    RETURNING id, day_date
  )
  INSERT INTO education.study_plan_block
    (plan_id, organization_id, day_id, day_date, target_kind, item_type, target_ref, label,
     estimated_minutes, estimated_items, method, ordering, status, rationale)
  SELECT p_plan_id, v_org, ins_days.id, b.day_date, coalesce(b.target_kind, 'review'), b.item_type,
         coalesce(b.target_ref, '{}'::jsonb), b.label, coalesce(b.estimated_minutes, 10),
         b.estimated_items, b.method, coalesce(b.ordering, 0), 'pending', b.rationale
    FROM jsonb_to_recordset(coalesce(p_blocks, '[]'::jsonb))
         AS b(parent_day_date date, day_date date, target_kind text, item_type text, target_ref jsonb,
              label text, estimated_minutes integer, estimated_items integer, method text,
              ordering integer, rationale text)
    LEFT JOIN ins_days ON ins_days.day_date = b.parent_day_date;

  RETURN p_plan_id;
END;
$function$;

comment on function education.regenerate_study_plan(uuid, jsonb, jsonb, jsonb) is
  'Adaptive re-plan of one study plan, all or nothing, as the caller (RLS decides). Updates the plan first — zero rows raises 42501 before any child is touched — then replaces its days and blocks. Children carry the plan''s organization.';

revoke all on function education.regenerate_study_plan(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function education.regenerate_study_plan(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;
