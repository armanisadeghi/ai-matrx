-- One seat of entityids4_file_parent_proof.sql (\ir'd with :tag and :seat set): the kernel, the files.files read
-- policy and the file set, for every fixture file in temp table syn, into temp table eq.
select set_config('request.jwt.claims', json_build_object('sub', :'seat', 'role', 'authenticated')::text, true);
create temp table a_:tag on commit drop as select unnest(iam.accessible_entity_ids('file', 'viewer', 0, true)) id;
grant all on a_:tag to authenticated;
set local role authenticated;
create temp table p_:tag on commit drop as select f.id from files.files f where f.file_path like 'syn/e4/%';
reset role;
insert into eq
select :'tag', s.id, s.cat, coalesce(iam.has_access_for(:'seat'::uuid, 'file', s.id, 'viewer'), false),
       s.id in (select id from p_:tag), s.id in (select id from a_:tag)
  from syn s;
select set_config('request.jwt.claims', '', true);
