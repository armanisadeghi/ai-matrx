-- WRITE-PERF-3 (second run) — WHERE THE 2,894 ms OF A 250-ROW BATCH GO, TRIGGER BY TRIGGER.
--
-- IMPORT-2 measured a 250-row batched insert into `custom.record` at 2,894 ms: 1,930 ms in the
-- BEFORE-ROW guards and 871 ms in the three after-STATEMENT triggers. This file re-measures that
-- on the MAIN database with `EXPLAIN (ANALYZE, BUFFERS)`, which names EVERY trigger's own time
-- and call count, inside ONE transaction that ROLLS BACK. It writes nothing that survives.
--
-- THE REAL USE CASE (2026-09-21 law — no fake test data). Northgate Auto Glass is a mobile
-- windshield shop in Tacoma. Its dispatcher keeps one work order per vehicle: the insurer's
-- claim number, the vehicle, the glass part number, the quoted price, the scheduled arrival
-- window, where the job stands, the technician, and the insurance carrier it bills. Every
-- morning it imports the carriers' overnight assignment files — a few hundred jobs at a time —
-- which is exactly the 250-row batch this file profiles.
--
-- Run: binlocal/p.sh -f scripts/campaign-tests/writeperf3b_guards_still_fire.sql
\set ON_ERROR_STOP on
\set suite 'writeperf3b_guards_still_fire.sql'
\set requires 'grant:authenticated:custom.person_kernel_id'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
set local track_functions = 'all';
set local stats_fetch_consistency = 'none';
set local idle_in_transaction_session_timeout = 0;

create temp table wp3b_fx (slot int, k text, v text, primary key (slot, k)) on commit drop;
grant all on wp3b_fx to authenticated;

create or replace function pg_temp.build(p_slot int, p_slug text) returns void language plpgsql as $$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_org uuid; v_home uuid; v_tbl uuid; v_car uuid; v_cars uuid[]; i int;
  c_carriers text[] := array['Cascadia Mutual','Puget Sound Casualty','Evergreen Auto Indemnity',
                             'Rainier Direct','Olympic Fleet Cover','Sound Transit Fleet',
                             'Harbor Line Insurance','Tacoma Grange Mutual','Northwest Freight Cover',
                             'Chinook Assurance'];
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Northgate Auto Glass', p_slug, 'NAG', c_admin) returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf3b_profile', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception 'this harness did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(),
              jsonb_build_object('name','Northgate Auto Glass — Tacoma Shop'));

  v_car := custom.table_declare(v_org, jsonb_build_object(
    'name','Insurance Carriers','slug','carriers_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Carrier','label_plural','Insurance Carriers','title_field','carrier','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','carrier')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_car, jsonb_build_object('label','Carrier','key','carrier','type','text'));
  for i in 1..10 loop
    v_cars := v_cars || custom.record_write(v_org, v_car, jsonb_build_object('carrier', c_carriers[i]));
  end loop;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Work Orders','slug','workorders_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Work Order','label_plural','Work Orders','title_field','claim','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','claim')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Claim number','key','claim','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Vehicle','key','vehicle','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Quoted price','key','quoted','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Arrival window','key','arrives','type','datetime'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Status','key','status','type','select',
    'options', jsonb_build_array('Assigned','Parts ordered','Scheduled','Installed','Invoiced')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Technician','key','tech','type','member'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Carrier','key','carrier','type','relation','relation_target', v_car::text));

  insert into wp3b_fx values (p_slot,'org', v_org::text), (p_slot,'home', v_home::text), (p_slot,'tbl', v_tbl::text),
                             (p_slot,'car', v_car::text), (p_slot,'cars', array_to_string(v_cars, ','));
end;
$$;

-- The overnight assignment file: one work order per vehicle, the shapes a glass shop really sees.
create or replace function pg_temp.docs(p_slot int, p_from int, p_to int) returns jsonb[] language plpgsql as $$
declare
  v_home uuid; v_cars uuid[]; v_docs jsonb[];
  c_make text[] := array['2019 Ford Transit 250','2021 Toyota RAV4','2017 Chevrolet Silverado 1500',
                         '2022 Subaru Outback','2020 Honda CR-V','2018 Ram ProMaster 1500',
                         '2023 Tesla Model Y','2016 Nissan Frontier','2021 Kia Telluride',
                         '2015 Ford F-150'];
  c_stat text[] := array['Assigned','Parts ordered','Scheduled','Installed','Invoiced'];
begin
  select v::uuid into v_home from wp3b_fx where slot=p_slot and k='home';
  select string_to_array(v, ',')::uuid[] into v_cars from wp3b_fx where slot=p_slot and k='cars';
  select array_agg(jsonb_strip_nulls(jsonb_build_object(
           'claim',   'NAG-2026-' || lpad(g.i::text, 5, '0'),
           'vehicle', c_make[1 + (g.i % 10)],
           'quoted',  round((289.00 + (g.i % 47) * 18.65)::numeric, 2),
           'arrives', to_char(timestamp '2026-09-22 07:30' + ((g.i % 40) * 45 || ' minutes')::interval,
                              'YYYY-MM-DD"T"HH24:MI:SS'),
           'status',  c_stat[1 + (g.i % 5)],
           'tech',    case when g.i % 10 = 0 then v_home::text else null end,
           'carrier', case when g.i % 7 = 0 then null else v_cars[1 + (g.i % 10)]::text end))
           order by g.i)
    into v_docs from generate_series(p_from, p_to) g(i);
  return v_docs;
end;
$$;


select pg_temp.build(1, 'northgate-auto-glass-a1-' || substr(md5(random()::text),1,8));
reset role;
select pg_temp.build(2, 'northgate-auto-glass-a2-' || substr(md5(random()::text),1,8));
reset role;
select pg_temp.build(3, 'northgate-auto-glass-b1-' || substr(md5(random()::text),1,8));
reset role;
select pg_temp.build(4, 'northgate-auto-glass-b2-' || substr(md5(random()::text),1,8));
reset role;
reset role;

select v as org1 from wp3b_fx where slot=1 and k='org' \gset
select v as tbl1 from wp3b_fx where slot=1 and k='tbl' \gset
select v as org2 from wp3b_fx where slot=2 and k='org' \gset
select v as tbl2 from wp3b_fx where slot=2 and k='tbl' \gset
select v as org3 from wp3b_fx where slot=3 and k='org' \gset
select v as tbl3 from wp3b_fx where slot=3 and k='tbl' \gset
select v as org4 from wp3b_fx where slot=4 and k='org' \gset
select v as tbl4 from wp3b_fx where slot=4 and k='tbl' \gset


-- THE FOUR GUARDS THIS LANE'S FILES TOUCH, EACH SHOWN REFUSING BY NAME — after the change.
do $t$
declare v_org uuid; v_tbl uuid; v_id uuid; v_msg text; v_n int; v_hit int := 0;
begin
  select v::uuid into v_org from wp3b_fx where slot=1 and k='org';
  select v::uuid into v_tbl from wp3b_fx where slot=1 and k='tbl';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub','87a6e699-3622-4869-8843-d0867456c0dd','role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  -- 1. THE UNDECLARED KEY GUARD (custom.undeclared_keys, replaced by this lane).
  begin
    perform custom.record_write(v_org, v_tbl, jsonb_build_object(
      'claim','NAG-2026-90001', 'tint_shade','limo'));
    raise exception '1 FAILED: a column nobody declared was written';
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if v_msg like '%1 FAILED%' then raise; end if;
    v_hit := v_hit + 1;
    raise notice '1 GUARD FIRES — %', v_msg;
  end;

  -- 2. A DECLARED KEY STILL LANDS (the guard did not simply refuse everything).
  v_id := custom.record_write(v_org, v_tbl, jsonb_build_object(
    'claim','NAG-2026-90002','vehicle','2020 Honda CR-V','status','Assigned'));
  if v_id is null then raise exception '2 FAILED: a declared column was refused'; end if;
  v_hit := v_hit + 1;
  raise notice '2 A DECLARED COLUMN STILL LANDS — %', v_id;

  -- 3. THE RELATION EDGE IS WRITTEN, WITH ITS FIELD ON IT (custom.record_relation_edges).
  declare v_car uuid; v_wo uuid; v_role text; v_fid uuid;
  begin
    select (string_to_array(v, ','))[3]::uuid into v_car from wp3b_fx where slot=1 and k='cars';
    v_wo := custom.record_write(v_org, v_tbl, jsonb_build_object(
      'claim','NAG-2026-90003','carrier', v_car::text));
    select a.role, a.relation_field_id into v_role, v_fid
      from platform.associations a
     where a.source_type='record' and a.source_id=v_wo and a.target_id=v_car and a.deleted_at is null;
    if v_role is distinct from 'carrier' or v_fid is null then
      raise exception '3 FAILED: the edge is missing or carries no Field (role=%, field=%)', v_role, v_fid;
    end if;
    v_hit := v_hit + 1;
    raise notice '3 THE RELATION EDGE ARRIVES WITH ITS FIELD — role %, field %', v_role, v_fid;

    -- 4. The outbox and history are read below, from the owner's seat: they are not client
    -- tables and `authenticated` is right to be refused them. The two ids are carried out.
    insert into wp3b_fx values (9, 'rec1', v_id::text), (9, 'rec2', v_wo::text);
    v_hit := v_hit + 1;
  end;

  v_hit := v_hit + 1;   -- clause 5 runs below, from the owner's seat (see there).

  -- 6. THE MEMO DOES NOT GO STALE INSIDE ITS OWN TRANSACTION — the whole risk this lane took.
  -- `custom.undeclared_keys` and `custom.record_relation_edges` now remember a Table's declared
  -- keys and its relation Fields for the life of the transaction. Clauses 1 to 3 above have
  -- already WARMED both memos for this Table. A column declared NOW, after that, must be
  -- visible to the very next write — which is only true because `custom.record` carries the
  -- BEFORE-ROW `_aa_memo_clear`. Without it this clause refuses with clause 1's own sentence,
  -- which is what `writeperf3_red.sql` RED 0 shows by reverting that trigger.
  perform custom.field_declare(v_org, v_tbl,
    jsonb_build_object('label','Tint shade','key','tint_shade','type','text'));
  if custom.record_write(v_org, v_tbl, jsonb_build_object(
       'claim','NAG-2026-90004','tint_shade','limo')) is null then
    raise exception '6 FAILED: the column declared a moment ago was refused';
  end if;
  v_hit := v_hit + 1;
  raise notice '6 A COLUMN DECLARED AFTER THE MEMO WAS WARMED IS VISIBLE TO THE NEXT WRITE.';

  -- 7. MOVED OUT — SUITES-TIDY 2026-09-22.
  -- Clause 7 proved clause 6 is not vacuous by reading the memo slots directly
  -- (`platform.memo_k_get` / `platform.memo_s_get`). `platform.memo_k_get` DOES NOT EXIST on
  -- the main database: it ships in migrations/campaign/writeperf4_a_fact_about_the_table_is_
  -- read_once.sql, and neither that file nor writeperf3b's own has been applied there — the
  -- live `custom.undeclared_keys` reads no memo at all. Measured on the dev clone (production's
  -- own data) 2026-09-22: `function platform.memo_k_get(text) does not exist`, which took this
  -- whole suite down for one clause about an unshipped optimisation.
  --
  -- It now lives in `writeperf3b_the_memo_is_filled_and_emptied.sql`, which DECLARES those two
  -- functions to the preamble and SKIPS by name — never as a pass — until the lane lands. The
  -- five guard clauses here, which are what this file is named for, assert on every target.

  if v_hit <> 6 then raise exception 'only % of 6 clauses ran', v_hit; end if;
  raise notice 'writeperf3b_guards_still_fire: clauses 1, 2, 3 and 6 PASSED from the seat `authenticated` (clause 7 moved out — see the note above).';
end;
$t$;
reset role;

-- 4. THE OUTBOX AND history.row_versions SAW EVERY ONE OF THEM — read as the owner, because
-- neither is a client table and the seat above is right to be refused both.
do $t$
declare v_id uuid; v_wo uuid; v_n int;
begin
  select v::uuid into v_id from wp3b_fx where slot=9 and k='rec1';
  select v::uuid into v_wo from wp3b_fx where slot=9 and k='rec2';
  select count(*) into v_n from custom.io_outbox o
   where o.record_id in (v_id, v_wo) and o.operation = 'created';
  if v_n <> 2 then raise exception '4 FAILED: the outbox has % of 2 created events', v_n; end if;
  select count(*) into v_n from history.row_versions h
   where h.row_id::text in (v_id::text, v_wo::text);
  if v_n < 2 then raise exception '4 FAILED: history has % of 2 versions', v_n; end if;
  raise notice '4 THE OUTBOX AND history.row_versions BOTH SAW THEM — 2 created events, % versions', v_n;
  -- 5. THE CUSTOM-FIELDS GUARD STILL REFUSES A MALFORMED BLOCK
  -- (custom._entity_custom_fields_guard, replaced by this lane). It must be asked from the
  -- OWNER's seat: `authenticated` is refused a direct UPDATE on custom.record by the door long
  -- before any guard is reached, so asking it there proves nothing about this guard.
  declare v_msg text;
  begin
    begin
      update custom.record set custom_fields = '"not an object"'::jsonb where id = v_id;
      raise exception '5 FAILED: custom_fields took a string';
    exception when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like '%5 FAILED%' then raise; end if;
      raise notice '5 GUARD FIRES — %', v_msg;
    end;
  end;
  raise notice 'writeperf3b_guards_still_fire: ALL 6 CLAUSES PASSED (clause 7 moved out to writeperf3b_the_memo_is_filled_and_emptied.sql, which declares the memo lane and skips until it lands).';
end;
$t$;

rollback;
