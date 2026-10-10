-- lane: PAGE-SPEED-3
--
-- based-on: public.search_files(uuid, text, integer, integer, text) 0289fec4d7547878b752e3c249a3f4cafe8cec23802100e86e2fef345bfc57a8
--
-- public.search_files asked files.is_listable_for once per file that matched the text (a crawl-artifact lookup of three tables, then an owner / grant /
-- membership test, ~0.2-1 ms a file; 1.5 s for the member seat's search "a", every search by a person who owns little).
-- files.is_listable_for is exactly: not a crawl artifact AND (the caller created it OR a non-rejected, unexpired grant at viewer or above names the
-- caller or one of the caller's organizations OR a membership of the file confers viewer). That is a SET, so it is read once: the caller's own files
-- plus the (small) shared set, and the crawl-artifact predicate is the set-based one get_user_file_tree and get_org_file_list already use.
-- Anything that is not an ordinary seat (anon, or an authenticated caller whose uid is not p_user_id) keeps the old per-file call, which refuses.
-- Signature, search_path, grants, output keys and the rows each seat sees are unchanged.
-- Inverse: migrations/inverse/pagespeed3_c_search_files_reads_the_shared_set_once_down.sql

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.search_files(p_user_id uuid, p_query text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_mime_prefix text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fast boolean;
begin
  if ( SELECT auth.uid()) is not null and ( SELECT auth.uid()) <> p_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  p_limit := least(greatest(p_limit, 1), 200);

  v_fast := p_user_id is not null
    and case
          when auth.role() = 'anon' then false
          when auth.role() = 'authenticated'
               and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
          else true
        end;

  if not v_fast then
    return coalesce((
      select jsonb_agg(row_to_json(t)::jsonb)
      from (
        select id, file_path, file_name, mime_type, size_bytes, visibility,
               current_version, parent_folder_id, created_by, created_at, updated_at
        from files.files
        where deleted_at is null
          and parent_file_id is null
          and file_path not like 'system-files/%'
          and file_path not like 'generations/%'
          and (p_mime_prefix is null or mime_type like p_mime_prefix || '%')
          and (lower(file_name) like '%' || lower(p_query) || '%'
               or lower(file_path) like '%' || lower(p_query) || '%')
          and files.is_listable_for(p_user_id, id)
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        order by updated_at desc, id
        limit p_limit offset p_offset
      ) t
    ), '[]'::jsonb);
  end if;

  return coalesce((
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
    select jsonb_agg(row_to_json(t)::jsonb)
    from (
      select f.id, f.file_path, f.file_name, f.mime_type, f.size_bytes, f.visibility,
             f.current_version, f.parent_folder_id, f.created_by, f.created_at, f.updated_at
      from files.files f
      where f.deleted_at is null
        and f.parent_file_id is null
        and f.file_path not like 'system-files/%'
        and f.file_path not like 'generations/%'
        and (p_mime_prefix is null or f.mime_type like p_mime_prefix || '%')
        and (lower(f.file_name) like '%' || lower(p_query) || '%'
             or lower(f.file_path) like '%' || lower(p_query) || '%')
        and (f.created_by = p_user_id or f.id in (select s.id from shared s))
        and not (f.metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb
                 or exists (select 1 from web.snapshot ws where ws.body_file_id = f.id or ws.markdown_file_id = f.id)
                 or exists (select 1 from web.screenshot wc where wc.file_id = f.id))
      -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
      order by f.updated_at desc, f.id
      limit p_limit offset p_offset
    ) t
  ), '[]'::jsonb);
end;
$function$;
