-- WRITE-PERF-2 — IMPORT's FIVE-THOUSAND-ROW PROOF, RE-RUN.
--
-- Lane IMPORT measured 5,000 rows through `custom.io_import_rows` at 54.6 ms/row on 2026-09-20
-- 15:23Z; lane WRITE-PERF re-ran the same shape at 45.6 ms/row at 21:1xZ. This is the same
-- shape again: ten batches of 500, a dedupe key, 100 rows that are already here and 50 that are
-- refused, read back through `custom.read_records`. It ends in ROLLBACK and leaves nothing.
--
-- `custom.io_import_rows` still calls `custom.record_write` once per row — pointing it at
-- `custom.record_write_many` is the next lane's step and the reason is written in
-- `migrations/campaign/writeperf2_a_batch_of_records_is_one_statement.sql` — so what this
-- measures is the trigger and helper work alone, on the door bulk import actually uses today.
--
-- Run: bin/p.sh -f scripts/campaign-tests/writeperf2_five_thousand.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10min';

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_boss  text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; v_run uuid; v_rows jsonb; v_res jsonb;
  b int; i int; t0 timestamptz; t1 timestamptz;
  v_seen int := 0; v_landed int := 0; v_dupe int := 0; v_bad int := 0; n int;
begin
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Coastal Veterinary Clinic 5K', 'coastal-vet-5k-' || substr(md5(random()::text),1,8), 'CVK', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf2_five_thousand', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('role','authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this harness did not take the seat — current_user is %', current_user;
  end if;

  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','5K Home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Treatment Plans','slug','treatment_plans_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Treatment','label_plural','Treatments','title_field','treatment','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','treatment')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Treatment','key','treatment','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Amount','key','amount','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Closes','key','closes','type','datetime'));

  -- THE HUNDRED THAT ARE ALREADY HERE.
  for i in 1..100 loop
    perform custom.record_write(v_org, v_tbl, jsonb_build_object('treatment','Treatment ' || i, 'amount', 1));
  end loop;

  v_run := (custom.io_import_begin(v_org, v_tbl,
             p_format => 'csv',
             p_source_name => 'writeperf2-5k.csv',
             p_policy => jsonb_build_object('on_duplicate','skip'),
             p_dedupe_key => 'treatment') ->> 'import_id')::uuid;

  t0 := clock_timestamp();
  for b in 0..9 loop
    -- FIFTY REFUSED IN ALL: every hundredth row carries a date nothing can read.
    select jsonb_agg(jsonb_build_object(
             'treatment',   'Treatment ' || g.i,
             'amount', round((g.i * 3.21 + 10)::numeric, 2)::text,
             'closes', case when g.i % 100 = 0 then 'the thirty-first of Smarch'
                            else to_char(date '2026-01-01' + ((g.i % 360) || ' days')::interval, 'YYYY-MM-DD') end)
             order by g.i)
      into v_rows from generate_series(b * 500 + 1, b * 500 + 500) g(i);
    v_res := custom.io_import_rows(v_org, v_run, v_rows);
    v_seen   := v_seen   + (v_res ->> 'rows_seen')::int;
    v_landed := v_landed + (v_res ->> 'rows_written')::int;
    v_dupe   := v_dupe   + (v_res ->> 'rows_duplicate')::int;
    v_bad    := v_bad    + (v_res ->> 'rows_refused')::int;
  end loop;
  t1 := clock_timestamp();

  raise notice 'FIVE THOUSAND ROWS through custom.io_import_rows: % ms total = % ms/row',
    round(extract(epoch from (t1-t0))*1000)::text,
    round((extract(epoch from (t1-t0))*1000/5000)::numeric, 2);
  raise notice '   % seen · % landed · % already here · % refused', v_seen, v_landed, v_dupe, v_bad;

  select count(*) into n from custom.read_records(v_org, v_tbl, true, 1000, 0);
  raise notice '   read back through custom.read_records, first page of the ceiling: % rows', n;
end;
$t$;
rollback;
