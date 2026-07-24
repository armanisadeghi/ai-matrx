-- Shared Knowledge P3 (day-1 DB slice) + Decision 2 gate fix (2026-07-23)
--
-- 1. public.library_grant_provenance(p_store)        — frozen contract, README §2
--    public.library_grant_provenance_batch(p_stores) — batch form for the catalog (N stores, 1 round-trip)
--    Both return ONLY the grants that reach auth.uid() — never the full grant list.
--    Audience logic mirrors public.user_can_read_data_store_via_grant; do not fork a third reader.
-- 2. rag.fn_list_library_catalog — adds the caller's true entitlement state per row:
--    entitled_via ('organization'|'industry'|'global'|null) + industry name/slug.
--    Catalog still lists every discoverable+active store (that is what a catalog is for);
--    the chip is what differs per caller.
-- 3. rag.fn_list_data_store_grants — Decision 2 (settled 2026-07-23): the ONE rule is
--    super-admin OR store owner (created_by). The owning-org-member branch is removed.
--    The aidream HTTP twin gets the same rule (P2).
--
-- Security shape (D-I): SECURITY DEFINER, no caller-supplied actor, EXECUTE revoked from
-- anon/public, granted to authenticated + service_role.

-- ---------------------------------------------------------------------------
-- 1a. Single-store provenance
-- ---------------------------------------------------------------------------
create or replace function public.library_grant_provenance(p_store uuid)
returns table(
  audience text,
  industry_id uuid,
  industry_name text,
  industry_slug text,
  organization_id uuid
)
language sql
stable
security definer
set search_path to 'public', 'rag', 'iam'
as $$
  select g.audience, g.industry_id, i.name, i.slug, g.organization_id
  from rag.data_store_grants g
  left join iam.industries i on i.id = g.industry_id
  where g.data_store_id = p_store
    and auth.uid() is not null
    and (
      g.audience = 'global'
      or (g.audience = 'organization'
          and g.organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = auth.uid()))
      or (g.audience = 'industry'
          and exists (
            select 1
            from iam.org_industries oi
            join iam.organization_member om
              on om.organization_id = oi.organization_id
            where om.user_id = auth.uid()
              and oi.industry_id = g.industry_id))
    );
$$;

revoke all on function public.library_grant_provenance(uuid) from public, anon;
grant execute on function public.library_grant_provenance(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1b. Batch provenance
-- ---------------------------------------------------------------------------
create or replace function public.library_grant_provenance_batch(p_stores uuid[])
returns table(
  store_id uuid,
  audience text,
  industry_id uuid,
  industry_name text,
  industry_slug text,
  organization_id uuid
)
language sql
stable
security definer
set search_path to 'public', 'rag', 'iam'
as $$
  select g.data_store_id, g.audience, g.industry_id, i.name, i.slug, g.organization_id
  from rag.data_store_grants g
  left join iam.industries i on i.id = g.industry_id
  where g.data_store_id = any(p_stores)
    and auth.uid() is not null
    and (
      g.audience = 'global'
      or (g.audience = 'organization'
          and g.organization_id in (
            select om.organization_id
            from iam.organization_member om
            where om.user_id = auth.uid()))
      or (g.audience = 'industry'
          and exists (
            select 1
            from iam.org_industries oi
            join iam.organization_member om
              on om.organization_id = oi.organization_id
            where om.user_id = auth.uid()
              and oi.industry_id = g.industry_id))
    );
$$;

revoke all on function public.library_grant_provenance_batch(uuid[]) from public, anon;
grant execute on function public.library_grant_provenance_batch(uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Catalog with per-caller entitlement (return type changes → drop first)
-- ---------------------------------------------------------------------------
drop function if exists rag.fn_list_library_catalog(uuid);

create function rag.fn_list_library_catalog(p_organization_id uuid default null::uuid)
returns table(
  id uuid,
  name text,
  short_code text,
  description text,
  kind text,
  member_count bigint,
  subscribed boolean,
  entitled_via text,
  entitled_industry_name text,
  entitled_industry_slug text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if p_organization_id is not null
     and auth.role() <> 'service_role'
     and not iam.has_org_access(p_organization_id) then
    raise exception 'organization access required' using errcode = '42501';
  end if;

  return query
  select
    store.id,
    store.name,
    store.short_code,
    store.description,
    store.kind,
    coalesce(member_count.count, 0),
    p_organization_id is not null and exists (
      select 1
      from rag.data_store_grants as grant_row
      where grant_row.data_store_id = store.id
        and grant_row.audience = 'organization'
        and grant_row.organization_id = p_organization_id
    ),
    ent.via,
    ent.ind_name,
    ent.ind_slug
  from rag.data_stores as store
  left join (
    select member.data_store_id, count(*) as count
    from rag.data_store_members as member
    where member.deleted_at is null
    group by member.data_store_id
  ) as member_count on member_count.data_store_id = store.id
  left join lateral (
    -- caller's strongest entitlement route; mirrors public.user_can_read_data_store_via_grant
    select
      case
        when bool_or(g.audience = 'organization') then 'organization'
        when bool_or(g.audience = 'industry') then 'industry'
        when bool_or(g.audience = 'global') then 'global'
      end as via,
      (array_agg(i.name order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_name,
      (array_agg(i.slug order by g.created_at) filter (where g.audience = 'industry'))[1] as ind_slug
    from rag.data_store_grants g
    left join iam.industries i on i.id = g.industry_id
    where g.data_store_id = store.id
      and v_user is not null
      and (
        g.audience = 'global'
        or (g.audience = 'organization'
            and g.organization_id in (
              select om.organization_id
              from iam.organization_member om
              where om.user_id = v_user))
        or (g.audience = 'industry'
            and exists (
              select 1
              from iam.org_industries oi
              join iam.organization_member om
                on om.organization_id = oi.organization_id
              where om.user_id = v_user
                and oi.industry_id = g.industry_id))
      )
  ) as ent on true
  where store.discoverable
    and store.is_active
  order by store.name;
end;
$function$;

revoke all on function rag.fn_list_library_catalog(uuid) from public, anon;
grant execute on function rag.fn_list_library_catalog(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Grant-list gate — Decision 2: super-admin OR store owner, nothing else
-- ---------------------------------------------------------------------------
create or replace function rag.fn_list_data_store_grants(p_store_id uuid)
returns table(
  id uuid,
  audience text,
  industry_id uuid,
  industry_name text,
  industry_slug text,
  organization_id uuid,
  organization_name text
)
language plpgsql
stable
security definer
set search_path to 'public', 'rag', 'iam'
as $function$
declare
  v_user uuid := auth.uid();
begin
  -- Decision 2 (settled 2026-07-23): issuance is an admin act. Only a super-admin or the
  -- store's owner may enumerate where a library is published. The aidream HTTP endpoint
  -- applies this same rule — change both together or neither.
  if not (
    public.is_super_admin()
    or exists (
      select 1 from rag.data_stores s
       where s.id = p_store_id
         and s.created_by = v_user
    )
  ) then
    raise exception 'insufficient permission on data_store';
  end if;

  return query
  select g.id, g.audience, g.industry_id, i.name, i.slug, g.organization_id, o.name
  from rag.data_store_grants g
  left join iam.industries i on i.id = g.industry_id
  left join iam.organizations o on o.id = g.organization_id
  where g.data_store_id = p_store_id
  order by g.audience, g.created_at;
end;
$function$;

revoke all on function rag.fn_list_data_store_grants(uuid) from public, anon;
grant execute on function rag.fn_list_data_store_grants(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
