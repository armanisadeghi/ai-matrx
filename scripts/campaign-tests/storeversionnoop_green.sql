-- LANE STORE-VERSION-NOOP — A WRITE THAT CHANGES NOTHING CHANGES NOTHING. GREEN.
--
-- THE USE CASE. Cascade Backflow Testing certifies backflow-prevention assemblies for water
-- districts. A tester logs each annual test as a Backflow Test Reading ("RP assembly SN 4471-A,
-- 1422 Alder Ct — relief valve opened at 5.9 psi"). Dana — test@test.com — is a tester; she opens
-- a reading, looks at it, and presses Save without changing anything. Then she corrects the
-- pressure for real. Then the office manager (admin) re-saves the "Failed this season" view
-- exactly as it was.
--
-- WHAT WAS WRONG (reproduced on the dev clone 2026-09-23). `platform._touch_row` raises
-- `version` on EVERY update, and the history capture (rightly) writes nothing for an update that
-- changed nothing. So a Save that changed nothing moved the record to version 2 while its history
-- still ended at 1, and every screen that reads the version from the history was one behind and
-- was told "Someone else changed this record" by the very next save. 70 live records on the clone
-- were in that state. The ruling: a write that changes nothing changes nothing — the version does
-- not move, no history row is written, and the door still answers the current version.
--
-- WHAT IT PROVES, from test@test.com's `authenticated` seat through the doors (the few reads of
-- the stored version and of history.row_versions step out to the connected role and say so —
-- the seat has no read of either by design):
--   1  a new reading is version 1 with one history row
--   2  record_update with the SAME pressure against version 1 answers 1; the stored version is 1;
--      history still has one row (before the fix: answered 2, stored 2, history 1)
--   3  the same no-op with no expected version (last-write-wins) answers 1 too
--   4  a REAL change against version 1 answers 2, and history now ends at 2 — they agree
--   5  a no-op against the stale version 1 is still refused PT409 naming version 2 (the client
--      learns the current version; nothing is overwritten)
--   6  field_update that re-sends the Field's own label: the Field record's version and history
--      do not move (the same shape through the Field door)
--   7  view_declare that re-saves a view unchanged: platform.saved_view's version and its
--      history do not move (the same shape on the view store)
--   8  the organization's census: no record whose version is ahead of its history
--
-- Its twin is storeversionnoop_red.sql. RUN IT:  psql "$DSN" -f <this file>  (ends in ROLLBACK)

\set ON_ERROR_STOP on
\set suite 'storeversionnoop_green.sql'
\set requires 'grant:authenticated:custom.record_write|grant:authenticated:custom.record_update|grant:authenticated:custom.field_update|grant:authenticated:custom.view_declare|grant:authenticated:custom.record_history'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

create temporary table _vn (k text primary key, v uuid) on commit drop;
grant select, insert on _vn to authenticated;

-- ═══ FIXTURES, as the connected role — the one shared fixture organization for this lane ═══
do $fx$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana    constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org   uuid := gen_random_uuid();
  v_home  uuid; v_tbl uuid; v_f_psi uuid; v_view uuid;
  v_boss  text := current_user;
begin
  perform set_config('app.actor_system', 'campaign-test/storeversionnoop_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by) values
    (v_org, 'Cascade Backflow Testing', 'cascade-backflow-testing-'||substr(v_org::text,1,8), 'CBT', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status) values
    (v_org,'organization',v_org,c_admin,'owner','active'),
    (v_org,'organization',v_org,c_dana,'member','active');
  insert into platform.knob_override (feature,key,scope_kind,scope_id,organization_id,value,set_note) values
    ('custom','system_enabled','organization',v_org,v_org,'true'::jsonb,'campaign-test/storeversionnoop_green');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name','Cascade Backflow Testing')) returning id into v_home;

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','backflow_test_readings','type','entity','slug','backflow_test_readings',
    'label_singular','Backflow Test Reading','label_plural','Backflow Test Readings',
    'display','list','ordered',false,'weight','light','retention_days',2555,
    'row_order','sorted','agent_writable',true,'title_field','assembly','parent_id',v_home::text,
    'default_sort', jsonb_build_array(jsonb_build_object('field','assembly','direction','asc')),
    'fields', jsonb_build_array(jsonb_build_object('name','assembly','type','text'))));
  v_f_psi := custom.field_declare(v_org, v_tbl, jsonb_build_object(
    'label','Pressure (psi)','key','pressure_psi','type','number'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Result','key','result','type','text'));
  perform custom.share_grant(v_org, v_tbl, 'user', c_dana, 'editor'::public.permission_level);

  -- The office manager's saved view, made through the door so it is a real platform.saved_view row.
  perform set_config('role', 'authenticated', true);
  v_view := custom.view_declare(v_org, v_tbl, jsonb_build_object(
    'name','Failed this season','filters', jsonb_build_object('result','fail')));
  perform set_config('role', v_boss, true);

  insert into _vn values ('org',v_org),('tbl',v_tbl),('f_psi',v_f_psi),('view',v_view),('dana',c_dana);
end $fx$;

-- ═══ THE SEAT ════════════════════════════════════════════════════════════════════════════
do $seat$
declare
  c_dana_j  constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_boss  text := current_user;
  v_org   uuid := (select v from _vn where k='org');
  v_tbl   uuid := (select v from _vn where k='tbl');
  v_f_psi uuid := (select v from _vn where k='f_psi');
  v_view  uuid := (select v from _vn where k='view');
  v_rd    uuid;
  v_ver   int; v_stored int; v_hist int; v_hist_n int;
  v_fver0 int; v_fhist0 int; v_fver1 int; v_fhist1 int;
  v_vver0 int; v_vhist0 int; v_vver1 int; v_vhist1 int;
  st text; m text; d text; v_n int;
begin
  perform set_config('request.jwt.claims', c_dana_j, true);
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;

  -- 1 ── a new reading
  v_rd := custom.record_write(v_org, v_tbl, jsonb_build_object(
            'assembly','RP assembly SN 4471-A, 1422 Alder Ct','pressure_psi',5.9,'result','pass'));
  select max(h.version), count(*) into v_hist, v_hist_n from custom.record_history(v_org, v_rd) h;
  if v_hist is distinct from 1 or v_hist_n <> 1 then
    raise exception '1: a new reading''s history is max % over % rows, not 1 over 1', v_hist, v_hist_n;
  end if;
  raise notice '1 PASSED — the new reading is version 1 with one history row';

  -- 2 ── Save with nothing changed, against version 1
  v_ver := custom.record_update(v_org, v_rd, jsonb_build_object('pressure_psi', 5.9), 1);
  perform set_config('role', v_boss, true);   -- stepping out: the stored version is not a client read
  select version into v_stored from custom.record where organization_id = v_org and id = v_rd;
  select max(version), count(*) into v_hist, v_hist_n from history.row_versions
   where entity_type = 'custom.record' and row_id = v_rd;
  perform set_config('role', 'authenticated', true);
  if v_ver <> 1 or v_stored <> 1 or v_hist <> 1 or v_hist_n <> 1 then
    raise exception '2: a Save that changed nothing answered version %, stored %, history max % over % rows — the version moved and the history did not',
      v_ver, v_stored, v_hist, v_hist_n;
  end if;
  raise notice '2 PASSED — a no-op Save against version 1 answers 1, stores 1, writes no history row';

  -- 3 ── the same no-op, last-write-wins
  v_ver := custom.record_update(v_org, v_rd, jsonb_build_object('pressure_psi', 5.9, 'result', 'pass'), null);
  if v_ver <> 1 then
    raise exception '3: a no-op last-write-wins Save answered version %, not 1', v_ver;
  end if;
  raise notice '3 PASSED — a no-op Save with no expected version answers 1';

  -- 4 ── a real correction
  v_ver := custom.record_update(v_org, v_rd, jsonb_build_object('pressure_psi', 6.1), 1);
  select max(h.version) into v_hist from custom.record_history(v_org, v_rd) h;
  if v_ver <> 2 or v_hist <> 2 then
    raise exception '4: a real change answered version % and history ends at % — they must both be 2', v_ver, v_hist;
  end if;
  raise notice '4 PASSED — a real change is version 2 and history ends at 2';

  -- 5 ── a no-op against a stale version is still a conflict, and names the winner
  begin
    perform custom.record_update(v_org, v_rd, jsonb_build_object('pressure_psi', 6.1), 1);
    raise exception '5: a write against stale version 1 was accepted';
  exception when sqlstate 'PT409' then
    get stacked diagnostics d = pg_exception_detail;
    if (d::jsonb ->> 'current_version')::int <> 2 then
      raise exception '5: the refusal named version % as the winner, not 2 — %', d::jsonb ->> 'current_version', d;
    end if;
  end;
  raise notice '5 PASSED — a no-op against stale version 1 is refused PT409 naming version 2';

  -- 6 ── the Field door: re-sending the Field's own label (the office manager is the owner)
  perform set_config('request.jwt.claims', c_admin_j, true);
  perform set_config('role', v_boss, true);
  select version into v_fver0 from custom.record where organization_id = v_org and id = v_f_psi;
  select count(*) into v_fhist0 from history.row_versions where entity_type = 'custom.record' and row_id = v_f_psi;
  perform set_config('role', 'authenticated', true);
  perform custom.field_update(v_org, v_f_psi, jsonb_build_object('label', 'Pressure (psi)'));
  perform set_config('role', v_boss, true);
  select version into v_fver1 from custom.record where organization_id = v_org and id = v_f_psi;
  select count(*) into v_fhist1 from history.row_versions where entity_type = 'custom.record' and row_id = v_f_psi;
  perform set_config('role', 'authenticated', true);
  if v_fver1 <> v_fver0 or v_fhist1 <> v_fhist0 then
    raise exception '6: field_update with the same label moved the Field from version % to % and its history from % to % rows',
      v_fver0, v_fver1, v_fhist0, v_fhist1;
  end if;
  raise notice '6 PASSED — field_update that changes nothing leaves the Field at version % with % history rows', v_fver1, v_fhist1;

  -- 7 ── the view door: re-saving "Failed this season" exactly as it was
  perform set_config('role', v_boss, true);
  select version into v_vver0 from platform.saved_view where id = v_view;
  select count(*) into v_vhist0 from history.row_versions where entity_type = 'platform_saved_view' and row_id = v_view;
  perform set_config('role', 'authenticated', true);
  perform custom.view_declare(v_org, v_tbl, jsonb_build_object(
    'view_id', v_view, 'name', 'Failed this season', 'filters', jsonb_build_object('result','fail')));
  perform set_config('role', v_boss, true);
  select version into v_vver1 from platform.saved_view where id = v_view;
  select count(*) into v_vhist1 from history.row_versions where entity_type = 'platform_saved_view' and row_id = v_view;
  perform set_config('role', 'authenticated', true);
  if v_vver1 <> v_vver0 or v_vhist1 <> v_vhist0 then
    raise exception '7: re-saving an unchanged view moved it from version % to % and its history from % to % rows',
      v_vver0, v_vver1, v_vhist0, v_vhist1;
  end if;
  raise notice '7 PASSED — view_declare that changes nothing leaves the view at version % with % history rows', v_vver1, v_vhist1;

  -- 8 ── the organization's census
  perform set_config('role', v_boss, true);
  select count(*) into v_n
    from custom.record r
    join lateral (select max(h.version) mv from history.row_versions h
                   where h.entity_type = 'custom.record' and h.row_id = r.id
                     and h.organization_id = r.organization_id) h on h.mv is not null
   where r.organization_id = v_org and r.deleted_at is null and r.version > h.mv;
  perform set_config('role', 'authenticated', true);
  if v_n <> 0 then
    raise exception '8: % record(s) in Cascade Backflow Testing are ahead of their history', v_n;
  end if;
  raise notice '8 PASSED — no record in the organization is ahead of its history';
  raise notice 'storeversionnoop_green: ALL 8 CLAUSES PASSED';
end $seat$;

rollback;
