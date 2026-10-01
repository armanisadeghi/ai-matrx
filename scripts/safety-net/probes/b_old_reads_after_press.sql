-- LANE SAFETY-NET-B (2026-10-01) — W4: AFTER THE PRESS, NO OLDER READ DOOR ANSWERS A MOVED TABLE WITH A FROZEN VALUE.
-- CLONE ONLY, ONE REPEATABLE-READ TRANSACTION, ROLLED BACK.
--
-- After the press a person edits a row in the new system. Every one of the 16 older READ doors
-- (scripts/check-old-system-unreachable.ts OLD_READ_DOORS) that is asked for that table must either refuse, mark the
-- answer moved (`moved_to`), or answer the NEW value. A door that answers the OLD value with no mark is a missed
-- reader showing a stale value with no error (W4) — RED, naming each such door.
--   node scripts/safety-net/run.mjs --target clone --only cutover.old-reads-after-press
-- Stand-ins as in b_switch_chain.sql (named there).
\set ON_ERROR_STOP on
\timing off
\pset tuples_only on

begin isolation level repeatable read;
set local statement_timeout = '20min';
set local lock_timeout = '30s';

do $guard$
begin
  if (select count(*) from cron.job where active) <> 0 or exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'refused: this is not the quarantined clone — the read-door check never runs on production';
  end if;
end
$guard$;

do $w4$
declare
  c_admin    constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com (platform admin)
  c_ws       constant uuid := '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f';   -- admin's Workspace (switched by the press)
  c_cedar    constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';   -- Cedar Ridge Physical Therapy (already switched)
  c_claims   constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"safety-net-b"}';
  c_page     constant text := '{"origin":"https://manage.aimatrx.com","x-matrx-admin-lane":"1"}';  -- the admin lane header the Final switch page sends
  v_r jsonb; v_p jsonb; v_u jsonb; v_o jsonb; v_x jsonb;
  v_table uuid; v_row uuid; v_list uuid; v_store_table uuid;
  v_plan uuid[]; v_switched uuid[]; v_outside uuid[];
  -- A work order in the column's own pattern (WO-dddd), unique to this run.
  v_marker text := 'WO-' || (5000 + (extract(epoch from clock_timestamp())::bigint % 4000))::text;
  v_err text; v_state text; v_n int; v_lag int;
  v_report text[] := '{}';
  v_run uuid := gen_random_uuid();
  v_old text; v_ans text; v_door text; v_frozen text[] := '{}'; v_ok text[] := '{}';
begin
  -- ── stand-ins (named; rolled back with everything else) ─────────────────────────────────────────────────────
  -- (b0) W1, the other half (READINESS-PARITY's, not this chain's): a scope live in the current tables with NO live
  -- Record in the store, in an organization that writes scopes to the store (clone: Alex Hart's Workspace →
  -- "Biology 101 — Live Test"; production 0 at 03:15 PT). Set aside here by archiving that current-table row, counted.
  perform set_config('app.actor_system', 'safety-net-b stand-in (clone, rolled back)', true);
  update context.scopes s set deleted_at = clock_timestamp()
   where s.deleted_at is null and custom.context_writer(s.organization_id) = 'store'
     and not exists (select 1 from custom.record r where r.id = s.id and r.organization_id = s.organization_id and r.deleted_at is null);
  get diagnostics v_n = row_count;
  perform set_config('app.actor_system', '', true);
  if v_n > 0 then v_report := v_report || format('stand-in: %s current-table scopes with no store Record set aside (W1)', v_n); end if;
  update custom.io_outbox set consumed_at = clock_timestamp()
   where event_key = 'context.follow' and consumed_at is null and deleted_at is null;
  get diagnostics v_lag = row_count;
  perform platform.final_switch_copy_again_record(v_run, 'start', null, true, '{"says": "safety-net-b: stand-in green Step 1"}'::jsonb);
  perform platform.final_switch_copy_again_record(v_run, 'finish', null, true, '{"says": "safety-net-b: stand-in green Step 1"}'::jsonb);
  v_report := v_report || format('stand-ins: %s waiting follow rows marked consumed; one green Step 1 recorded', v_lag);

  -- (b2) W1 (lane READINESS-PARITY's, not this chain's): a scope live in the current tables whose store Record was
  -- archived by a junk sweep (production: Alex Hart's Workspace → "Biology 101 — Live Test"). Readiness now names it,
  -- correctly; this chain tests the press's OTHER mechanics, so here the Record is brought back the way the repair
  -- would, inside this rolled-back transaction, and counted.
  perform set_config('app.actor_system', 'safety-net-b stand-in (clone, rolled back)', true);
  update custom.record r set deleted_at = null
   where r.deleted_at is not null
     and exists (select 1 from context.scopes s where s.id = r.id and s.organization_id = r.organization_id and s.deleted_at is null);
  get diagnostics v_n = row_count;
  -- The declared system ends with the stand-in: the press must run as the person, never under this name (a named
  -- system's write to a test copy is refused by the copy fence — which would fail the press's own re-sync).
  perform set_config('app.actor_system', '', true);
  if v_n > 0 then v_report := v_report || format('stand-in: %s scope Records brought back beside their live current-table scopes (W1)', v_n); end if;
  -- (c) Step 1's own removal carry (platform.cutover_carry_removals — the door Copy again calls) for every organization
  -- whose only difference is "something removed on the older side is still on its copy" (peers' fixtures, all night).
  v_r := platform._final_switch_readiness();
  for v_o in select x from jsonb_array_elements(v_r -> 'organizations') x
              where (x ->> 'needs_copy_again')::boolean
                and not exists (select 1 from jsonb_array_elements(x -> 'rerun_clears') c where c ->> 'key' <> 'removals_carried') loop
    perform platform.cutover_carry_removals((v_o ->> 'id')::uuid, null);
    v_report := v_report || format('stand-in: Step 1''s removal carry for %s', v_o ->> 'name');
  end loop;
  -- (c2) Rows peers add to older tables AFTER Step 1 (clone fixtures, all night) — set aside (archived) inside this
  -- rolled-back transaction, counted; P1 then plants its own un-copied row and must still be named.
  update workbench.udt_dataset_rows r set deleted_at = clock_timestamp()
   where r.deleted_at is null
     and exists (select 1 from workbench.udt_datasets d where d.id = r.table_id and d.deleted_at is null
                  and exists (select 1 from custom.record t where t.id = d.id and t.data_class = 'table' and t.deleted_at is null))
     and not exists (select 1 from custom.record c where c.id = r.id);
  get diagnostics v_n = row_count;
  if v_n > 0 then v_report := v_report || format('stand-in: %s older rows with no copy (added after Step 1) set aside', v_n); end if;
  -- (d) Step 1's own orphan-list adoption (platform.final_switch_adopt_orphan_lists — the door Step 1 calls first).
  if coalesce((platform._final_switch_readiness() ->> 'adopt_orphans')::int, 0) > 0 then
    perform platform.final_switch_adopt_orphan_lists(v_run);
    v_report := v_report || 'stand-in: Step 1''s orphan-list adoption'::text;
  end if;
  v_r := platform._final_switch_readiness();
  if not (v_r ->> 'ready')::boolean then
    raise exception 'C01 PRECONDITION: the clone is not Ready even after the stand-ins: % — blocking: %',
      v_r ->> 'says', left(coalesce((v_r -> 'blocking')::text, ''), 600);
  end if;
  select array_agg((x ->> 'id')::uuid order by x ->> 'id') into v_plan
    from jsonb_array_elements(v_r -> 'organizations') x
   where (x -> 'plan' ->> 'press_tables')::boolean or (x -> 'plan' ->> 'press_context')::boolean
      or (x -> 'plan' ->> 'sweep_tables')::int > 0 or (x -> 'plan' ->> 'sweep_lists')::int > 0;
  if not (c_ws = any (v_plan)) then
    raise exception 'C02 PRECONDITION: admin''s Workspace is not in the press''s plan on this clone (plan: % organizations)', cardinality(v_plan);
  end if;
  -- The older table the chain writes through: admin's Workspace's live, copied "Rincon Plumbing — Service Calls".
  select d.id into v_table from workbench.udt_datasets d
   where d.organization_id = c_ws and d.deleted_at is null and d.table_name = 'Rincon Plumbing — Service Calls'
     and exists (select 1 from custom.record c where c.id = d.id and c.data_class = 'table' and c.deleted_at is null) limit 1;
  if v_table is null then raise exception 'PRECONDITION: admin''s Workspace has no live, copied "Rincon Plumbing — Service Calls" on this clone'; end if;
  select r.id into v_row from workbench.udt_dataset_rows r
   where r.table_id = v_table and r.deleted_at is null
     and exists (select 1 from custom.record c where c.id = r.id and c.deleted_at is null) order by r.created_at limit 1;
  v_report := v_report || format('Ready: %s; plan %s organizations; probe table %s row %s', v_r ->> 'says', cardinality(v_plan), v_table, v_row);
  -- A02: where the agents' dataset tool (and every integration) is told the table lives — before the press: older.
  if (select w.lives_in from custom.where_tables_live(array[v_table]) w) is distinct from 'older' then
    raise exception 'A02 RED: before the press custom.where_tables_live does not send agents to the older table: %',
      (select row_to_json(w)::text from custom.where_tables_live(array[v_table]) w);
  end if;

  -- ── press, then a person's edit in the new system ──────────────────────────────────────────────────────────
  v_old := (select r.data ->> 'work_order' from workbench.udt_dataset_rows r where r.id = v_row);
  perform set_config('request.jwt.claims', c_claims, true);
  perform set_config('request.headers', c_page, true);
  perform set_config('role', 'authenticated', true);
  v_p := platform.final_switch_press('safety-net-b W4', null);
  if not coalesce((v_p ->> 'ok')::boolean, false) then
    perform set_config('role', 'postgres', true);
    raise exception 'W4 PRECONDITION: the press refused on a Ready clone: %', left((v_p - 'readiness')::text, 600);
  end if;
  perform custom.record_update(c_ws, v_row, jsonb_build_object('work_order', v_marker));
  -- ── every older read door, asked as the table's owner ──────────────────────────────────────────────────────
  foreach v_door in array array[
    format('select public.get_full_table(%L::jsonb)::text', jsonb_build_object('table_id', v_table)),
    format('select public.get_table_row(%L::jsonb)::text', jsonb_build_object('table_id', v_table, 'row_id', v_row)),
    format('select public.get_table_cell(%L::jsonb)::text', jsonb_build_object('table_id', v_table, 'row_id', v_row, 'column_name', 'work_order')),
    format('select public.get_table_column(%L::jsonb)::text', jsonb_build_object('table_id', v_table, 'column_name', 'work_order')),
    format('select public.list_table_rows(%L::jsonb, 500)::text', jsonb_build_object('table_id', v_table)),
    format('select public.list_table_columns(%L::jsonb)::text', jsonb_build_object('table_id', v_table)),
    format('select public.get_user_table_complete(%L::uuid)::text', v_table),
    format('select public.get_user_table_data_paginated(%L::uuid, 500)::text', v_table),
    format('select public.get_user_table_data_paginated_v2(%L::uuid, 500)::text', v_table),
    format('select public.export_user_table_as_csv(%L::uuid, null::text, ''asc''::text)', v_table),
    format('select public.udt_column_facets(%L::uuid, %L)::text', v_table, 'work_order'),
    format('select public.udt_table_profile(%L::uuid)::text', v_table),
    'select public.get_user_tables()::text',
    format('select public.list_udt_dataset_templates(%L::uuid)::text', c_ws)
  ] loop
    begin
      execute v_door into v_ans;
      if v_ans is null then
        v_ok := v_ok || (split_part(split_part(v_door, 'public.', 2), '(', 1) || ': nothing');
      elsif position(v_marker in v_ans) > 0 then
        v_ok := v_ok || (split_part(split_part(v_door, 'public.', 2), '(', 1) || ': the NEW value');
      elsif position('moved_to' in v_ans) > 0 or position('moved to the new system' in v_ans) > 0 then
        -- The old value WITH the pointer: every client that reads the mark goes to the copy (FINAL-SWITCH's design).
        v_ok := v_ok || (split_part(split_part(v_door, 'public.', 2), '(', 1) || ': marked moved (pointer to the copy)');
      elsif position(v_old in v_ans) > 0 then
        v_frozen := v_frozen || (split_part(split_part(v_door, 'public.', 2), '(', 1));
      else
        v_ok := v_ok || (split_part(split_part(v_door, 'public.', 2), '(', 1) || ': names neither value');
      end if;
    exception when others then
      v_ok := v_ok || (split_part(split_part(v_door, 'public.', 2), '(', 1) || ': refused (' || left(sqlerrm, 80) || ')');
    end;
  end loop;
  perform set_config('role', 'postgres', true);
  if cardinality(v_frozen) > 0 then
    raise exception E'W4 RED: % older read doors answer the moved table with the OLD value % and no mark (the new value is %): %\n  the rest: %',
      cardinality(v_frozen), v_old, v_marker, array_to_string(v_frozen, ', '), array_to_string(v_ok, '; ');
  end if;
  raise notice E'W4 GREEN: no older read door answers a moved table with a frozen value\n  %', array_to_string(v_ok, E'\n  ');
end
$w4$;

rollback;
