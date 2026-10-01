-- LANE SAFETY-NET-B (2026-10-01) — THE SWITCH CHAIN, CLONE ONLY, ONE TRANSACTION, ROLLED BACK.
--
-- What one pass proves (NIGHT-PLAN-2026-10-01 §4 "Cutover mechanics"):
--   C01  readiness is TRUTHFUL: three planted holds each turn Ready into a refusal that names the organization —
--        (P1) a row in an older table that is not in its copy, (P2) an older row edited after it was copied,
--        (P3) live field definitions under an archived Table — and for every plant the press agrees with readiness
--        (Ready ⇒ the press goes through; not Ready ⇒ the press refuses "not_ready" and switches nothing).
--   C02  the press switches EXACTLY the organizations readiness planned, and writes no press row for any other.
--   C04  after the press every older write door refuses: a signed-in caller cannot reach it (EXECUTE revoked), and
--        the server's own path is refused by the moved-table trigger in a person's words, naming the copy's address.
--   C05  lists follow: a planned organization keeps no live older pick list; each list's copy is a live Table.
--   C06  births happen only in the store: the platform value is "born moved", and a new older table is refused
--        for a switched organization with the sentence that sends the person to New table.
--   C03  undo: a person edits a copy after the press; the undo carries that edit back into the older row
--        (rehearsal 15c's WO-5506 proof), the doors open again and the platform value returns.
--
-- RUN (matrx-frontend root):   node scripts/safety-net/run.mjs --target clone --only cutover.switch-chain
--        or directly:          psql "$CLONE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/safety-net/probes/b_switch_chain.sql
-- PROVE RED:                   node scripts/safety-net/run.mjs --target clone --plant b-readiness-ignores-uncopied-rows
--                              (and the other plants/b-*.mjs aimed at this check)
--
-- STAND-INS, named (the shared clone is never quiet; peers edit it all night): inside this rolled-back transaction the
-- suite (a) marks the clone's waiting context-follow rows consumed and (b) records one green Step 1 run, exactly as
-- finalswitch_green.sql does. On production neither is needed: the hour runs Step 1 for real right before the press.
-- If the clone is still not Ready after them, the suite FAILS with readiness's own sentence (it never skips).
\set ON_ERROR_STOP on
\timing off
\pset tuples_only on

-- One snapshot for the whole chain: the shared clone is written by peers all night, and under READ COMMITTED each
-- readiness call would see their newest commits (a peer's fixture between two calls reads as "not Ready").
begin isolation level repeatable read;
set local statement_timeout = '20min';
set local lock_timeout = '30s';

do $guard$
begin
  if (select count(*) from cron.job where active) <> 0 or exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'refused: this is not the quarantined clone (active cron jobs or pg_net present) — the switch chain never runs on production';
  end if;
end
$guard$;

do $chain$
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
begin
  -- ── stand-ins (named; rolled back with everything else) ─────────────────────────────────────────────────────
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

  -- ── C01: three planted holds, each in its own subtransaction ────────────────────────────────────────────────
  -- P1 — a row in the older table that its copy does not have.
  begin
    insert into workbench.udt_dataset_rows (table_id, organization_id, user_id, data)
    select v_table, c_ws, c_admin, r.data || jsonb_build_object('work_order', v_marker || '-NEW')
      from workbench.udt_dataset_rows r where r.id = v_row;
    v_x := platform._final_switch_readiness();
    perform set_config('request.jwt.claims', c_claims, true);
    perform set_config('request.headers', c_page, true);
    perform set_config('role', 'authenticated', true);
    v_p := platform.final_switch_press('safety-net-b P1', null);
    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'SNB01', message = jsonb_build_object('r', v_x - 'organizations' - 'platform',
      'org', (select o from jsonb_array_elements(v_x -> 'organizations') o where (o ->> 'id')::uuid = c_ws), 'p', v_p - 'readiness')::text;
  exception when sqlstate 'SNB01' then v_x := sqlerrm::jsonb;
  end;
  perform set_config('role', 'postgres', true);
  if (v_x -> 'r' ->> 'ready')::boolean then
    raise exception 'C01/P1 RED: readiness says Ready while admin''s Workspace has an older row its copy does not have: %', v_x -> 'r' ->> 'says';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_x -> 'org' -> 'rerun_clears') c where c ->> 'key' = 'rows_present') then
    raise exception 'C01/P1 RED: the refusal does not name the missing row for admin''s Workspace: %', left((v_x -> 'org')::text, 500);
  end if;
  if v_x -> 'p' ->> 'reason' is distinct from 'not_ready' then
    raise exception 'C01/P1 RED: the press did not refuse "not_ready" with an un-copied row: %', left((v_x -> 'p')::text, 500);
  end if;
  v_report := v_report || format('P1 un-copied row → %s', v_x -> 'p' ->> 'says');

  -- P2 — an older row edited after it was copied.
  begin
    update workbench.udt_dataset_rows set data = data || jsonb_build_object('work_order', v_marker || '-STALE'), updated_at = clock_timestamp()
     where id = v_row;
    v_x := platform._final_switch_readiness();
    perform set_config('request.jwt.claims', c_claims, true);
    perform set_config('request.headers', c_page, true);
    perform set_config('role', 'authenticated', true);
    v_p := platform.final_switch_press('safety-net-b P2', null);
    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'SNB01', message = jsonb_build_object('r', v_x - 'organizations' - 'platform',
      'org', (select o from jsonb_array_elements(v_x -> 'organizations') o where (o ->> 'id')::uuid = c_ws), 'p', v_p - 'readiness')::text;
  exception when sqlstate 'SNB01' then v_x := sqlerrm::jsonb;
  end;
  perform set_config('role', 'postgres', true);
  if (v_x -> 'r' ->> 'ready')::boolean then
    raise exception 'C01/P2 RED: readiness says Ready while an older row was edited after its copy: %', v_x -> 'r' ->> 'says';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_x -> 'org' -> 'rerun_clears') c where c ->> 'key' = 'rows_current') then
    raise exception 'C01/P2 RED: the refusal does not name the stale copy for admin''s Workspace: %', left((v_x -> 'org')::text, 500);
  end if;
  if v_x -> 'p' ->> 'reason' is distinct from 'not_ready' then
    raise exception 'C01/P2 RED: the press did not refuse "not_ready" with a stale copy: %', left((v_x -> 'p')::text, 500);
  end if;
  v_report := v_report || format('P2 stale copy → %s', v_x -> 'p' ->> 'says');

  -- P3 — live field definitions under an archived Table (the night window's finding: archiving a Table leaves its
  -- fields live; 42 such on production). Readiness must agree with the press: either both go, or readiness names it.
  select t.id into v_store_table from custom.record t
   where t.organization_id = c_ws and t.data_class = 'table' and t.deleted_at is null
     and not exists (select 1 from workbench.udt_datasets d where d.id = t.id)
     and exists (select 1 from custom.record f where f.table_id = custom.field_kernel_id() and f.deleted_at is null
                  and f.data ->> 'entity_definition_id' = t.id::text)
   order by t.created_at desc limit 1;
  begin
    if v_store_table is null then raise exception using errcode = 'SNB02', message = 'no store-born Table with fields in admin''s Workspace'; end if;
    -- The Table record is archived WITHOUT its door (the door now archives its field definitions too — lane
    -- FIELD-ARCHIVE-CASCADE); production's 42 such fields were left by paths that archived only the Table record.
    perform set_config('app.actor_system', 'safety-net-b plant (clone, rolled back)', true);
    update custom.record set deleted_at = clock_timestamp() where id = v_store_table and organization_id = c_ws;
    perform set_config('app.actor_system', '', true);
    v_n := (select count(*) from custom.record f where f.table_id = custom.field_kernel_id() and f.deleted_at is null
              and f.data ->> 'entity_definition_id' = v_store_table::text);
    v_x := platform._final_switch_readiness();
    perform set_config('request.jwt.claims', c_claims, true);
    perform set_config('request.headers', c_page, true);
    perform set_config('role', 'authenticated', true);
    v_p := platform.final_switch_press('safety-net-b P3', null);
    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'SNB01', message = jsonb_build_object('r', v_x - 'organizations' - 'platform', 'fields_live', v_n,
      'org', (select o from jsonb_array_elements(v_x -> 'organizations') o where (o ->> 'id')::uuid = c_ws), 'p', v_p - 'readiness')::text;
  exception
    when sqlstate 'SNB01' then v_x := sqlerrm::jsonb;
    when sqlstate 'SNB02' then v_x := jsonb_build_object('skip', sqlerrm);
  end;
  perform set_config('role', 'postgres', true);
  if v_x ? 'skip' then
    v_report := v_report || format('P3 not planted: %s', v_x ->> 'skip');
  elsif v_x -> 'p' ->> 'says' like '%could not serialize access%' then
    raise exception 'INCONCLUSIVE: a peer wrote rows the press touches while this run held its snapshot (%); run again', left(v_x -> 'p' ->> 'says', 300);
  elsif (v_x -> 'r' ->> 'ready')::boolean and not coalesce((v_x -> 'p' ->> 'ok')::boolean, false) then
    raise exception 'C01/P3 RED: readiness said Ready with % live fields under an archived Table, and the press then failed: %',
      v_x ->> 'fields_live', left((v_x -> 'p')::text, 600);
  elsif not (v_x -> 'r' ->> 'ready')::boolean and v_x -> 'p' ->> 'reason' is distinct from 'not_ready' then
    raise exception 'C01/P3 RED: readiness was not Ready but the press did not refuse "not_ready": %', left((v_x -> 'p')::text, 500);
  else
    v_report := v_report || format('P3 %s live fields under an archived Table → readiness %s, press %s (%s)', v_x ->> 'fields_live',
      case when (v_x -> 'r' ->> 'ready')::boolean then 'Ready' else 'not Ready' end,
      case when (v_x -> 'p' ->> 'ok')::boolean then 'went through' else 'refused' end, left(v_x -> 'p' ->> 'says', 200));
  end if;

  -- P4 (W16) — a table born on the older side AFTER Step 1 (the agents' dataset tool still does this in an unswitched
  -- organization until the press). Readiness must say Copy again is needed and name the table; the press refuses.
  begin
    insert into workbench.udt_datasets (table_name, organization_id, user_id, created_by, visibility)
    select 'Supply Reorders — born after Step 1', c_ws, c_admin, c_admin, d.visibility from workbench.udt_datasets d limit 1;
    v_x := platform._final_switch_readiness();
    perform set_config('request.jwt.claims', c_claims, true);
    perform set_config('request.headers', c_page, true);
    perform set_config('role', 'authenticated', true);
    v_p := platform.final_switch_press('safety-net-b P4', null);
    perform set_config('role', 'postgres', true);
    raise exception using errcode = 'SNB01', message = jsonb_build_object('r', v_x - 'organizations' - 'platform',
      'org', (select o from jsonb_array_elements(v_x -> 'organizations') o where (o ->> 'id')::uuid = c_ws), 'p', v_p - 'readiness')::text;
  exception when sqlstate 'SNB01' then v_x := sqlerrm::jsonb;
  end;
  perform set_config('role', 'postgres', true);
  if (v_x -> 'r' ->> 'ready')::boolean then
    raise exception 'C13/W16 RED: readiness says Ready with an older table born after Step 1: %', v_x -> 'r' ->> 'says';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_x -> 'org' -> 'rerun_clears') c
                  where c ->> 'key' = 'copied' and c ->> 'detail' like '%Supply Reorders — born after Step 1%') then
    raise exception 'C13/W16 RED: the refusal does not name the table born after Step 1: %', left((v_x -> 'org' -> 'rerun_clears')::text, 500);
  end if;
  if v_x -> 'p' ->> 'reason' is distinct from 'not_ready' then
    raise exception 'C13/W16 RED: the press did not refuse "not_ready" with a table born after Step 1: %', left((v_x -> 'p')::text, 400);
  end if;
  v_report := v_report || format('P4 a table born after Step 1 → %s', v_x -> 'p' ->> 'says');

  -- ── the press (C02) ─────────────────────────────────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', c_claims, true);
  perform set_config('request.headers', c_page, true);
  perform set_config('role', 'authenticated', true);
  v_p := platform.final_switch_press('safety-net-b chain', null);
  perform set_config('role', 'postgres', true);
  if not coalesce((v_p ->> 'ok')::boolean, false) then
    if v_p ->> 'says' like '%could not serialize access%' then
      raise exception 'INCONCLUSIVE: a peer wrote rows the press touches while this run held its snapshot (%); run again', left(v_p ->> 'says', 300);
    end if;
    raise exception 'C02 RED: the press refused on a Ready clone: %', left((v_p - 'readiness')::text, 700);
  end if;
  select array_agg(distinct p.organization_id order by p.organization_id) into v_switched
    from platform.cutover_seam_press p
   where p.pressed_at >= now() and p.outcome = 'done' and p.seam_key in ('older_tables', 'agent_context');
  select array_agg(x order by x) into v_outside from unnest(coalesce(v_switched, '{}')) x where not (x = any (v_plan));
  if cardinality(coalesce(v_outside, '{}')) > 0 then
    raise exception 'C02 RED: the press switched % organizations that readiness did not plan: %', cardinality(v_outside), v_outside;
  end if;
  select count(*) into v_n from jsonb_array_elements(v_r -> 'organizations') x
   where (x -> 'plan' ->> 'press_tables')::boolean
     and coalesce((platform._cutover_seam_last_done('older_tables', (x ->> 'id')::uuid)).direction, 'old') <> 'new';
  if v_n > 0 then raise exception 'C02 RED: % planned organizations were not switched by the press', v_n; end if;
  v_report := v_report || format('press → %s · timings %s · listed %s organizations', v_p ->> 'says', v_p -> 'timings', jsonb_array_length(v_r -> 'organizations'));
  -- W15 below cuts a second press half way through its Data tables step, measured from this one.
  perform set_config('sn.cut_ms', (coalesce((v_p -> 'timings' ->> 'readiness_ms')::int, 3000)
                                    + greatest(coalesce((v_p -> 'timings' ->> 'data_tables_ms')::int, 1000) / 2, 200))::text || 'ms', false);

  -- A02: after the press the same table id lives in the store — the dataset tool, workflows and integrations follow.
  if (select w.lives_in from custom.where_tables_live(array[v_table]) w) is distinct from 'store' then
    raise exception 'A02 RED: after the press custom.where_tables_live still sends agents to the older table: %',
      (select row_to_json(w)::text from custom.where_tables_live(array[v_table]) w);
  end if;
  v_report := v_report || 'A02 the dataset tool''s routing door: older before the press, store after it'::text;

  -- ── C04: the older doors refuse ──────────────────────────────────────────────────────────────────────────────
  select count(*) into v_n from unnest(platform._final_switch_old_write_doors()) d
   where has_function_privilege('authenticated', d, 'EXECUTE') or has_function_privilege('anon', d, 'EXECUTE');
  if v_n > 0 then raise exception 'C04 RED: % older write doors are still executable by signed-in or anonymous callers after the press', v_n; end if;
  begin
    perform set_config('request.jwt.claims', c_claims, true);
    perform set_config('role', 'authenticated', true);
    perform public.add_data_row_to_user_table(v_table, jsonb_build_object('work_order', v_marker || '-DOOR'));
    raise exception using errcode = 'SNB03', message = 'it took the row';
  exception
    when insufficient_privilege then v_err := sqlerrm;
    when others then
      perform set_config('role', 'postgres', true);
      raise exception 'C04 RED: after the press a signed-in person still reaches add_data_row_to_user_table on a moved table (it answered: %)', sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  begin
    insert into workbench.udt_dataset_rows (table_id, organization_id, user_id, data)
    values (v_table, c_ws, c_admin, jsonb_build_object('work_order', v_marker || '-SERVER'));
    raise exception 'C04 RED: the server path wrote a row into a moved older table';
  exception when check_violation then v_err := sqlerrm;
  end;
  if position('moved to the new system' in v_err) = 0 or position('/data/' || v_table::text in v_err) = 0 then
    raise exception 'C04 RED: the moved-table refusal is not in a person''s words with the copy''s address: %', v_err;
  end if;
  v_report := v_report || format('old door refuses: %s', v_err);

  -- ── C05: lists follow ──────────────────────────────────────────────────────────────────────────────────────
  select count(*) into v_n from workbench.udt_structured_lists l
   where l.organization_id = any (v_plan) and l.deleted_at is null;
  if v_n > 0 then raise exception 'C05 RED: % older pick lists stay live in planned organizations after the press', v_n; end if;
  select count(*) into v_n from workbench.udt_structured_lists l
   where l.organization_id = any (v_plan) and l.deleted_at >= now()
     and not exists (select 1 from custom.record t where t.id = l.id and t.data_class = 'table' and t.deleted_at is null);
  if v_n > 0 then raise exception 'C05 RED: % pick lists archived by the press have no live copy Table', v_n; end if;

  -- ── C06: births in the store only ──────────────────────────────────────────────────────────────────────────
  if coalesce((select value::text from platform.feature_knob where feature = 'data_tables' and key = 'older_tables_moved'), 'absent') <> 'true' then
    raise exception 'C06 RED: after the press the platform value data_tables/older_tables_moved is not true';
  end if;
  begin
    insert into workbench.udt_datasets (table_name, organization_id, user_id, created_by, visibility)
    select 'Front Desk Callbacks — older (must refuse)', c_cedar, c_admin, c_admin, d.visibility from workbench.udt_datasets d limit 1;
    raise exception 'C06 RED: a new older table was born in a switched organization (Cedar Ridge Physical Therapy)';
  exception when check_violation or raise_exception then
    if sqlerrm like 'C06 RED%' then raise; end if;
    v_err := sqlerrm;
  end;
  if position('born in the new system' in v_err) = 0 then
    raise exception 'C06 RED: the refusal of an older birth does not send the person to the new system: %', v_err;
  end if;
  v_report := v_report || format('older birth refused: %s', left(v_err, 160));

  -- ── W10: the two outside foreign keys still land on a table that works ─────────────────────────────────────
  select count(*) into v_n from pg_constraint c
   where c.contype = 'f' and c.confrelid = 'workbench.udt_datasets'::regclass
     and c.conrelid in ('extend.wbx_pattern'::regclass, 'context.scope_dataset_instances'::regclass);
  if v_n < 2 then raise exception 'C13/W10 RED: % of the 2 outside foreign keys onto workbench.udt_datasets remain', v_n; end if;
  select count(*) into v_n from (
    select w.target_user_table_id as t from extend.wbx_pattern w where w.target_user_table_id is not null
    union all
    select i.dataset_id from context.scope_dataset_instances i where i.dataset_id is not null) refs
   where exists (select 1 from workbench.udt_datasets d where d.id = refs.t and d.deleted_at >= now())
     and not exists (select 1 from custom.record c where c.id = refs.t and c.data_class = 'table' and c.deleted_at is null);
  if v_n > 0 then raise exception 'C13/W10 RED: % saved patterns or scope datasets point at a table the press archived that has no live copy', v_n; end if;
  v_report := v_report || 'W10 outside foreign keys: both present; every pointer at a moved table has its live copy'::text;

  -- ── C03: the undo puts everything back ──────────────────────────────────────────────────────────────────────
  -- What one transaction CANNOT prove, said plainly: that the undo carries a person's copy edit back into the older
  -- row. The carry reads each row's history AS OF the press (custom.record_state_as_of), and inside one transaction
  -- every history entry is dated now() — before the press's clock — so an edit here is invisible to it. That proof is
  -- the committed rehearsal (aidream scripts/final_switch_rehearsal/run.sh: write_on_a_copy.sql + verify_carry.sql;
  -- rehearsal 15c 2026-09-30 22:47Z: older WO-5506 = copy WO-5506), registered as check cutover.rehearsal-carry.
  -- Here: the copy still takes a person's edit after the press, and the undo restores tables, doors and the value.
  perform set_config('request.jwt.claims', c_claims, true);
  perform set_config('role', 'authenticated', true);
  perform custom.record_update(c_ws, v_row, jsonb_build_object('work_order', v_marker));
  perform set_config('role', 'postgres', true);
  if (select c.data ->> 'work_order' from custom.record c where c.id = v_row) is distinct from v_marker then
    raise exception 'C03 RED: after the press the copy did not take a person''s edit';
  end if;
  perform set_config('request.jwt.claims', c_claims, true);
  perform set_config('request.headers', c_page, true);
  perform set_config('role', 'authenticated', true);
  v_u := platform.final_switch_undo('safety-net-b chain', true);
  perform set_config('role', 'postgres', true);
  if not coalesce((v_u ->> 'ok')::boolean, false) then raise exception 'C03 RED: the undo refused: %', left(v_u::text, 700); end if;
  if (select d.deleted_at from workbench.udt_datasets d where d.id = v_table) is not null then
    raise exception 'C03 RED: after the undo the older table is still archived';
  end if;
  select count(*) into v_n from unnest(platform._final_switch_old_write_doors()) d where not has_function_privilege('authenticated', d, 'EXECUTE');
  if v_n > 0 then raise exception 'C03 RED: after the undo % older write doors are still closed to signed-in callers', v_n; end if;
  if coalesce((select value::text from platform.feature_knob where feature = 'data_tables' and key = 'older_tables_moved'), 'absent') <> 'false' then
    raise exception 'C03 RED: after the undo the platform value data_tables/older_tables_moved did not return to false';
  end if;
  v_report := v_report || format('undo → %s', left(v_u ->> 'says', 300));

  raise notice E'SWITCH CHAIN GREEN\n  %', array_to_string(v_report, E'\n  ');
end
$chain$;

-- ── W15: a press cut off part way (server replaced, stream dropped) leaves everything as it was ─────────────────
-- The press is ONE database statement: cancelled mid-way, nothing it did survives. Cut it half way through its Data
-- tables step (readiness_ms + data_tables_ms/2 of the chain's own press), then read the state back.
select current_setting('sn.cut_ms', true) as cut_ms \gset
savepoint sn_cut;
select set_config('request.jwt.claims', '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated","session_id":"safety-net-b"}', true),
       set_config('request.headers', '{"origin":"https://manage.aimatrx.com","x-matrx-admin-lane":"1"}', true);
set local statement_timeout = :'cut_ms';
\set ON_ERROR_STOP off
select set_config('role', 'authenticated', true), platform.final_switch_press('safety-net-b W15 cut', null);
\set ON_ERROR_STOP on
rollback to savepoint sn_cut;
set local statement_timeout = '20min';
select set_config('sn.cut_sqlstate', :'LAST_ERROR_SQLSTATE', true);
do $cut$
declare v_n int;
begin
  if current_setting('sn.cut_sqlstate', true) is distinct from '57014' then
    raise exception 'C13/W15 INCONCLUSIVE: the press was not cut (it answered sqlstate %), so a cut press was not observed', current_setting('sn.cut_sqlstate', true);
  end if;
  if coalesce((platform._final_switch_last()).direction, 'old') = 'new' then raise exception 'C13/W15 RED: a cut press left the platform switched'; end if;
  select count(*) into v_n from unnest(platform._final_switch_old_write_doors()) d where not has_function_privilege('authenticated', d, 'EXECUTE');
  if v_n > 0 then raise exception 'C13/W15 RED: a cut press left % older write doors closed', v_n; end if;
  if coalesce((select value::text from platform.feature_knob where feature = 'data_tables' and key = 'older_tables_moved'), 'absent') <> 'false' then
    raise exception 'C13/W15 RED: a cut press left data_tables/older_tables_moved set';
  end if;
  raise notice 'W15 GREEN: a press cancelled at % (sqlstate 57014)', current_setting('sn.cut_ms', true);
  raise notice 'W15: it left the platform on the older side, every door open, the value false';
end
$cut$;

rollback;
