-- LANE PRESS-AT-SIZE (2026-10-01, SAFETY-NET W12) — A PICK LIST SOMETHING CHOOSES FROM IS NEVER
-- ARCHIVED "WITH NO OWNER": IT GOES WHERE IT IS CHOSEN FROM.
--
-- THE USE CASE. A dispatcher at Rincon Plumbing made a pick list "Water heater brands" before lists had
-- organizations; she belongs to several organizations, so her membership cannot say where it lives. A
-- column "Brand" on her organization's "Water Heater Installs" table chooses from it. The final switch
-- archives a list it cannot place "with no owner organization", with no copy in the store, and after
-- the press the column's picker reads nothing (public.get_structured_list_for_selection answers null).
--
-- RED on the body before pressatsize_a_list_something_chooses_from_goes_where_it_is_chosen.sql:
--   P1 the planted list resolves 'no_owner' although one organization's column chooses from it;
--   P2 (real data, when present) "scene options", which the agent "Generate custom speech" chooses
--      from, resolves 'no_owner'.
-- GREEN after: both resolve 'organization' with the chooser's organization; a list nothing chooses
-- from (P3, planted) still resolves by its maker exactly as before.
--
-- Clone only (refuses a database with active cron jobs or pg_net); everything is rolled back.
\set ON_ERROR_STOP on
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
do $t$
declare
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com, in many organizations
  v_org   constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
  v_list uuid := gen_random_uuid(); v_lone uuid := gen_random_uuid(); v_tab uuid := gen_random_uuid();
  v_r jsonb; v_fail text[] := '{}';
begin
  if (select count(*) from cron.job where active) <> 0 or exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'REFUSED: not the dev clone';
  end if;
  -- The planted lists are the shape production still holds (seven, made before lists had an
  -- organization); writing one fresh is refused by the organization guard, so the fixture rows go in
  -- with triggers off for these three inserts only, inside this rolled-back transaction.
  set local session_replication_role = replica;
  insert into workbench.udt_structured_lists (id, list_name, user_id, created_by, organization_id, visibility)
  values (v_list, 'Water heater brands', v_admin, v_admin, null, 'personal'),
         (v_lone, 'Water heater sizes', v_admin, v_admin, null, 'personal');
  insert into workbench.udt_datasets (id, table_name, user_id, created_by, organization_id, visibility)
  values (v_tab, 'Water Heater Installs', v_admin, v_admin, v_org, 'internal');
  insert into workbench.udt_dataset_fields (table_id, field_name, display_name, data_type, field_order, user_id, created_by, organization_id, metadata)
  values (v_tab, 'brand', 'Brand', 'string', 1, v_admin, v_admin, v_org,
          jsonb_build_object('format', jsonb_build_object('id', 'choice', 'options',
            jsonb_build_object('structuredList', jsonb_build_object('listId', v_list::text)))));
  set local session_replication_role = origin;

  select e into v_r from jsonb_array_elements(platform._final_switch_orphan_lists()) e where e ->> 'id' = v_list::text;
  if v_r ->> 'resolution' is distinct from 'organization' or v_r ->> 'organization_id' is distinct from v_org::text then
    v_fail := v_fail || format('P1 the list a column chooses from resolved %s (%s), not admin''s Workspace', v_r ->> 'resolution', v_r ->> 'why');
  end if;

  select e into v_r from jsonb_array_elements(platform._final_switch_orphan_lists()) e where e ->> 'id' = '6a7822ca-859c-4903-87a3-c8243058dcc5';
  if v_r is not null and v_r ->> 'resolution' is distinct from 'organization' then
    v_fail := v_fail || format('P2 "scene options" (the agent "Generate custom speech" chooses from it) resolved %s (%s)', v_r ->> 'resolution', v_r ->> 'why');
  end if;

  select e into v_r from jsonb_array_elements(platform._final_switch_orphan_lists()) e where e ->> 'id' = v_lone::text;
  if v_r ->> 'resolution' is distinct from 'no_owner' or v_r ->> 'why' not like 'its maker belongs to % organizations' then
    v_fail := v_fail || format('P3 a list nothing chooses from changed resolution: %s (%s)', v_r ->> 'resolution', v_r ->> 'why');
  end if;

  if cardinality(v_fail) > 0 then
    raise exception 'RED: %', array_to_string(v_fail, ' | ');
  end if;
  raise notice 'GREEN: a list something chooses from goes where it is chosen (P1, P2, P3)';
end $t$;
rollback;
