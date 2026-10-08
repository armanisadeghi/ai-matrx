-- LANE HANDOVER — A NEW PICKLIST IS KEPT WITH THE CHOICES.
--
-- THE REAL USE CASE: the owner of an organization on the new system makes a picklist "Visit Types".
-- From her seat (admin@admin.com in Cedar Ridge Physical Therapy on production, or admin's Workspace
-- on the clone when it is switched), rolled back:
--   A. the picklist the store makes is platform-owned, for the choices (custom.table_placement);
--   B. so custom.table_list_everywhere keeps it with the tables the app keeps.
-- RUN IT: psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/handover_a_new_picklist_is_kept_with_the_choices.sql
-- ITS RED: on the body before the campaign file A fails (kept_by_the_app false).

\set ON_ERROR_STOP on
\timing off
\set suite 'handover_a_new_picklist_is_kept_with_the_choices.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);
do $$
declare
  v_org uuid;
  v_made jsonb;
  v_id uuid;
  v_place jsonb;
  v_listed jsonb;
begin
  -- an organization admin owns whose store is open (Cedar Ridge on production; any on the clone)
  select o.id into v_org from iam.organizations o
    join iam.organization_member m on m.organization_id = o.id
    join auth.users u on u.id = m.user_id and u.email = 'admin@admin.com'
   where o.archived_at is null and m.role = 'owner' and custom.store_is_open(o.id)
   order by (o.slug = 'cedar-ridge-physical-therapy') desc, o.created_at limit 1;
  v_made := platform._pick_list_born_in_store(v_org, 'Visit Types', 'The kinds of visit the front desk books.', '[{"label":"Initial evaluation"}]'::jsonb);
  v_id := (v_made ->> 'list_id')::uuid;
  select custom.table_placement(t.organization_id, t.id, t.data, false) into v_place
    from custom.record t where t.id = v_id;
  if coalesce((v_place ->> 'kept_by_the_app')::boolean, false) is not true or v_place ->> 'kept_for' <> 'choices' then
    raise exception 'A FAILED: a new picklist is placed %', v_place;
  end if;
  raise notice 'A passed: a new picklist is platform-owned, for the choices';
  select e into v_listed from jsonb_array_elements(custom.table_list_everywhere(v_org) -> 'tables') e where (e ->> 'id')::uuid = v_id;
  if coalesce((v_listed ->> 'kept_by_the_app')::boolean, false) is not true then
    raise exception 'B FAILED: the tables list does not keep it with the app''s tables';
  end if;
  raise notice 'B passed: the tables list keeps it with the app''s tables';
end $$;
rollback;
\echo 'GREEN'
