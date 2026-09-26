-- LANE SWITCH-AFTERMATH — THE GREEN SUITE. After an owner presses Data tables → new system, the
-- older tables are archived. The screens must say where they went:
--   · platform.data_tables_switched_for_me() names the switched organization, when and by whom
--     (/data's home lists that organization's tables where they now live, with the one-line notice);
--   · Trash lists a moved older table by its NAME as "Older table (moved to the new system)";
--   · no single Trash restore brings one older table back beside the switch (the refusal says
--     "Switch back restores all of them together"); Switch back's own door still does;
--   · an older table archived by hand (no move) still restores from Trash as before.
--
-- THE REAL USE CASE: admin@admin.com's Workspace, older table "weather_cities" (the city list his
-- forecast agent reads). The suite archives it with the move's pointer and records a done press
-- for the organization — inside the transaction, rolled back.
--
-- RUN IT (clone; always rolled back):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/switchaftermath_green.sql
-- ITS RED: without the campaign file (and after its inverse) it fails at 0 — no member door.

\set ON_ERROR_STOP on
\timing off

\set suite 'switchaftermath_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- ── fixture (as the database owner) ──
do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_ws    constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace
begin
  if to_regprocedure('platform.data_tables_switched_for_me()') is null
     or to_regprocedure('platform._older_table_moved_by_switch(uuid)') is null then
    raise exception '0: platform.data_tables_switched_for_me / _older_table_moved_by_switch are not there — the switch leaves /data and Trash silent';
  end if;
  if has_function_privilege('anon', 'platform.data_tables_switched_for_me()', 'execute')
     or has_function_privilege('authenticated', 'platform._older_table_moved_by_switch(uuid)', 'execute') then
    raise exception '0b: a door is reachable by a role it must not be';
  end if;
  if (select title_column from platform.entity_types where token = 'dataset') <> 'table_name' then
    raise exception '0c: Trash still titles an older table by its description';
  end if;

  create temp table _sa on commit drop as
    select d.id, d.table_name, row_number() over (order by (d.table_name = 'weather_cities') desc, d.created_at) as n
      from workbench.udt_datasets d
     where d.organization_id = c_ws and d.user_id = c_admin and d.deleted_at is null
     order by n limit 2;
  if (select count(*) from _sa) < 2 then raise exception 'fixture: admin''s Workspace needs two live older tables'; end if;
  grant select on _sa to authenticated;

  -- the first moves with the switch; the second is archived by hand (no move)
  update workbench.udt_datasets
     set deleted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('moved_to',
           jsonb_build_object('store', 'custom.record', 'table_id', id, 'at', now(), 'rows', 0, 'reason', 'switchaftermath_green'))
   where id = (select id from _sa where n = 1);
  -- archived by hand: no move pointer (an earlier mover run may have left one on a live table)
  update workbench.udt_datasets set deleted_at = now(), metadata = coalesce(metadata, '{}'::jsonb) - 'moved_to'
   where id = (select id from _sa where n = 2);

  insert into platform.cutover_seam_press (seam_key, organization_id, direction, outcome, says, pressed_by, did, note)
  values ('older_tables', c_ws, 'new', 'done', 'Switched to the new system.', c_admin, '{}'::jsonb, 'switchaftermath_green fixture');
end
$t$;

create temp table _sa_moved on commit drop as select id, table_name from _sa where n = 1;
create temp table _sa_hand on commit drop as select id, table_name from _sa where n = 2;
grant select on _sa_moved, _sa_hand to authenticated;

-- ── the member's seat ──
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"5d0c3f5e-2f7b-4b36-9d0c-switchafter01"}', true);

do $t$
declare
  c_ws  constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';
  v_moved uuid := (select id from _sa_moved);
  v_name  text := (select table_name from _sa_moved);
  v_hand  uuid := (select id from _sa_hand);
  v_label text;
  v_title text;
  v_err   text;
  v_by    text;
begin
  -- 1. the member door
  select s.switched_by into v_by from platform.data_tables_switched_for_me() s where s.organization_id = c_ws;
  if v_by is null then raise exception '1: the switched organization is not named for its member'; end if;

  -- 2. personal Trash: named, labelled moved
  select t.label, t.title into v_label, v_title from public.trash_list(array['dataset'], 200, 0) t where t.id = v_moved;
  if v_label is distinct from 'Older table (moved to the new system)' then raise exception '2: personal Trash labels a moved older table %', v_label; end if;
  if v_title is distinct from left(v_name, 200) then raise exception '2b: personal Trash titles it % (name %)', v_title, v_name; end if;
  select t.label into v_label from public.trash_list(array['dataset'], 200, 0) t where t.id = v_hand;
  if v_label is distinct from 'Dataset' then raise exception '2c: a hand-archived older table is labelled %', v_label; end if;

  -- 3. organization Trash: the same
  select t.label into v_label from public.org_trash_list(c_ws, array['dataset'], null, 200, 0) t where t.id = v_moved;
  if v_label is distinct from 'Older table (moved to the new system)' then raise exception '3: organization Trash labels it %', v_label; end if;

  -- 4. one restore is refused, by name, with what to do
  begin
    perform public.entity_undelete('dataset', v_moved);
    raise exception '4: entity_undelete brought back one moved older table';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%Switch back restores all of them together%' then raise exception '4b: refusal says %', v_err; end if;
  end;
  begin
    perform public.org_trash_restore(c_ws, 'dataset', v_moved);
    raise exception '5: org_trash_restore brought back one moved older table';
  exception when check_violation then
    get stacked diagnostics v_err = message_text;
    if v_err not like '%Switch back restores all of them together%' then raise exception '5b: refusal says %', v_err; end if;
  end;

  -- 6. a hand-archived older table still restores
  if not public.entity_undelete('dataset', v_hand) then raise exception '6: a hand-archived older table no longer restores'; end if;
end
$t$;

reset role;

-- 7. Switch back's own door still brings it back
do $t$
declare v jsonb;
begin
  v := workbench.udt_dataset_unarchive((select id from _sa_moved));
  if not coalesce((v ->> 'unarchived')::boolean, false) then raise exception '7: Switch back''s door was refused: %', v; end if;
  raise notice 'switchaftermath_green: GREEN';
end
$t$;

rollback;
