-- Canonical crawler artifact access matrix. Run against Matrx Main inside the
-- transaction below; it leaves no rows behind.

begin;

do $$
declare
  v_site web.site%rowtype;
  v_file_id uuid := gen_random_uuid();
  v_orphan_file_id uuid := gen_random_uuid();
  v_malformed_file_id uuid := gen_random_uuid();
  v_session_id uuid := gen_random_uuid();
  v_other_session_id uuid := gen_random_uuid();
  v_page_id uuid := gen_random_uuid();
  v_snapshot_id uuid := gen_random_uuid();
  v_external_user uuid;
  v_private_org_member uuid;
  v_permission_id uuid := gen_random_uuid();
  v_file_name text := 'crawl-access-test-' || gen_random_uuid()::text || '.html';
  v_count_before integer;
  v_rejected boolean;
begin
  select s.* into v_site
  from web.site s
  where s.deleted_at is null
    and s.visibility = 'private'
    and s.created_by is not null
    and exists (
      select 1
      from iam.memberships m
      where m.container_type = 'organization'
        and m.container_id = s.organization_id
        and m.user_id <> s.created_by
        and m.deleted_at is null
        and m.status = 'active'
        and not iam.has_access_for(m.user_id, 'web_site', s.id, 'viewer')
    )
  order by s.created_at
  limit 1;

  if v_site.id is null then
    raise exception 'artifact access test requires one private site with a non-owner org member';
  end if;

  select m.user_id into v_private_org_member
  from iam.memberships m
  where m.container_type = 'organization'
    and m.container_id = v_site.organization_id
    and m.user_id <> v_site.created_by
    and m.deleted_at is null
    and m.status = 'active'
    and not iam.has_access_for(m.user_id, 'web_site', v_site.id, 'viewer')
  limit 1;

  select u.id into v_external_user
  from auth.users u
  where u.id <> v_site.created_by
    and u.id <> v_private_org_member
    and not iam.has_access_for(u.id, 'web_site', v_site.id, 'viewer')
  order by u.created_at
  limit 1;

  if v_external_user is null then
    raise exception 'artifact access test requires one unrelated user';
  end if;

  v_count_before := (public.count_user_files(v_external_user, false, false) ->> 'files')::integer;

  insert into files.files (
    id, created_by, file_path, file_name, mime_type, size_bytes, checksum,
    visibility, metadata, organization_id, storage_uri
  ) values (
    v_file_id,
    v_external_user,
    'crawl-access-test/body.html',
    v_file_name,
    'text/html',
    4,
    encode(digest('test', 'sha256'), 'hex'),
    'private',
    jsonb_build_object(
      'system_artifact', true,
      'system_immutable', true,
      'artifact_domain', 'web_crawl',
      'web_site_id', v_site.id,
      'crawl_session_id', v_session_id
    ),
    v_site.organization_id,
    's3://access-test/transaction-only'
  );

  insert into web.crawl_session (
    id, organization_id, created_by, site_id, status, trigger
  ) values (
    v_session_id, v_site.organization_id, v_site.created_by,
    v_site.id, 'complete', 'manual'
  );

  insert into web.page (
    id, organization_id, created_by, site_id, url, url_hash, provenance
  ) values (
    v_page_id, v_site.organization_id, v_site.created_by, v_site.id,
    'https://crawl-access-test.invalid/' || v_page_id::text,
    encode(digest(v_page_id::text, 'sha256'), 'hex'),
    'crawl'
  );

  insert into web.snapshot (
    id, organization_id, created_by, site_id, page_id, session_id,
    final_url, body_file_id
  ) values (
    v_snapshot_id, v_site.organization_id, v_site.created_by, v_site.id, v_page_id,
    v_session_id, 'https://crawl-access-test.invalid/', v_file_id
  );

  if not files.has_access_for(v_site.created_by, v_file_id, 'viewer') then
    raise exception 'site/file owner must read crawler artifact';
  end if;

  -- Updating context without changing the file ID must revalidate the full
  -- artifact tuple. A second valid session FK still mismatches file metadata.
  insert into web.crawl_session (
    id, organization_id, created_by, site_id, status, trigger
  ) values (
    v_other_session_id, v_site.organization_id, v_site.created_by,
    v_site.id, 'complete', 'manual'
  );
  v_rejected := false;
  begin
    update web.snapshot set session_id = v_other_session_id
    where id = v_snapshot_id;
  exception when check_violation or object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'snapshot context changed without artifact revalidation';
  end if;
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'web.snapshot'::regclass
      and t.tgname = 'snapshot_validate_artifact_files'
      and pg_get_triggerdef(t.oid) like '%UPDATE OF%'
  ) then
    raise exception 'snapshot artifact validation trigger ignores context-only updates';
  end if;

  -- Soft-deleted evidence remains classified/immutable but no longer conveys
  -- a live read grant.
  alter table web.snapshot disable trigger user;
  update web.snapshot set deleted_at = now() where id = v_snapshot_id;
  alter table web.snapshot enable trigger user;
  if files.has_access_for(v_site.created_by, v_file_id, 'viewer') then
    raise exception 'soft-deleted snapshot still conveyed artifact access';
  end if;
  alter table web.snapshot disable trigger user;
  update web.snapshot set deleted_at = null where id = v_snapshot_id;
  alter table web.snapshot enable trigger user;
  if not files.has_access_for(v_site.created_by, v_file_id, 'viewer') then
    raise exception 'restored active snapshot did not restore artifact access';
  end if;
  if files.has_access_for(v_site.created_by, v_file_id, 'editor')
     or files.has_access_for(v_site.created_by, v_file_id, 'admin') then
    raise exception 'crawl artifact relationship must not convey editor/admin';
  end if;
  if files.has_access_for(v_private_org_member, v_file_id, 'viewer') then
    raise exception 'ordinary org membership must not open a private-site artifact';
  end if;
  update web.site set visibility = 'internal' where id = v_site.id;
  if not files.has_access_for(v_private_org_member, v_file_id, 'viewer') then
    raise exception 'internal-site org member must inherit viewer access';
  end if;
  update web.site set visibility = 'private' where id = v_site.id;
  if files.has_access_for(v_private_org_member, v_file_id, 'viewer') then
    raise exception 'returning site to private must immediately revoke org-member access';
  end if;
  if files.has_access_for(v_external_user, v_file_id, 'viewer') then
    raise exception 'historical file owner without site access must not read crawler artifact';
  end if;
  if iam.has_access_for(v_external_user, 'file', v_file_id, 'viewer') then
    raise exception 'generic IAM file dispatch bypassed crawler artifact revocation';
  end if;
  if files.has_access_for(null, v_file_id, 'viewer') then
    raise exception 'anonymous actor must not read crawler artifact';
  end if;
  if not exists (
    select 1
    from pg_policy p
    where p.polrelid = 'files.files'::regclass
      and p.polname = 'std_select'
      and pg_get_expr(p.polqual, p.polrelid) like '%files.has_access_for%'
  ) then
    raise exception 'files.files RLS is not routed through the canonical file judge';
  end if;

  insert into iam.permissions (
    id, resource_type, resource_id, granted_to_user_id,
    permission_level, created_by, status
  ) values (
    v_permission_id, 'web_site', v_site.id, v_external_user,
    'viewer', v_site.created_by, 'active'
  );

  if not files.has_access_for(v_external_user, v_file_id, 'viewer') then
    raise exception 'explicit site viewer must read contextual crawler artifact';
  end if;
  if files.is_discoverable_for(v_external_user, v_file_id, 'viewer')
     or files.is_discoverable_for(v_site.created_by, v_file_id, 'viewer') then
    raise exception 'contextual crawler artifact must not enter Files discovery';
  end if;
  if public.get_user_file_tree(v_external_user) @>
       jsonb_build_array(jsonb_build_object('id', v_file_id))
     or public.search_files(v_external_user, v_file_name) @>
       jsonb_build_array(jsonb_build_object('id', v_file_id))
     or public.get_org_file_list(v_external_user, v_site.organization_id) @>
       jsonb_build_array(jsonb_build_object('id', v_file_id)) then
    raise exception 'crawler artifact leaked through a canonical Files list RPC';
  end if;
  if (public.count_user_files(v_external_user, false, false) ->> 'files')::integer
       <> v_count_before then
    raise exception 'crawler artifact changed the canonical Files count';
  end if;

  delete from iam.permissions where id = v_permission_id;

  if files.has_access_for(v_external_user, v_file_id, 'viewer') then
    raise exception 'revoked site viewer must immediately lose artifact access';
  end if;

  -- Missing relationships fail closed instead of restoring historical-owner
  -- access. This orphan exists only inside this transaction.
  insert into files.files (
    id, created_by, file_path, file_name, mime_type, size_bytes, checksum,
    visibility, metadata, organization_id, storage_uri
  ) values (
    v_orphan_file_id,
    v_external_user,
    'crawl-access-test/orphan.html',
    'orphan-' || v_file_name,
    'text/html',
    4,
    encode(digest('orphan', 'sha256'), 'hex'),
    'public',
    jsonb_build_object(
      'system_artifact', true,
      'system_immutable', true,
      'artifact_domain', 'web_crawl',
      'web_site_id', v_site.id,
      'crawl_session_id', v_session_id
    ),
    v_site.organization_id,
    's3://access-test/orphan-transaction-only'
  );
  if files.has_access_for(v_external_user, v_orphan_file_id, 'viewer')
     or iam.has_access_for(v_external_user, 'file', v_orphan_file_id, 'viewer')
     or files.is_discoverable_for(v_external_user, v_orphan_file_id, 'viewer')
     or iam.is_discoverable(v_external_user, 'file', v_orphan_file_id, 'viewer') then
    raise exception 'orphan crawler artifact fell back to owner/discovery access';
  end if;
  perform set_config('test.crawl_orphan_id', v_orphan_file_id::text, true);

  -- Malformed user metadata is ordinary metadata, never an exception/DoS.
  insert into files.files (
    id, created_by, file_path, file_name, mime_type, size_bytes, checksum,
    visibility, metadata, organization_id, storage_uri
  ) values (
    v_malformed_file_id, v_external_user,
    'crawl-access-test/malformed.html', 'malformed-' || v_file_name,
    'text/html', 4, encode(digest('malformed', 'sha256'), 'hex'), 'private',
    '{"system_artifact":"not-a-boolean","system_immutable":{"bad":true},"artifact_domain":"web_crawl"}'::jsonb,
    v_site.organization_id, 's3://access-test/malformed-transaction-only'
  );
  if files.is_crawl_artifact(v_malformed_file_id) then
    raise exception 'malformed metadata was classified as a crawler artifact';
  end if;
  perform public.count_user_files(v_external_user, false, false);

  -- Explicit-user predicates remain caller-bound for browser callers.
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_private_org_member)::text,
    true
  );
  if files.has_access_for(
       v_site.created_by, v_file_id, 'viewer'
     ) or files.is_discoverable_for(
       v_site.created_by, v_malformed_file_id, 'viewer'
     ) then
    raise exception 'authenticated caller impersonated another user in Files predicate';
  end if;
  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);

  if exists (
    select 1 from platform.associations
    where source_type = 'file' and target_type = 'web_site'
  ) then
    raise exception 'crawler artifacts must not use platform associations';
  end if;
end
$$;

set local role anon;
do $$
begin
  if exists (
    select 1 from files.files
    where id = current_setting('test.crawl_orphan_id')::uuid
  ) then
    raise exception 'anonymous RLS exposed a public metadata-marked crawler artifact';
  end if;
end
$$;
reset role;

do $$
begin
  if has_function_privilege(
       'anon', 'public.count_user_files(uuid,boolean,boolean)', 'execute'
     ) or has_function_privilege(
       'anon', 'public.get_org_file_list(uuid,uuid)', 'execute'
     ) or has_function_privilege(
       'anon', 'public.search_files(uuid,text,integer,integer,text)', 'execute'
     ) or has_function_privilege(
       'anon',
       'public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)',
       'execute'
     ) then
    raise exception 'anonymous role can execute a SECURITY DEFINER Files listing RPC';
  end if;
  if has_function_privilege(
       'anon', 'files.has_access_for(uuid,uuid,public.permission_level)', 'execute'
     ) or has_function_privilege(
       'anon', 'files.is_crawl_artifact(uuid)', 'execute'
     ) or has_function_privilege(
       'anon', 'files.is_discoverable_for(uuid,uuid,public.permission_level)', 'execute'
     ) or has_function_privilege(
       'anon', 'iam.is_discoverable(uuid,text,uuid,public.permission_level)', 'execute'
     ) then
    raise exception 'anonymous role can execute an explicit-user artifact predicate';
  end if;
  if has_function_privilege(
       'authenticated', 'files.is_crawl_artifact(uuid)', 'execute'
     ) or has_function_privilege(
       'authenticated',
       'files.is_discoverable_for(uuid,uuid,public.permission_level)',
       'execute'
     ) then
    raise exception 'authenticated role can execute an internal artifact helper';
  end if;
end
$$;

do $$
declare
  v_snapshot web.snapshot%rowtype;
  v_wrong_file_id uuid;
  v_rejected boolean := false;
begin
  select s.* into v_snapshot
  from web.snapshot s
  order by s.created_at desc
  limit 1;
  if v_snapshot.id is null then
    raise exception 'tenant mismatch test requires one snapshot fixture';
  end if;

  select f.id into v_wrong_file_id
  from files.files f
  where f.organization_id <> v_snapshot.organization_id
    and f.deleted_at is null
  limit 1;
  if v_wrong_file_id is null then
    raise exception 'tenant mismatch test requires one cross-organization file';
  end if;

  begin
    insert into web.snapshot (
      organization_id, created_by, site_id, page_id, session_id,
      final_url, body_file_id
    ) values (
      v_snapshot.organization_id,
      v_snapshot.created_by,
      v_snapshot.site_id,
      v_snapshot.page_id,
      v_snapshot.session_id,
      v_snapshot.final_url,
      v_wrong_file_id
    );
  exception
    when foreign_key_violation or check_violation then
      v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'cross-organization artifact FK was accepted';
  end if;
end
$$;

rollback;
