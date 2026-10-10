-- lane: PAGE-SPEED-3
--
-- based-on: public.count_user_files(uuid, boolean, boolean) 27193e76ac45fd3bff18ae87c544ad66b853ecec2f4c97ac6f918ce21b207a1a
--
-- public.count_user_files (service_role door) asked files.is_listable_for once per top-level file of the WHOLE table, ~0.2-1 ms each: minutes for the
-- platform as a whole, a timeout for any heavy owner. Same set-based form as pagespeed3_c (search_files): the caller's own files plus the shared set,
-- crawl artifacts removed by the set-based predicate. Signature, grants (service_role only), output keys and counts are unchanged; a caller that is not
-- an ordinary seat keeps the per-file call.
-- Inverse: migrations/inverse/pagespeed3_d_count_user_files_reads_the_shared_set_once_down.sql

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.count_user_files(p_user_id uuid, p_include_folders boolean DEFAULT true, p_include_deleted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
declare v_files int; v_folders int; v_fast boolean;
begin
  if ( SELECT auth.uid()) is not null and ( SELECT auth.uid()) <> p_user_id then
    raise exception 'forbidden: p_user_id does not match ( SELECT auth.uid())' using errcode = '42501';
  end if;

  v_fast := p_user_id is not null
    and case
          when auth.role() = 'anon' then false
          when auth.role() = 'authenticated'
               and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
          else true
        end;

  if v_fast then
    with shared as materialized (
      select p.resource_id as id
        from iam.permissions p
       where p.resource_type = 'file'
         and coalesce(p.status, 'active') <> 'rejected'
         and (p.expires_at is null or p.expires_at > now())
         and p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')
         and (p.granted_to_user_id = p_user_id
              or (p.granted_to_organization_id is not null
                  and p.granted_to_organization_id in (select om.organization_id
                                                         from iam.organization_member om
                                                        where om.user_id = p_user_id)))
      union
      select m.container_id
        from iam.memberships m
        join iam.membership_grant g on g.member_role = m.role and g.container_type in ('file', '*')
       where m.container_type = 'file' and m.user_id = p_user_id and m.deleted_at is null
         and g.confers >= 'viewer'::public.permission_level
    )
    select count(*) into v_files
      from files.files f
     where (p_include_deleted or f.deleted_at is null)
       and f.parent_file_id is null
       and f.file_path not like 'system-files/%'
       and (f.created_by = p_user_id or f.id in (select s.id from shared s))
       and not (f.metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb
                or exists (select 1 from web.snapshot ws where ws.body_file_id = f.id or ws.markdown_file_id = f.id)
                or exists (select 1 from web.screenshot wc where wc.file_id = f.id));
  else
    select count(*) into v_files from files.files f
    where (p_include_deleted or f.deleted_at is null)
      and f.parent_file_id is null
      and f.file_path not like 'system-files/%'
      and files.is_listable_for(p_user_id, f.id);
  end if;

  if p_include_folders then
    select count(*) into v_folders from files.folders d
    where (p_include_deleted or d.deleted_at is null) and d.created_by = p_user_id;
  else
    v_folders := 0;
  end if;
  return jsonb_build_object('files', v_files, 'folders', v_folders, 'total', v_files + v_folders);
end;
$function$;

-- The access decision, declared in data (provision_shape_guard: a SECURITY DEFINER function reaching COMMIT with none is refused). It always had the
-- same one: EXECUTE is held by postgres and service_role only; no client ever calls it (the guard above refuses a seat whose uid is not p_user_id).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
select 'public', 'count_user_files', pg_get_function_identity_arguments(p.oid), platform.door_argtypes(p.proargtypes),
       'p_user_id is the person counted: a caller whose auth.uid() is set and differs is refused (42501); NULL p_user_id counts nothing. No entity-id argument.',
       'pagespeed3_d_count_user_files_reads_the_shared_set_once.sql',
       'server_only: service_role (operator and server jobs) counting one person''s listable files; EXECUTE is revoked from every client role, so no browser ever calls it',
       false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'count_user_files'
   and not exists (select 1 from platform.client_callable_door d where d.schema_name = 'public' and d.function_name = 'count_user_files');
