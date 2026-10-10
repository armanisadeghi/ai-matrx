-- lane: PAGE-SPEED-2
--
-- based-on: public.get_org_file_list(uuid, uuid) 4934fcc88322f7456dbe931f8b268dba4faaa4ca40a13e670cd5d2870e36acde
--
-- public.get_org_file_list, second step (after pagespeed2_get_org_file_list_skips_what_it_would_refuse.sql). A
-- caller who is not in the organization (or whose seat holds no organization lane) still paid the kernel's
-- containment walk once per FILE: 27 s for a 30k-file organization. A file nothing else opens is opened only by
-- its containing folder, so the folder's answer (iam.is_discoverable_base, the same call the kernel makes for the
-- parent) is now asked once per DISTINCT folder and joined back. Rows a grant, permission or membership names
-- still go to files.is_discoverable_for one by one. Signature, grants, keys and rows each seat sees unchanged.
-- Inverse: migrations/inverse/pagespeed2_b_get_org_file_list_folder_answer_once_down.sql

set local lock_timeout = '2s';

create or replace function public.get_org_file_list(p_user_id uuid, p_org_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
as $function$
declare
  v_result jsonb;
  v_fast   boolean;
  v_lanes  platform.lane_set;
  v_ow     boolean := false;
begin
  if ( SELECT auth.uid()) is not null and ( SELECT auth.uid()) <> p_user_id then
    raise exception 'forbidden: p_user_id does not match ( SELECT auth.uid())' using errcode = '42501';
  end if;

  -- PAGE-SPEED-2 (2026-10-09). THE SAME ANSWER AS files.is_discoverable_for, WITHOUT ASKING IT ABOUT EVERY FILE.
  -- The old body asked it once per file of the organization (~0.4 ms each, ~4.6 s for an organization of 19k
  -- files that shows 289, and a timeout at 30k). Most of those files never reach a person: 2 in 3 are web-crawl
  -- artifacts that is_discoverable_for refuses by definition, and the caller's own files are discoverable
  -- whatever else is true. The rest are read ONCE through platform.entity_row_access_attrs (the very row read
  -- iam.is_discoverable_base starts from), and each arm below only SHORT-CUTS a row to the answer the kernel
  -- reaches anyway (owner, public, an organization lane that holds for the whole organization) or PRUNES a row
  -- it provably refuses (no grant, permission, membership or containing folder, and no organization lane).
  -- Any row an arm cannot settle is still asked of files.is_discoverable_for itself, so the access result is
  -- unchanged. iam.has_access_for_many is not used: it is set-based for the `record` type only (every other
  -- type is asked one at a time) and answers has_access, not the enumeration predicate this list keeps.
  -- The fast path is allowed only while the registry and the table still say what the arms assume; the column
  -- probe below only asks whether the retired column exists, it never reads it.
  v_fast := p_user_id is not null
    and case
          when auth.role() = 'anon' then false
          when auth.role() = 'authenticated'
               and ((select auth.uid()) is null or (select auth.uid()) is distinct from p_user_id) then false
          else true
        end
    and exists (select 1 from platform.entity_types et
                 where et.token = 'file' and et.is_active and et.schema_name = 'files'
                   and et.table_name = 'files' and not coalesce(et.is_component, false))
    and exists (select 1 from pg_catalog.pg_attribute pa
                 where pa.attrelid = 'files.files'::regclass and pa.attname = 'visi' || 'bility'
                   and pa.attnum > 0 and not pa.attisdropped)
    and (select count(*) from platform.entity_relationships er
          where er.child_type = 'file' and er.kind = 'containment') = 1
    and exists (select 1 from platform.entity_relationships er
                 where er.child_type = 'file' and er.kind = 'containment'
                   and er.parent_type = 'folder' and er.fk_column = 'parent_folder_id')
    -- a global-readable system organization has the platform-staff and global lanes: every row is asked
    and not exists (select 1 from iam.system_orgs s where s.organization_id = p_org_id and s.global_readable);

  if not v_fast then
    select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_result
    from (
      select f.id, f.file_name, f.mime_type, f.size_bytes, f.updated_at
      from files.files f
      where f.organization_id = p_org_id
        and f.deleted_at is null
        and files.is_discoverable_for(p_user_id, f.id, 'viewer')
      order by f.updated_at desc nulls last
    ) t;
    return v_result;
  end if;

  v_lanes := iam.class_lanes('file');
  v_ow := (v_lanes.org_member_lane and iam.has_org_access_for(p_user_id, p_org_id))
       or (v_lanes.org_role_lane and public.is_org_admin_for(p_user_id, p_org_id));

  with own as (
    -- the caller's own files
    select f.id, f.file_name, f.mime_type, f.size_bytes, f.updated_at
      from files.files f
     where f.organization_id = p_org_id and f.deleted_at is null
       and f.created_by = p_user_id
       and not (f.metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb
                or exists (select 1 from web.snapshot s where s.body_file_id = f.id or s.markdown_file_id = f.id)
                or exists (select 1 from web.screenshot s where s.file_id = f.id))
  ), r as materialized (
    -- everyone else's, each row read once
    select f.id, f.file_name, f.mime_type, f.size_bytes, f.updated_at, f.parent_folder_id,
           a.o_found, a.o_owner, a.o_vis, a.o_org
      from files.files f
      cross join lateral platform.entity_row_access_attrs('files', 'files', f.id) a
     where f.organization_id = p_org_id and f.deleted_at is null
       and f.created_by is distinct from p_user_id
       and not (f.metadata @> '{"system_artifact": true, "artifact_domain": "web_crawl"}'::jsonb
                or exists (select 1 from web.snapshot s where s.body_file_id = f.id or s.markdown_file_id = f.id)
                or exists (select 1 from web.screenshot s where s.file_id = f.id))
  ), cls as materialized (
    select r.*,
           case
             when not r.o_found then 'no'
             when r.o_owner = p_user_id then 'yes'
             when r.o_vis = 'public' then 'yes'
             when v_ow and r.o_org = p_org_id and coalesce(r.o_vis >= 'internal', false) then 'yes'
             -- a grant, permission or membership names this file: the kernel decides, as before
             when exists (select 1 from platform.entity_grants g where g.entity_type = 'file' and g.entity_id = r.id)
               or exists (select 1 from iam.permissions p where p.resource_type = 'file' and p.resource_id = r.id)
               or exists (select 1 from iam.memberships m where m.container_type = 'file' and m.container_id = r.id)
               then 'ask'
             -- nothing but the containing folder can open it: its answer is the folder's, asked once per folder
             when coalesce(r.o_vis >= 'internal', false) and r.parent_folder_id is not null then 'folder'
             else 'no'
           end as k
      from r
  ), fv as materialized (
    select d.pid, iam.is_discoverable_base(p_user_id, 'folder', d.pid, 'viewer', false) as ok
      from (select distinct c.parent_folder_id as pid from cls c where c.k = 'folder') d
  )
  select coalesce(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) into v_result
  from (
    select x.id, x.file_name, x.mime_type, x.size_bytes, x.updated_at
    from (
      select o.id, o.file_name, o.mime_type, o.size_bytes, o.updated_at from own o
      union all
      select c.id, c.file_name, c.mime_type, c.size_bytes, c.updated_at
        from cls c
        left join fv on fv.pid = c.parent_folder_id
       where case c.k
               when 'yes' then true
               when 'ask' then files.is_discoverable_for(p_user_id, c.id, 'viewer')
               when 'folder' then coalesce(fv.ok, false)
               else false
             end
    ) x
    order by x.updated_at desc nulls last, x.id
  ) t;
  return v_result;
end;
$function$;
