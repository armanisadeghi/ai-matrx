-- LANE ENTITY-IDS-2 - A FILE READ COSTS WHAT THE PERSON CAN REACH, NOT EVERY RECORD-PARENTED FILE ON THE PLATFORM.
-- Proves migrations/campaign/entityids2_file_reads_cost_what_the_person_reaches.sql on the MAIN database. psql, port 5432.
-- Everything is rolled back. It writes :n synthetic files (deterministic ids and sample, md5 order) whose parent is a
-- store record, across ~1,500 organizations, plus one under every Confidential row, and plants one Confidential row
-- whose reader field names dd048-joiner, a member of none of its organization. Then, for each seat in :seats, it
-- reads: the newest-50 files.files page, the newest-50 files.file_versions page (a component policy: it takes
-- iam.accessible_entity_ids('file') as final), every files.files id (count + md5) and the file set (count + md5).
--   :phase before  with :newfns = an empty file  -> the live functions (entityids_a)
--   :phase after   with :newfns = the migration  -> entityids2
-- The two phases run in separate transactions (each is minutes at 20,000 on the old path; the server's
-- transaction_timeout is lifted for the session); compare the rows by seat. Seats: admin@admin.com
-- 87a6e699-3622-4869-8843-d0867456c0dd, test@test.com 4060701e-706a-4c76-b3ca-0bbc69fa5a14 (member of 1,532
-- organizations), dd048-joiner 5ef03742-68ea-41d7-9fa7-f219d001b008 (member of 3).
-- Example: psql -v n=20000 -v phase=after -v newfns=migrations/campaign/entityids2_file_reads_cost_what_the_person_reaches.sql \
--   -v seats=4060701e-706a-4c76-b3ca-0bbc69fa5a14 -f scripts/campaign-tests/entityids2_file_parents_cost_follows_the_person_proof.sql
\timing off
begin isolation level repeatable read;
set local statement_timeout = '540s'; set local transaction_timeout = 0;
set local session_replication_role = replica;
create temp table syn_par on commit drop as
  (select r.id, r.organization_id, r.created_by from custom.record r
     join custom.record t on t.organization_id=r.organization_id and t.id=r.table_id and t.table_id=custom.table_kernel_id() and t.data->>'level'='confidential'
    where r.data_class='record')
  union
  (select r.id, r.organization_id, r.created_by from custom.record r where r.data_class='record' and r.created_by is not null order by md5(r.id::text) limit :n);
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, created_at, updated_at, visibility, published_to_web)
select md5('syn' || p.id)::uuid, p.created_by, p.organization_id, 'syn/' || p.id, 'syn.webm', 's3://syn/' || p.id, 'record', p.id,
       now() - (random() * interval '365 days'), now() - (random() * interval '365 days'), 'internal', false
  from syn_par p;
-- plant: a Confidential row whose reader field names dd048-joiner (a member of none of its organization)
update custom.record r set data = jsonb_set(r.data, array[(t.data->'readers'->0->>'field')], to_jsonb('5ef03742-68ea-41d7-9fa7-f219d001b008'::text))
  from custom.record t
 where r.id = (select r2.id from custom.record r2 join custom.record t2 on t2.organization_id=r2.organization_id and t2.id=r2.table_id
                where t2.table_id=custom.table_kernel_id() and t2.data->>'level'='confidential' and jsonb_typeof(t2.data->'readers')='array'
                  and r2.data_class='record'
                  and not exists (select 1 from iam.organization_member om where om.organization_id=r2.organization_id and om.user_id='5ef03742-68ea-41d7-9fa7-f219d001b008')
                order by r2.id limit 1)
   and t.organization_id = r.organization_id and t.id = r.table_id;
reset session_replication_role;
analyze files.files;
select count(*) syn_files, count(distinct organization_id) syn_orgs from files.files where parent_record_type='record';
select set_config('mx.proof_seats', :'seats', true);
create temp table res (seat text, form text, what text, val text, ms int) on commit drop;
create or replace function pg_temp.measure(p_form text) returns void language plpgsql as $m$
declare v_seat uuid; v_t timestamptz; v text; v_name text;
begin
  foreach v_seat in array string_to_array(current_setting('mx.proof_seats'), ',')::uuid[] loop
    v_name := case v_seat when '87a6e699-3622-4869-8843-d0867456c0dd' then 'admin' when '4060701e-706a-4c76-b3ca-0bbc69fa5a14' then 'test' else 'dd048' end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_seat, 'role', 'authenticated')::text, true);
    v_t := clock_timestamp(); set local role authenticated;
    select count(*)::text into v from (select id from files.files where deleted_at is null order by updated_at desc, id limit 50) s;
    reset role; insert into pg_temp.res values (v_name, p_form, 'page50', v, extract(epoch from clock_timestamp()-v_t)*1000);
    v_t := clock_timestamp(); set local role authenticated;
    select count(*)::text into v from (select id from files.file_versions order by created_at desc limit 50) s;
    reset role; insert into pg_temp.res values (v_name, p_form, 'versions50', v, extract(epoch from clock_timestamp()-v_t)*1000);
    v_t := clock_timestamp(); set local role authenticated;
    select count(*) || ':' || md5(string_agg(id::text, ',' order by id)) into v from files.files;
    reset role; insert into pg_temp.res values (v_name, p_form, 'files_all', v, extract(epoch from clock_timestamp()-v_t)*1000);
    v_t := clock_timestamp();
    select cardinality(a) || ':' || md5(array_to_string(array(select x from unnest(a) x order by x), ',')) into v
      from (select iam.accessible_entity_ids('file','viewer',0,true) a) q;
    insert into pg_temp.res values (v_name, p_form, 'aei_file', v, extract(epoch from clock_timestamp()-v_t)*1000);
  end loop;
end $m$;
\i :newfns
select pg_temp.measure(:'phase');
select seat, what, val, ms from res order by 1,2;
rollback;
