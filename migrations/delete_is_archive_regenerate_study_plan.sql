-- based-on: education.regenerate_study_plan(uuid, jsonb, jsonb, jsonb) 96bb0b47a7675048dbb56fc9a2f559bc95dd370076b1ffcc214f32851d9d7104
-- Delete means archive (Arman, 2026-09-27): regenerating a study plan hard-
-- deleted its days and blocks. It now archives them (deleted_at); every reader
-- already filters deleted_at (planService.getPlan, search projection, export).
-- A regenerated date the plan already had revives its archived day row
-- (study_plan_day_uniq is a full unique index on plan_id, day_date).
-- Body is the live pg_get_functiondef read immediately before writing.

CREATE OR REPLACE FUNCTION education.regenerate_study_plan(p_plan_id uuid, p_plan jsonb, p_days jsonb DEFAULT '[]'::jsonb, p_blocks jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  -- 2. Archive the old children (delete means archive, 2026-09-27): the
  --    previous schedule stays in the rows, marked deleted_at, never removed.
  UPDATE education.study_plan_block SET deleted_at = now()
   WHERE plan_id = p_plan_id AND deleted_at IS NULL;
  UPDATE education.study_plan_day SET deleted_at = now()
   WHERE plan_id = p_plan_id AND deleted_at IS NULL;

  IF EXISTS (SELECT 1 FROM education.study_plan_block WHERE plan_id = p_plan_id AND deleted_at IS NULL)
     OR EXISTS (SELECT 1 FROM education.study_plan_day WHERE plan_id = p_plan_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Nothing was updated: some days or blocks on this study plan cannot be changed with your access, so it was left as it was.'
      USING ERRCODE = '42501',
            HINT = 'regenerate_study_plan: live child rows remained after archiving them (RLS allows SELECT but not UPDATE); rolled back.';
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
    -- study_plan_day_uniq (plan_id, day_date) is a full index: a date the plan
    -- already had revives that archived day row instead of colliding with it.
    ON CONFLICT (plan_id, day_date) DO UPDATE
      SET target_minutes = EXCLUDED.target_minutes,
          is_rest_day    = EXCLUDED.is_rest_day,
          status         = EXCLUDED.status,
          rationale      = EXCLUDED.rationale,
          deleted_at     = NULL
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
$function$
;
