-- LANE FILE-PARENT-NARROW - published file: allowed under an Organization-level row, refused (42501) under Confidential/Private.
-- Run AFTER migrations/campaign/fileparent_b_publish_refused_only_under_confidential_or_private.sql. Rolled back. psql, port 5432.
begin;
do $p$
declare v_org_row uuid; v_org uuid; v_priv_row uuid; v_priv_org uuid; v_by uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
begin
  select r.id, r.organization_id into v_org_row, v_org from custom.record r join custom.record t on t.id = r.table_id and t.data_class = 'table'
   where r.data_class = 'record' and coalesce(t.data ->> 'level', 'organization') = 'organization' and r.created_by is not null limit 1;
  select r.id, r.organization_id into v_priv_row, v_priv_org from custom.record r join custom.record t on t.id = r.table_id and t.data_class = 'table'
   where r.data_class = 'record' and t.data ->> 'level' = 'private' limit 1;
  -- 1. Organization-level row: published child allowed
  begin
    insert into files.files (created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility)
    values (v_by, v_org, 'narrow/org_pub', 'o.webm', 's3://narrow/o', 'record', v_org_row, 'public');
    raise notice 'ORGANIZATION row, published child: ALLOWED (right)';
  exception when insufficient_privilege then raise notice 'ORGANIZATION row, published child: REFUSED (wrong): %', sqlerrm; end;
  -- 2. Confidential row: refused 42501 (insert, and publish of an existing child)
  begin
    insert into files.files (created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility)
    values (v_by, '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', 'narrow/conf_pub', 'c.webm', 's3://narrow/c', 'record', 'a2423813-95fe-449c-abc7-8c55c2e54c9e', 'public');
    raise notice 'CONFIDENTIAL row, published child insert: ALLOWED (wrong)';
  exception when insufficient_privilege then raise notice 'CONFIDENTIAL row, published child insert: refused 42501 (right): %', sqlerrm; end;
  insert into files.files (id, created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility)
  values ('00000000-0000-4000-8000-0000000000a1', v_by, '884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', 'narrow/conf_priv', 'c2.webm', 's3://narrow/c2', 'record', 'a2423813-95fe-449c-abc7-8c55c2e54c9e', 'internal');
  begin
    update files.files set published_to_web = true where id = '00000000-0000-4000-8000-0000000000a1';
    raise notice 'CONFIDENTIAL row, publish existing child: ALLOWED (wrong)';
  exception when insufficient_privilege then raise notice 'CONFIDENTIAL row, publish existing child: refused 42501 (right)'; end;
  -- 3. Private row (if one exists)
  if v_priv_row is null then raise notice 'PRIVATE row: none present to try';
  else
    begin
      insert into files.files (created_by, organization_id, file_path, file_name, storage_uri, parent_record_type, parent_record_id, visibility)
      values (v_by, v_priv_org, 'narrow/priv_pub', 'p.webm', 's3://narrow/p', 'record', v_priv_row, 'public');
      raise notice 'PRIVATE row, published child: ALLOWED (wrong)';
    exception when insufficient_privilege then raise notice 'PRIVATE row, published child: refused 42501 (right)'; end;
  end if;
end $p$;
rollback;
