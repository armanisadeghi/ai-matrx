-- ENTITY-IDS-4 proof (2026-10-09): repeatable, read-only (one transaction, ROLLED BACK; nothing is kept).
-- Covers the ENTITY-IDS-3 claims and the ENTITY-IDS-4 fixes for files under store rows (parent_record_type = 'record'):
--   E  equivalence, three seats (dd048, test@test.com, admin@admin.com): for every fixture file the kernel
--      (iam.has_access_for 'file'), the files.files read policy and the file set (iam.accessible_entity_ids) agree.
--      Fixture: files under Confidential rows, ordinary rows, rows of archived organizations, system-organization rows,
--      a file of an archived organization under a live row (ENTITY-IDS-4 #4) and a system-organization file under a
--      store row (ENTITY-IDS-3 #3).
--   G  knob guard, the other order: with access/child_parent_asks_ids emptied, attaching a file to a record is refused.
--   S  a system-organization file under a store row the seat cannot open is closed to it (kernel, policy, set).
--   A  a file of an archived organization under a row the seat opens is closed to it (kernel, policy, set).
--   U  a published file is unpublished when its row's Table becomes Confidential, when its row moves into a
--      Confidential Table, and when the row it already names is CREATED in a Confidential Table.
--   L  Anyone links: refused for a Confidential row and for a file under one (create_share_link, ensure_anyone_link,
--      re-activation); named-person shares still insert; existing links are turned off on Table-level change, row move,
--      row creation and file move; a turned-off link resolves as 'revoked'.
--   M  a person who can edit a file and open both rows moves it to a row no file names yet (was a wrong denial), and
--      is still refused moving it to a row they cannot open.
-- Run: psql "$DB" -X -v ON_ERROR_STOP=1 -f scripts/campaign-tests/entityids4_file_parent_proof.sql
-- Ends with ENTITYIDS4 PROOF: ALL PASS, or raises naming the failed checks.
\pset format unaligned
\set VERBOSITY default
begin;
set local statement_timeout = '590s';
create temp table results(chk text, pass boolean, detail text) on commit drop;
grant all on results to authenticated;

-- ── fixture ────────────────────────────────────────────────────────────────
create temp table seats(tag text, uid uuid) on commit drop;
insert into seats values ('dd', '5ef03742-68ea-41d7-9fa7-f219d001b008'),
                         ('test', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'),
                         ('admin', '87a6e699-3622-4869-8843-d0867456c0dd');
-- org 884d1ce8 (admin + test are members) has the Confidential Table a261e070 (owner admin)
create temp table fx on commit drop as
select t.organization_id org, t.id tid,
       (array(select r.id from custom.record r where r.organization_id = t.organization_id and r.table_id = t.id
                and r.data_class = 'record' and r.deleted_at is null order by r.id limit 6)) rows,
       'a261e070-6e44-4ab9-837c-7f6df75db3da'::uuid conf_tid,
       (select r.id from custom.record r where r.organization_id = t.organization_id
           and r.table_id = 'a261e070-6e44-4ab9-837c-7f6df75db3da' and r.data_class = 'record' and r.deleted_at is null
         order by r.id limit 1) conf_row,
       '87a6e699-3622-4869-8843-d0867456c0dd'::uuid admin_uid,
       '4060701e-706a-4c76-b3ca-0bbc69fa5a14'::uuid test_uid,
       (select o.id from iam.organizations o where o.archived_at is not null order by o.id limit 1) arch_org,
       (select so.organization_id from iam.system_orgs so where so.global_readable limit 1) sys_org
  from custom.record t
 where t.organization_id = '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f' and t.table_id = custom.table_kernel_id()
   and t.data_class = 'table' and t.deleted_at is null and t.created_by = '87a6e699-3622-4869-8843-d0867456c0dd'
   and coalesce(t.data ->> 'level', '') not in ('confidential', 'private')
   and custom._table_approver(t.organization_id, t.data) = 'org_admin'
   and (select count(*) from custom.record r where r.organization_id = t.organization_id and r.table_id = t.id
          and r.data_class = 'record' and r.deleted_at is null) >= 6
 order by t.id limit 1;
grant all on fx to authenticated;
-- a row test cannot open (outside test's organizations, not published)
create temp table fx2 on commit drop as
select r.id closed_row, r.organization_id closed_org from custom.record r
 where r.data_class = 'record' and r.deleted_at is null and not r.published_to_web
   and r.organization_id not in (select organization_id from iam.organization_member where user_id = '4060701e-706a-4c76-b3ca-0bbc69fa5a14')
   and r.organization_id not in (select organization_id from iam.system_orgs)
   and r.organization_id not in (select id from iam.organizations where archived_at is not null)
 order by md5(r.id::text) limit 1;
grant all on fx2 to authenticated;
select 'fixture' w, org, tid, cardinality(rows) nrows, conf_row, arch_org, sys_org, (select closed_row from fx2) closed_row from fx;

create temp table par(id uuid, org uuid, owner uuid, cat text) on commit drop;
insert into par select r.id, r.organization_id, r.created_by, 'conf' from custom.record r
  join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id and t.table_id = custom.table_kernel_id()
   and t.data ->> 'level' = 'confidential' where r.data_class = 'record' and r.created_by is not null order by r.id limit 30;
insert into par select r.id, r.organization_id, r.created_by, 'org' from custom.record r
  where r.data_class = 'record' and r.created_by is not null order by md5(r.id::text) limit 60;
insert into par select r.id, r.organization_id, r.created_by, 'arch' from custom.record r
  join iam.organizations o on o.id = r.organization_id and o.archived_at is not null
  where r.data_class = 'record' and r.created_by is not null order by md5(r.id::text) limit 10;
insert into par select r.id, r.organization_id, r.created_by, 'sys' from custom.record r
  where r.organization_id in (select organization_id from iam.system_orgs where global_readable)
    and r.data_class = 'record' and r.created_by is not null order by md5(r.id::text) limit 10;
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility, published_to_web)
select md5('e4syn' || p.id || p.cat)::uuid, p.owner, p.org, 'syn/e4/' || p.cat || '/' || p.id, 'syn.webm', 's3://syn/e4/' || p.id,
       'record', p.id, 'internal', false
  from (select distinct on (id) * from par order by id, cat) p;
-- ENTITY-IDS-4 #4: a file of an archived organization under a live row of org 884d1ce8 (test and admin open the row)
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility, published_to_web)
select md5('e4arch')::uuid, admin_uid, arch_org, 'syn/e4/archfile', 'syn.webm', 's3://syn/e4/archfile', 'record', rows[1], 'internal', false from fx;
-- ENTITY-IDS-3 #3: a global-readable system-organization file under a row test cannot open
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility, published_to_web)
select md5('e4sys')::uuid, fx.admin_uid, fx.sys_org, 'syn/e4/sysfile', 'syn.webm', 's3://syn/e4/sysfile', 'record', fx2.closed_row, 'internal', false from fx, fx2;
create temp table syn on commit drop as
select f.id, f.parent_record_id pid, split_part(f.file_path, '/', 3) cat from files.files f where f.file_path like 'syn/e4/%';
grant all on syn to authenticated;
select cat, count(*) from syn group by 1 order by 1;

-- ── E: equivalence, three seats ───────────────────────────────────────────
create temp table eq(tag text, id uuid, cat text, k boolean, pol boolean, aei boolean) on commit drop;
grant all on eq to authenticated;
\set tag dd
\set seat 5ef03742-68ea-41d7-9fa7-f219d001b008
\ir entityids4_file_parent_proof_seat.sql
\set tag test
\set seat 4060701e-706a-4c76-b3ca-0bbc69fa5a14
\ir entityids4_file_parent_proof_seat.sql
\set tag admin
\set seat 87a6e699-3622-4869-8843-d0867456c0dd
\ir entityids4_file_parent_proof_seat.sql
insert into results
select 'E equivalence ' || tag, bool_and(k = pol and k = aei),
       format('%s files, kernel yes %s, policy yes %s, set yes %s, disagree %s', count(*), count(*) filter (where k),
              count(*) filter (where pol), count(*) filter (where aei),
              coalesce(jsonb_agg(cat) filter (where not (k = pol and k = aei))::text, '[]'))
  from eq group by tag;
-- S and A, named
insert into results
select 'S system-org file under a closed row, test', not (k or pol or aei), format('kernel %s policy %s set %s', k, pol, aei)
  from eq where tag = 'test' and cat = 'sysfile';
insert into results
select 'A archived-org file under an open row, test', not (k or pol or aei)
       and iam.has_access_for('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record', (select rows[1] from fx), 'viewer'),
       format('row opens %s; file kernel %s policy %s set %s',
              iam.has_access_for('4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'record', (select rows[1] from fx), 'viewer'), k, pol, aei)
  from eq where tag = 'test' and cat = 'archfile';

-- ── G: knob guard (the other order) ───────────────────────────────────────
do $g$
declare v_state text := 'ok';
begin
  begin
    update platform.feature_knob set value = '{"types": []}' where feature = 'access' and key = 'child_parent_asks_ids';
    insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id)
      select md5('e4g')::uuid, admin_uid, org, 'syn/e4g', 'a.webm', 's3://syn/e4g', 'record', rows[2] from fx;
  exception when others then v_state := sqlstate;
  end;
  insert into results values ('G knob emptied refuses a record parent', v_state = '23514', 'sqlstate ' || v_state);
end $g$;

-- ── M: move to a row no file names yet ────────────────────────────────────
-- test edits the file only through its row (a row test created; the file is admin's, no grant on the file), so the
-- read policy's record lane is the only lane that can pass the moved row
create temp table fm on commit drop as
select r.organization_id org, r.id r1,
       (select r2.id from custom.record r2 where r2.organization_id = r.organization_id and r2.created_by = r.created_by
           and r2.data_class = 'record' and r2.deleted_at is null and r2.id <> r.id and r2.table_id = r.table_id
         order by r2.id limit 1) r2
  from custom.record r
  join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id and t.table_id = custom.table_kernel_id()
   and coalesce(t.data ->> 'level', '') not in ('confidential', 'private')
 where r.created_by = '4060701e-706a-4c76-b3ca-0bbc69fa5a14' and r.data_class = 'record' and r.deleted_at is null
   and r.organization_id in (select organization_id from iam.organization_member where user_id = '87a6e699-3622-4869-8843-d0867456c0dd')
   and (select count(*) from custom.record r2 where r2.organization_id = r.organization_id and r2.table_id = r.table_id
          and r2.created_by = r.created_by and r2.data_class = 'record' and r2.deleted_at is null) >= 2
 order by r.id limit 1;
grant all on fm to authenticated;
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility, published_to_web)
  select md5('e4m')::uuid, '87a6e699-3622-4869-8843-d0867456c0dd', org, 'syn/e4m', 'a.webm', 's3://syn/e4m', 'record', r1, 'internal', false from fm;
insert into results
select 'M precheck: test edits the file and opens both rows; the target row is named by no file',
       iam.has_access_for(test_uid, 'file', md5('e4m')::uuid, 'editor')
       and iam.has_access_for(test_uid, 'record', fm.r1, 'viewer')
       and iam.has_access_for(test_uid, 'record', fm.r2, 'viewer')
       and not exists (select 1 from files.files f where f.parent_record_type = 'record' and f.parent_record_id = fm.r2)
       and not iam.has_access_for(test_uid, 'record', (select closed_row from fx2), 'viewer')
       and not exists (select 1 from iam.permissions p where p.resource_type = 'file' and p.resource_id = md5('e4m')::uuid),
       format('edit %s, from %s, to %s, closed %s', iam.has_access_for(test_uid, 'file', md5('e4m')::uuid, 'editor'),
              iam.has_access_for(test_uid, 'record', fm.r1, 'viewer'), iam.has_access_for(test_uid, 'record', fm.r2, 'viewer'),
              iam.has_access_for(test_uid, 'record', (select closed_row from fx2), 'viewer'))
  from fx, fm;
select set_config('request.jwt.claims', json_build_object('sub', '4060701e-706a-4c76-b3ca-0bbc69fa5a14', 'role', 'authenticated')::text, true);
set local role authenticated;
do $m$
declare v_state text := 'ok'; v_n integer := 0;
begin
  begin
    update files.files set parent_record_id = (select r2 from fm) where id = md5('e4m')::uuid;
    get diagnostics v_n = row_count;
  exception when others then v_state := sqlstate;
  end;
  insert into results values ('M move to a fresh row the person opens is allowed', v_state = 'ok' and v_n = 1,
                              format('sqlstate %s, rows %s', v_state, v_n));
  v_state := 'ok'; v_n := 0;
  begin
    update files.files set parent_record_id = (select closed_row from fx2) where id = md5('e4m')::uuid;
    get diagnostics v_n = row_count;
  exception when others then v_state := sqlstate;
  end;
  insert into results values ('M move to a row the person cannot open is refused', v_state = '42501',
                              format('sqlstate %s, rows %s', v_state, v_n));
end $m$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ── U + L: unpublish and Anyone links ─────────────────────────────────────
-- U1/L2: rows[3] gets a published file + Anyone links on the row and the file; the Table becomes Confidential
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, published_to_web)
  select md5('e4u1')::uuid, admin_uid, org, 'syn/e4u1', 'a.webm', 's3://syn/e4u1', 'record', rows[3], true from fx;
-- U2/L3: rows[4] gets a published file + link; the row moves into the Confidential Table
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, published_to_web)
  select md5('e4u2')::uuid, admin_uid, org, 'syn/e4u2', 'a.webm', 's3://syn/e4u2', 'record', rows[4], true from fx;
-- U3/L4: a published file + link name a row id that does not exist yet; the row is then created in the Confidential Table
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, published_to_web)
  select md5('e4u3')::uuid, admin_uid, org, 'syn/e4u3', 'a.webm', 's3://syn/e4u3', 'record', md5('e4futurerow')::uuid, true from fx;
-- L5: a file with a link (unpublished) under rows[5] moves under the Confidential row
insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, published_to_web)
  select md5('e4l5')::uuid, admin_uid, org, 'syn/e4l5', 'a.webm', 's3://syn/e4l5', 'record', rows[5], false from fx;
create temp table lk(name text, token text) on commit drop;
insert into lk select 'u1row', platform.ensure_anyone_link('record', rows[3], admin_uid, org) from fx;
insert into lk select 'u1file', platform.ensure_anyone_link('file', md5('e4u1')::uuid, admin_uid, org) from fx;
insert into lk select 'u2file', platform.ensure_anyone_link('file', md5('e4u2')::uuid, admin_uid, org) from fx;
insert into lk select 'u3file', platform.ensure_anyone_link('file', md5('e4u3')::uuid, admin_uid, org) from fx;
insert into lk select 'l5file', platform.ensure_anyone_link('file', md5('e4l5')::uuid, admin_uid, org) from fx;
update lk set token = (select l.token from platform.share_links l where l.id = lk.token::uuid);
insert into results select 'L0 links active before', bool_and(l.is_active), count(*)::text
  from lk join platform.share_links l on l.token = lk.token;
-- row move (U2)
update custom.record set table_id = (select conf_tid from fx) where organization_id = (select org from fx) and id = (select rows[4] from fx);
-- row creation in the Confidential Table (U3): a copy of the Confidential row under the id the file already names
insert into custom.record
select (jsonb_populate_record(null::custom.record, to_jsonb(r) || jsonb_build_object('id', md5('e4futurerow')::uuid))).*
  from custom.record r where r.organization_id = (select org from fx) and r.id = (select conf_row from fx);
-- file move (L5)
update files.files set parent_record_id = (select conf_row from fx) where id = md5('e4l5')::uuid;
-- the Table becomes Confidential through its door (U1), as its owner
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select custom.set_table_confidential((select tid from fx), '[]'::jsonb, 'ENTITY-IDS-4 proof, rolled back') ->> 'level' door_level;
select set_config('request.jwt.claims', '', true);
insert into results
select 'U unpublished: ' || f.file_path, not f.published_to_web, format('published %s', f.published_to_web)
  from files.files f where f.id in (md5('e4u1')::uuid, md5('e4u2')::uuid, md5('e4u3')::uuid);
insert into results
select 'L turned off: ' || lk.name, not l.is_active and (public.resolve_share_token(lk.token) ->> 'error') = 'revoked',
       format('active %s, resolves %s', l.is_active, public.resolve_share_token(lk.token) ->> 'error')
  from lk join platform.share_links l on l.token = lk.token;

-- L refusals: creation by the owner, the helper, and re-activation
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
insert into results
select 'L refuse create_share_link on the Confidential row', not coalesce((j ->> 'success')::boolean, false), j ->> 'error'
  from (select public.create_share_link('record', (select conf_row from fx)) j) x;
insert into results
select 'L refuse create_share_link on a file under it', not coalesce((j ->> 'success')::boolean, false), j ->> 'error'
  from (select public.create_share_link('file', md5('e4l5')::uuid) j) x;
select set_config('request.jwt.claims', '', true);
do $l$
declare v_state text := 'ok';
begin
  begin
    perform platform.ensure_anyone_link('file', md5('e4u1')::uuid, (select admin_uid from fx), (select org from fx));
  exception when others then v_state := sqlstate;
  end;
  insert into results values ('L refuse ensure_anyone_link on a file under a Confidential row', v_state = '42501', 'sqlstate ' || v_state);
  v_state := 'ok';
  begin
    update platform.share_links set is_active = true where token = (select token from lk where name = 'u1row');
  exception when others then v_state := sqlstate;
  end;
  insert into results values ('L refuse re-activating a turned-off link', v_state = '42501', 'sqlstate ' || v_state);
  v_state := 'ok';
  begin
    insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, status)
      values ('file', md5('e4l5')::uuid, (select test_uid from fx), 'viewer', 'active');
  exception when others then v_state := sqlstate;
  end;
  insert into results values ('L named-person share on a file under a Confidential row still inserts', v_state = 'ok', 'sqlstate ' || v_state);
end $l$;

insert into results
select 'L control: an ordinary row''s file still gets an Anyone link',
       platform.ensure_anyone_link('file', md5('e4m')::uuid, admin_uid, org) is not null, 'ok' from fx;

-- ── verdict ───────────────────────────────────────────────────────────────
select chk, pass, detail from results order by pass, chk;
do $v$
declare v_bad text;
begin
  select string_agg(chk, '; ') into v_bad from results where not pass;
  if v_bad is not null then raise exception 'ENTITYIDS4 PROOF: FAILED — %', v_bad; end if;
  if (select count(*) from results) < 20 then raise exception 'ENTITYIDS4 PROOF: only % checks ran', (select count(*) from results); end if;
  raise notice 'ENTITYIDS4 PROOF: ALL PASS (% checks)', (select count(*) from results);
end $v$;
rollback;
