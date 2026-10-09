-- LANE FILE-PARENT-TRUTH - A FILE UNDER A TABLE ROW FOLLOWS ITS ROW; THE SWEEP ASKS THE WHOLE READ POLICY.
-- Proves migrations/campaign/fileparent_a_record_children_follow_their_record.sql on the MAIN database. psql, port 5432.
-- Run AFTER the migration is applied (it holds no DDL: a CREATE TRIGGER inside a long proof transaction would hold
-- SHARE ROW EXCLUSIVE on files.files for minutes; on 2026-10-08 such a run was cancelled). Everything is rolled back.
--  A. Non-record parents: each seat's file set (real RLS, files that name no store row), count:md5. Run it once
--     before the apply with -v only_a=1 (stops after A) and compare.
--  B. 40 synthetic files under store rows (md5 sample, as ENTITY-IDS-2): for admin@admin.com, test@test.com and
--     dd048-joiner, real RLS vs files.has_access_for vs iam.accessible_entity_ids('file') vs std_select alone vs the
--     composed read policy the sweep now evaluates.
--  C. A "360 review meeting notes" Confidential row (shared = false) whose hr_manager is planted as dd048-joiner: files
--     by its owner and by the named hr_manager; inserting a published child, attaching a published file and publishing
--     an existing child are attempted. Seats: owner, named reader, a plain member, a stranger.
--  D. iam.kernel_shadow_sweep's record_parented_file stratum.
-- Example: psql [-v only_a=1] -f scripts/campaign-tests/fileparent_a_record_children_follow_their_record_proof.sql
\timing off
begin isolation level repeatable read;
set local statement_timeout = '600s'; set local transaction_timeout = 0;
create temp table seats (n text, u uuid) on commit drop;
insert into seats values ('admin','87a6e699-3622-4869-8843-d0867456c0dd'),('test','4060701e-706a-4c76-b3ca-0bbc69fa5a14'),('dd048','5ef03742-68ea-41d7-9fa7-f219d001b008');
create temp table nonrec (phase text, seat text, val text) on commit drop; grant all on nonrec to authenticated;
create or replace function pg_temp.nonrec(p_phase text) returns void language plpgsql as $m$
declare s record; v text;
begin
  for s in select * from pg_temp.seats loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) || ':' || md5(coalesce(string_agg(id::text, ',' order by id), '')) into v
      from files.files where parent_record_type is distinct from 'record';
    execute 'reset role';
    insert into pg_temp.nonrec values (p_phase, s.n, v);
  end loop;
end $m$;
select pg_temp.nonrec('now');
\echo '== A. non-record parents: file set per seat'
select seat, val from nonrec order by 1;
\if :{?only_a}
rollback;
\q
\endif

-- B
set local session_replication_role = replica;
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility, published_to_web)
select md5('syn' || r.id)::uuid, r.created_by, r.organization_id, 'syn/' || r.id, 'syn.webm', 's3://syn/' || r.id, 'record', r.id, 'internal', false
  from (select r.id, r.organization_id, r.created_by from custom.record r where r.data_class = 'record' and r.created_by is not null order by md5(r.id::text) limit 40) r;
reset session_replication_role;
create temp table b40 (seat text, f uuid, rls bool, kernel bool, sset bool, std_alone bool, composed bool) on commit drop; grant all on b40 to authenticated;
do $d$ declare s record; v_set uuid[]; v_std text; v_all text; v_f uuid; v1 bool; v2 bool;
begin
  select qual into v_std from pg_policies where schemaname = 'files' and tablename = 'files' and policyname = 'std_select';
  select '(' || string_agg('(' || p.qual || ')', ' or ') filter (where p.permissive = 'PERMISSIVE') || ')'
         || coalesce(' and ' || string_agg('(' || p.qual || ')', ' and ') filter (where p.permissive = 'RESTRICTIVE'), '')
    into v_all from pg_policies p
   where p.schemaname = 'files' and p.tablename = 'files' and p.cmd in ('SELECT', 'ALL') and p.qual is not null
     and p.roles && array['authenticated', 'public']::name[];
  for s in select * from pg_temp.seats loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.u, 'role', 'authenticated')::text, true);
    v_set := iam.accessible_entity_ids('file', 'viewer', 0, true);
    for v_f in select id from files.files where file_path like 'syn/%' loop
      execute format('select exists (select 1 from files.files where id = $1 and (%s))', v_std) into v1 using v_f;
      execute format('select exists (select 1 from files.files where id = $1 and (%s))', v_all) into v2 using v_f;
      insert into pg_temp.b40 values (s.n, v_f, null, coalesce(files.has_access_for(s.u, v_f, 'viewer'), false), v_f = any (coalesce(v_set, '{}')), v1, v2);
    end loop;
    execute 'set local role authenticated';
    update pg_temp.b40 b set rls = exists (select 1 from files.files f where f.id = b.f) where b.seat = s.n;
    execute 'reset role';
  end loop;
end $d$;
\echo '== B. 40 store-row files: agreement per seat (rls = what a client reads)'
select seat, count(*) files, count(*) filter (where rls) rls_yes,
       count(*) filter (where rls = kernel and kernel = sset and sset = composed) all_agree,
       count(*) filter (where std_alone is distinct from kernel) std_alone_disagrees,
       count(*) filter (where std_alone and not kernel and f in (select id from files.files where organization_id in (select iam.archived_org_ids()))) of_which_archived_org
  from b40 group by 1 order by 1;

-- C
select set_config('request.jwt.claims', '', true);
create temp table c (seat text, f text, rls bool, kernel bool, sset bool) on commit drop; grant all on c to authenticated;
create temp table cseats (n text, u uuid) on commit drop;
insert into cseats values ('owner (admin)','87a6e699-3622-4869-8843-d0867456c0dd'),('named hr_manager (dd048)','5ef03742-68ea-41d7-9fa7-f219d001b008'),
  ('plain member (test)','4060701e-706a-4c76-b3ca-0bbc69fa5a14'),('stranger (member elsewhere)','4cf62e4e-2679-484f-b652-034e697418df');
-- plant: the row's hr_manager (a reader field at editor) names dd048-joiner, a member of none of its organization
set local session_replication_role = replica;
update custom.record set data = jsonb_set(data, '{hr_manager}', '"5ef03742-68ea-41d7-9fa7-f219d001b008"')
 where organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f' and id = 'a2423813-95fe-449c-abc7-8c55c2e54c9e';
reset session_replication_role;
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility) values
 ('00000000-0000-4000-8000-0000000000f1','87a6e699-3622-4869-8843-d0867456c0dd','884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f','conf/owner','Review meeting recording.webm','s3://conf/owner','record','a2423813-95fe-449c-abc7-8c55c2e54c9e','internal'),
 ('00000000-0000-4000-8000-0000000000f2','5ef03742-68ea-41d7-9fa7-f219d001b008','884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f','conf/hr_manager','HR manager recording.webm','s3://conf/hr','record','a2423813-95fe-449c-abc7-8c55c2e54c9e','internal');
\echo '== C1. inserting a published file under the Confidential row; attaching a published file to it'
do $p$ begin
  begin
    insert into files.files (created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility)
    values ('5ef03742-68ea-41d7-9fa7-f219d001b008','884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f','conf/x_published','x.webm','s3://conf/x','record','a2423813-95fe-449c-abc7-8c55c2e54c9e','public');
    raise notice 'insert published child: ALLOWED (wrong)';
  exception when insufficient_privilege then raise notice 'insert published child: refused 42501: %', sqlerrm; end;
  begin
    insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, visibility)
    values ('00000000-0000-4000-8000-0000000000f9','5ef03742-68ea-41d7-9fa7-f219d001b008','884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f','conf/y_published','y.webm','s3://conf/y','public');
    update files.files set parent_record_type = 'record', parent_record_id = 'a2423813-95fe-449c-abc7-8c55c2e54c9e' where id = '00000000-0000-4000-8000-0000000000f9';
    raise notice 'attach published file: ALLOWED (wrong)';
  exception when insufficient_privilege then raise notice 'attach published file: refused 42501: %', sqlerrm; end;
end $p$;
select right(file_path, 12) f, visibility, published_to_web from files.files where file_path like 'conf/%' order by 1;
\echo '== C2. publishing an existing child (as its uploader, the named hr_manager)'
do $p$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', '5ef03742-68ea-41d7-9fa7-f219d001b008', 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    update files.files set visibility = 'public' where id = '00000000-0000-4000-8000-0000000000f2'::uuid;
    execute 'reset role';
    raise notice 'publish: ALLOWED (wrong)';
  exception when insufficient_privilege then
    execute 'reset role';
    raise notice 'publish (row column): refused 42501: %', sqlerrm;
  end;
  begin
    execute 'set local role authenticated';
    update files.files set published_to_web = true where id = '00000000-0000-4000-8000-0000000000f2'::uuid;
    execute 'reset role';
    raise notice 'publish (published_to_web): ALLOWED (wrong)';
  exception when insufficient_privilege then
    execute 'reset role';
    raise notice 'publish (published_to_web): refused 42501: %', sqlerrm;
  end;
end $p$;
do $d$ declare s record; v_set uuid[]; begin
  for s in select * from pg_temp.cseats loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.u, 'role', 'authenticated')::text, true);
    v_set := iam.accessible_entity_ids('file', 'viewer', 0, true);
    insert into pg_temp.c select s.n, substr(f.file_path, 6), null, coalesce(files.has_access_for(s.u, f.id, 'viewer'), false), f.id = any (coalesce(v_set, '{}'))
      from files.files f where f.file_path like 'conf/%';
    execute 'set local role authenticated';
    update pg_temp.c o set rls = exists (select 1 from files.files f where f.file_path = 'conf/' || o.f) where o.seat = s.n;
    execute 'reset role';
  end loop; end $d$;
\echo '== C3. who reads the files under the Confidential row'
select f, seat, rls, kernel, sset from c order by f, seat;

-- D
select set_config('request.jwt.claims', '', true);
\echo '== D. kernel shadow sweep, record_parented_file stratum'
select s->>'tables' tables, s->>'rows' rows, s->>'compared' compared, s->>'disagreed' disagreed, s->>'error' error
  from jsonb_array_elements((select iam.kernel_shadow_sweep(1, 30)) -> 'strata') s where s->>'level' = 'record_parented_file';
rollback;
