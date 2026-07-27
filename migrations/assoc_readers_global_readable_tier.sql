-- Class fix: the association READ RPCs (assoc_for_entity / assoc_for_targets /
-- assoc_for_sources) filtered edges with membership-only iam.has_org_access,
-- predating the platform-global tier (iam.system_orgs.global_readable) that
-- iam.has_access_for_base already honors. Any edge whose organization derives
-- from a system-org entity — every seo_keyword edge, since seo.keyword rows
-- default to the Matrx System org — was invisible to every client read (the
-- page analyzer's own keyword edges included). Read-side only: writes still
-- require real access via assoc_add's endpoint checks.

create or replace function iam.org_readable(p_org uuid)
returns boolean
language sql stable
as $$
  select iam.has_org_access(p_org)
      or exists (select 1 from iam.system_orgs s
                  where s.organization_id = p_org and s.global_readable);
$$;
grant execute on function iam.org_readable(uuid) to authenticated, service_role;

create or replace function public.assoc_for_entity(p_type text, p_id uuid)
 returns table(id uuid, direction text, other_type text, other_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select a.id, 'outgoing'::text, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.source_type = p_type and a.source_id = p_id and iam.org_readable(a.organization_id)
  union all
  select a.id, 'incoming'::text, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.target_type = p_type and a.target_id = p_id and iam.org_readable(a.organization_id)
  order by 7 nulls last, 10;
$function$;

create or replace function public.assoc_for_targets(p_target_type text, p_target_ids uuid[])
 returns table(id uuid, target_id uuid, source_type text, source_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select a.id, a.target_id, a.source_type, a.source_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.target_type = p_target_type and a.target_id = any(coalesce(p_target_ids, '{}'::uuid[]))
     and iam.org_readable(a.organization_id)
  order by 7 nulls last, 10;
$function$;

create or replace function public.assoc_for_sources(p_source_type text, p_source_ids uuid[], p_target_type text default null::text)
 returns table(id uuid, source_id uuid, target_type text, target_id uuid, role text, label text, "position" integer, metadata jsonb, organization_id uuid, created_at timestamp with time zone)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select a.id, a.source_id, a.target_type, a.target_id, a.role, a.label, a.position, a.metadata, a.organization_id, a.created_at
    from platform.associations a
   where a.source_type = p_source_type
     and a.source_id = any(coalesce(p_source_ids, '{}'::uuid[]))
     and (p_target_type is null or a.target_type = p_target_type)
     and iam.org_readable(a.organization_id)
  order by 7 nulls last, 10;
$function$;
