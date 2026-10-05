-- LANE ONE-HOME (wave 4, after the switch's soak) — THE SERVER'S LIST VIEWS ANSWER THE STORE.
--
-- Replaces listsafter_green.sql (which pressed the switch and read the older pick-list tables; both
-- are gone). Store only: a pick list is a Table of choices in the record store, and the server's two
-- views workbench.pick_list_live / pick_list_item_live (read by the agents' picklist tool, the
-- picklist REST router and the variable resolver) and the list doors answer from it.
--
-- THE REAL USE CASE: the owner of Cedar Ridge Physical Therapy (admin@admin.com; admin's Workspace on
-- a database where Cedar Ridge is absent) makes the pick list "Hygiene Visit Types" — Recall cleaning,
-- Periodontal maintenance, New patient exam, Emergency visit — then retires "Emergency visit"
-- (the front desk sends emergencies to the urgent line). Everything is rolled back.
--   1. the list view answers the new list, from the store;
--   2. the items view answers exactly its four choices;
--   3. a choice archived in the store leaves the items view (three remain);
--   4. custom.where_lists_live says the list lives in the store;
--   5. get_user_list_with_items answers the three remaining choices.
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/listsstore_the_servers_list_views_answer_the_store.sql
-- ITS RED: plant `lists-view-store-half-dropped` (the items view loses its store half) fails at 2.

\set ON_ERROR_STOP on
\timing off
\set suite 'listsstore_the_servers_list_views_answer_the_store.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);
do $$
declare
  v_org uuid;
  v_id uuid;
  v_labels text[];
  v_lives text;
  v_list jsonb;
  v_answered text;
begin
  select o.id into v_org from iam.organizations o
    join iam.organization_member m on m.organization_id = o.id
    join auth.users u on u.id = m.user_id and u.email = 'admin@admin.com'
   where o.archived_at is null and m.role = 'owner' and custom.store_is_open(o.id)
   order by (o.slug = 'cedar-ridge-physical-therapy') desc, (o.id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f') desc, o.created_at
   limit 1;
  if v_org is null then
    raise exception 'fixture: admin@admin.com owns no organization whose store is open';
  end if;
  v_id := (platform._pick_list_born_in_store(v_org, 'Hygiene Visit Types', 'The visits the front desk books for the hygiene chair.',
    '[{"label":"Recall cleaning"},{"label":"Periodontal maintenance"},{"label":"New patient exam"},{"label":"Emergency visit"}]'::jsonb) ->> 'list_id')::uuid;
  if v_id is null then
    raise exception 'fixture: the store made no pick list';
  end if;

  if not exists (select 1 from workbench.pick_list_live l
                  where l.id = v_id and l.organization_id = v_org and l.list_name = 'Hygiene Visit Types' and l.lives_in = 'record') then
    raise exception '1 FAILED: workbench.pick_list_live does not answer the new list from the store';
  end if;
  raise notice '1 passed: the list view answers the new list from the store';

  select array_agg(i.label order by i.label) into v_labels from workbench.pick_list_item_live i where i.list_id = v_id;
  if v_labels is distinct from array['Emergency visit', 'New patient exam', 'Periodontal maintenance', 'Recall cleaning'] then
    raise exception '2 FAILED: workbench.pick_list_item_live answered % for the four choices', v_labels;
  end if;
  raise notice '2 passed: the items view answers exactly the four choices';

  update custom.record set deleted_at = now()
   where organization_id = v_org and table_id = v_id and data ->> 'name' = 'Emergency visit' and deleted_at is null;
  select array_agg(i.label order by i.label) into v_labels from workbench.pick_list_item_live i where i.list_id = v_id;
  if v_labels is distinct from array['New patient exam', 'Periodontal maintenance', 'Recall cleaning'] then
    raise exception '3 FAILED: after archiving "Emergency visit" the items view answered %', v_labels;
  end if;
  raise notice '3 passed: an archived choice leaves the items view';

  select w.lives_in into v_lives from custom.where_lists_live(array[v_id]) w;
  if v_lives is distinct from 'record' then
    raise exception '4 FAILED: custom.where_lists_live says the list lives in %', v_lives;
  end if;
  raise notice '4 passed: where_lists_live says the store';

  v_list := public.get_user_list_with_items(v_id);
  v_answered := v_list::text;
  if v_answered not like '%Recall cleaning%' or v_answered not like '%New patient exam%'
     or v_answered not like '%Periodontal maintenance%' or v_answered like '%Emergency visit%' then
    raise exception '5 FAILED: get_user_list_with_items answered %', left(v_answered, 600);
  end if;
  raise notice '5 passed: get_user_list_with_items answers the three remaining choices';
end $$;
rollback;
\echo 'LISTS STORE GREEN'
