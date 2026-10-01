-- LANE PRESS-AT-SIZE (2026-10-01, SAFETY-NET W11) — A VIEW MADE IN THE NEW SYSTEM AFTER THE PRESS IS
-- NAMED BY THE UNDO, NEVER LEFT OUT OF ITS SENTENCE.
--
-- THE USE CASE. After the final switch, the Rincon Plumbing dispatcher saves a view "Emergency calls this
-- week" on Service Calls in the new system. The switch is then undone. The older grid has no place for that
-- view (it lives in platform.saved_view under custom/records, keyed by the same table id), so it stays in
-- the new system and shows again after the next press. Measured on the clone 2026-10-01 09:48Z: the undo's
-- sentence named the edited row, the archived row, the share, the new choice and the new table, and said
-- nothing about the view.
--
-- RED on the body before pressatsize_the_undo_names_a_view_made_in_the_new_system.sql: the carry-back plan
-- for admin's Workspace does not mention the view. GREEN after: its "says" holds
-- "Rincon Plumbing — Service Calls: 1 view made in the new system stays there: <name>." and needs_confirm is
-- unchanged (nothing a person typed is left behind).
--
-- The press is a fabricated record (direction new, 1 minute ago, the one table archived); the plan is read
-- with p_apply = false, so nothing is carried. Clone only; everything is rolled back.
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $t$
declare
  v_org constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  v_tab constant uuid := 'dbc7cd48-7b46-4402-ac9d-e459a95f4598';   -- Rincon Plumbing — Service Calls
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_name text := 'Water heater calls this week';
  v_last platform.cutover_seam_press;
  v_plan jsonb; v_says text;
begin
  if (select count(*) from cron.job where active) <> 0 or exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'REFUSED: not the dev clone';
  end if;
  v_last := row(gen_random_uuid(), 'older_tables', v_org, 'new', 'done', null, 'fabricated by the test', v_admin,
                now() - interval '1 minute', '{}'::jsonb, jsonb_build_object('archived', jsonb_build_array(v_tab)), 'test')::platform.cutover_seam_press;
  v_plan := platform._cutover_carry_back(v_org, v_last, false);
  if (select string_agg(x, ' ') from jsonb_array_elements_text(v_plan -> 'says') x) like '%' || v_name || '%' then
    raise exception 'FIXTURE: the view name is already in the plan before the view exists';
  end if;
  insert into platform.saved_view (name, surface_key, subject_id, definition, organization_id, created_by, updated_by)
  values (v_name, 'custom/records', v_tab, jsonb_build_object('filters', '{}'::jsonb, 'table_id', v_tab), v_org, v_admin, v_admin);
  v_plan := platform._cutover_carry_back(v_org, v_last, false);
  select string_agg(x, ' ') into v_says from jsonb_array_elements_text(v_plan -> 'says') x;
  if coalesce(v_says, '') not like '%Rincon Plumbing — Service Calls: 1 view made in the new system stays there: ' || v_name || '.%' then
    raise exception 'RED: the undo''s plan does not name the view made in the new system. It says: %', coalesce(v_says, '(nothing)');
  end if;
  raise notice 'GREEN: the undo names the view made in the new system (%).', v_says;
end $t$;
rollback;
